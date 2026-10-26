import * as THREE from 'three';
import { Chunk } from './Chunk';
import { WorldGenerator } from './WorldGenerator';
import { NetherGenerator } from './NetherGenerator';
import { EndGenerator } from './EndGenerator';
import { Dimension, ChunkGenerator } from './Dimension';
import { LightEngine } from './LightEngine';
import { ChunkMesher } from '../rendering/ChunkMesher';
import { TextureAtlas } from '../textures/TextureAtlas';
import { BlockType, isBlockSolid, LIGHT_EMISSION } from '../blocks/BlockTypes';
import { CHUNK_SIZE, RENDER_DISTANCE, WORLD_HEIGHT, SHADOW_LAYER } from '../utils/constants';
import { ChestManager } from './ChestManager';
import { StructureTypeName, StructureLocation } from './StructureGenerator';
import { chunkKey, worldToChunk } from '../utils/math';
import type { BiomeSystem } from './BiomeSystem';

export class World {
  readonly scene: THREE.Scene;
  private chunks: Map<string, Chunk> = new Map();
  private readonly terrainMeshes: Map<string, THREE.Mesh> = new Map();
  private readonly waterMeshes: Map<string, THREE.Mesh> = new Map();
  /** Modified chunks that were unloaded; restored when walking back (per dimension) */
  private readonly saved: Map<string, Uint8Array> = new Map();

  private readonly overworldGen: WorldGenerator;
  private readonly netherGen: NetherGenerator;
  private readonly endGen: EndGenerator;
  private generator: ChunkGenerator;
  dimension: Dimension = Dimension.OVERWORLD;

  private readonly mesher: ChunkMesher;
  private readonly light: LightEngine = new LightEngine();
  readonly atlas: TextureAtlas;
  private terrainMaterial!: THREE.Material;
  private waterMaterial!: THREE.Material;
  renderDistance: number = RENDER_DISTANCE;

  /** Called whenever a chunk is created from scratch (not restored from a save) */
  onChunkGenerated: ((chunk: Chunk) => void) | null = null;

  constructor(scene: THREE.Scene, terrainMaterial: THREE.Material, waterMaterial: THREE.Material, atlas: TextureAtlas, chestManager?: ChestManager) {
    this.scene = scene;
    this.terrainMaterial = terrainMaterial;
    this.waterMaterial = waterMaterial;
    this.atlas = atlas;
    this.overworldGen = new WorldGenerator(chestManager);
    this.netherGen = new NetherGenerator(chestManager);
    this.endGen = new EndGenerator();
    this.generator = this.overworldGen;
    this.mesher = new ChunkMesher(this.atlas);
    this.mesher.setBiomeSystem(this.overworldGen.biomeSystem);
  }

  private readonly MAX_CHUNKS_GEN_PER_FRAME = 2;
  private readonly MAX_CHUNKS_MESH_PER_FRAME = 2;

  /** Does this dimension have a sky (sun light reaching the ground)? */
  get hasSky(): boolean {
    return this.dimension !== Dimension.NETHER;
  }

  private saveKey(key: string): string {
    return `${this.dimension}:${key}`;
  }

  private ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;
    chunk = new Chunk(cx, cz);
    const saved = this.saved.get(this.saveKey(key));
    if (saved) {
      chunk.blocks.set(saved);
      chunk.modified = true;
      this.saved.delete(this.saveKey(key));
    } else {
      this.generator.generateChunk(chunk);
      if (this.onChunkGenerated) this.onChunkGenerated(chunk);
    }
    this.chunks.set(key, chunk);
    return chunk;
  }

  private hasAllNeighbours(cx: number, cz: number): boolean {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
      }
    }
    return true;
  }

  update(playerX: number, playerZ: number): void {
    const pcx = worldToChunk(Math.floor(playerX), CHUNK_SIZE);
    const pcz = worldToChunk(Math.floor(playerZ), CHUNK_SIZE);
    const genR = this.renderDistance + 1;

    let generated = 0;
    outer:
    for (let ring = 0; ring <= genR; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
          if (dx * dx + dz * dz > genR * genR) continue;
          const cx = pcx + dx, cz = pcz + dz;
          if (!this.chunks.has(chunkKey(cx, cz))) {
            this.ensureChunk(cx, cz);
            generated++;
            if (generated >= this.MAX_CHUNKS_GEN_PER_FRAME) break outer;
          }
        }
      }
    }

    // Mesh nearest dirty chunks first (only when all 8 neighbours exist, so
    // lighting and face culling are exact across chunk borders)
    let meshed = 0;
    const candidates: { key: string; chunk: Chunk; d: number }[] = [];
    for (const [key, chunk] of this.chunks) {
      if (!chunk.dirty) continue;
      const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
      let d = dx * dx + dz * dz;
      if (d > this.renderDistance * this.renderDistance) continue;
      // on maille d'abord ce que le joueur regarde
      if (d > 4 && dx * this.viewX + dz * this.viewZ < 0) d *= 3;
      if (!this.hasAllNeighbours(chunk.cx, chunk.cz)) continue;
      candidates.push({ key, chunk, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const c of candidates) {
      this.rebuildChunkMesh(c.key, c.chunk);
      meshed++;
      if (meshed >= this.MAX_CHUNKS_MESH_PER_FRAME) break;
    }

    const unloadDist = this.renderDistance + 3;
    const toDelete: string[] = [];
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > unloadDist * unloadDist) {
        this.removeChunkMeshes(key);
        if (chunk.modified) this.saved.set(this.saveKey(key), chunk.blocks);
        toDelete.push(key);
      }
    }
    for (const key of toDelete) this.chunks.delete(key);
  }

  private readonly _frustum = new THREE.Frustum();
  private readonly _pv = new THREE.Matrix4();
  private readonly _box = new THREE.Box3();
  private viewX = 0;
  private viewZ = 0;

  /**
   * Culling par la vision : les chunks hors du champ de vision restent en mémoire
   * (déjà maillés) mais sont rendus invisibles → aucun coût GPU (caméra, ombres, profondeur).
   * Les chunks proches restent toujours visibles pour garder des ombres cohérentes.
   */
  updateVisibility(camera: THREE.PerspectiveCamera, nearChunks = 2): void {
    this._pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._pv);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.viewX = dir.x; this.viewZ = dir.z;
    const ccx = Math.floor(camera.position.x / CHUNK_SIZE);
    const ccz = Math.floor(camera.position.z / CHUNK_SIZE);
    const apply = (meshes: Map<string, THREE.Mesh>): void => {
      for (const [key, mesh] of meshes) {
        const c = this.chunks.get(key);
        if (!c) continue;
        const dx = c.cx - ccx, dz = c.cz - ccz;
        if (dx * dx + dz * dz <= nearChunks * nearChunks) { mesh.visible = true; continue; }
        const g = mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        this._box.copy(g.boundingBox!).expandByScalar(3);
        mesh.visible = this._frustum.intersectsBox(this._box);
      }
    };
    apply(this.terrainMeshes);
    apply(this.waterMeshes);
  }

  forceLoadAll(playerX: number, playerZ: number): void {
    const pcx = worldToChunk(Math.floor(playerX), CHUNK_SIZE);
    const pcz = worldToChunk(Math.floor(playerZ), CHUNK_SIZE);
    const R = this.renderDistance + 1;
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        if (dx * dx + dz * dz > R * R) continue;
        this.ensureChunk(pcx + dx, pcz + dz);
      }
    }
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > this.renderDistance * this.renderDistance) continue;
      if (chunk.dirty && this.hasAllNeighbours(chunk.cx, chunk.cz)) this.rebuildChunkMesh(key, chunk);
    }
  }

  /** Load only the chunks needed around a point, without meshing (used for portal search) */
  preloadAround(wx: number, wz: number, radiusChunks: number): void {
    const pcx = worldToChunk(Math.floor(wx), CHUNK_SIZE);
    const pcz = worldToChunk(Math.floor(wz), CHUNK_SIZE);
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) this.ensureChunk(pcx + dx, pcz + dz);
    }
  }

  /** Switch to another dimension. All loaded chunks are stored away / dropped. */
  setDimension(dim: Dimension): void {
    if (dim === this.dimension) return;
    for (const [key, chunk] of this.chunks) {
      this.removeChunkMeshes(key);
      if (chunk.modified) this.saved.set(this.saveKey(key), chunk.blocks);
    }
    this.chunks = new Map();
    this.dimension = dim;
    switch (dim) {
      case Dimension.OVERWORLD: this.generator = this.overworldGen; break;
      case Dimension.NETHER: this.generator = this.netherGen; break;
      case Dimension.END: this.generator = this.endGen; break;
    }
    this.mesher.setBiomeSystem(this.generator.biomeSystem);
  }

  private rebuildChunkMesh(key: string, chunk: Chunk): void {
    this.light.compute(chunk, (cx, cz) => this.chunks.get(chunkKey(cx, cz)), this.hasSky);
    const result = this.mesher.buildMesh(chunk, (wx, wy, wz) => this.getBlock(wx, wy, wz), this.light);
    this.removeChunkMeshes(key);

    if (result.terrain) {
      const mesh = new THREE.Mesh(result.terrain, this.terrainMaterial);
      mesh.frustumCulled = true;
      mesh.layers.enable(SHADOW_LAYER);
      this.scene.add(mesh);
      this.terrainMeshes.set(key, mesh);
    }
    if (result.water) {
      const mesh = new THREE.Mesh(result.water, this.waterMaterial);
      mesh.frustumCulled = true;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.waterMeshes.set(key, mesh);
    }
    chunk.dirty = false;
  }

  private removeChunkMeshes(key: string): void {
    const tm = this.terrainMeshes.get(key);
    if (tm) { this.scene.remove(tm); tm.geometry.dispose(); this.terrainMeshes.delete(key); }
    const wm = this.waterMeshes.get(key);
    if (wm) { this.scene.remove(wm); wm.geometry.dispose(); this.waterMeshes.delete(key); }
  }

  /** Is the chunk containing this column loaded? */
  isLoaded(wx: number, wz: number): boolean {
    return this.chunks.has(chunkKey(worldToChunk(Math.floor(wx), CHUNK_SIZE), worldToChunk(Math.floor(wz), CHUNK_SIZE)));
  }

  getBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0 || wy >= WORLD_HEIGHT) return BlockType.AIR;
    const cx = worldToChunk(Math.floor(wx), CHUNK_SIZE);
    const cz = worldToChunk(Math.floor(wz), CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return BlockType.AIR;
    const lx = ((Math.floor(wx) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((Math.floor(wz) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, Math.floor(wy), lz);
  }

  setBlock(wx: number, wy: number, wz: number, type: BlockType): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const fwx = Math.floor(wx), fwy = Math.floor(wy), fwz = Math.floor(wz);
    const cx = worldToChunk(fwx, CHUNK_SIZE), cz = worldToChunk(fwz, CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return;
    const lx = ((fwx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((fwz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const old = chunk.getBlock(lx, fwy, lz);
    chunk.setBlock(lx, fwy, lz, type);
    chunk.modified = true;

    // Neighbouring chunks need a remesh when the edit touches their border,
    // or (for light sources) whenever it is close enough to light them.
    const reach = (LIGHT_EMISSION[old] > 0 || LIGHT_EMISSION[type] > 0) ? 14 : 1;
    const minLX = lx, maxLX = CHUNK_SIZE - 1 - lx, minLZ = lz, maxLZ = CHUNK_SIZE - 1 - lz;
    const nearW = minLX < reach, nearE = maxLX < reach, nearN = minLZ < reach, nearS = maxLZ < reach;
    if (nearW) this.markDirty(cx - 1, cz);
    if (nearE) this.markDirty(cx + 1, cz);
    if (nearN) this.markDirty(cx, cz - 1);
    if (nearS) this.markDirty(cx, cz + 1);
    if (nearW && nearN) this.markDirty(cx - 1, cz - 1);
    if (nearE && nearN) this.markDirty(cx + 1, cz - 1);
    if (nearW && nearS) this.markDirty(cx - 1, cz + 1);
    if (nearE && nearS) this.markDirty(cx + 1, cz + 1);
  }

  private markDirty(cx: number, cz: number): void {
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk) chunk.dirty = true;
  }

  isSolid(wx: number, wy: number, wz: number): boolean {
    return isBlockSolid(this.getBlock(wx, wy, wz));
  }

  isWater(wx: number, wy: number, wz: number): boolean {
    return this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)) === BlockType.WATER;
  }

  isLava(wx: number, wy: number, wz: number): boolean {
    return this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)) === BlockType.LAVA;
  }

  findNearestStructure(px: number, pz: number, typeName: StructureTypeName): StructureLocation | null {
    if (this.dimension !== Dimension.OVERWORLD) return null;
    return this.overworldGen.findNearestStructure(px, pz, typeName);
  }

  /** Terrain height of the overworld (for spawn search, portals...) */
  getOverworldHeight(wx: number, wz: number): number {
    return this.overworldGen.getTerrainHeight(wx, wz);
  }

  get biomeSystem(): BiomeSystem | null {
    return this.generator.biomeSystem;
  }
}
