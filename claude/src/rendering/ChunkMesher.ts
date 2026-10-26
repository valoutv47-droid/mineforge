import * as THREE from 'three';
import { Chunk } from '../world/Chunk';
import {
  BlockType, isBlockSolid, isBlockTransparent, isBlockCrossShaped, BLOCK_DEFINITIONS,
} from '../blocks/BlockTypes';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../utils/constants';
import { TextureAtlas } from '../textures/TextureAtlas';
import { BiomeSystem } from '../world/BiomeSystem';
import { LightEngine } from '../world/LightEngine';

// CCW winding, corners 0-1 at top (v=1), 2-3 at bottom (v=0)
const FACES = [
  { dir: [0, 1, 0], corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], normal: [0,1,0], faceIdx: 0, shade: 1.0 },
  { dir: [0,-1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], normal: [0,-1,0], faceIdx: 1, shade: 0.5 },
  { dir: [1, 0, 0], corners: [[1,1,0],[1,1,1],[1,0,1],[1,0,0]], normal: [1,0,0], faceIdx: 2, shade: 0.6 },
  { dir: [-1,0, 0], corners: [[0,1,1],[0,1,0],[0,0,0],[0,0,1]], normal: [-1,0,0], faceIdx: 3, shade: 0.6 },
  { dir: [0, 0, 1], corners: [[1,1,1],[0,1,1],[0,0,1],[1,0,1]], normal: [0,0,1], faceIdx: 4, shade: 0.8 },
  { dir: [0, 0,-1], corners: [[0,1,0],[1,1,0],[1,0,0],[0,0,0]], normal: [0,0,-1], faceIdx: 5, shade: 0.8 },
];

/** Animation type encoded per-vertex */
const ANIM_STATIC = 0.0;
const ANIM_LEAVES = 1.0;
const ANIM_VEGETATION = 2.0;
const ANIM_PORTAL = 3.0;
const ANIM_EMISSIVE = 4.0;

const LEAF_BLOCKS = new Set<number>([
  BlockType.LEAVES, BlockType.BIRCH_LEAVES, BlockType.SPRUCE_LEAVES,
  BlockType.JUNGLE_LEAVES, BlockType.ACACIA_LEAVES,
]);
const GRASS_BLOCKS = new Set<number>([BlockType.GRASS, BlockType.TALL_GRASS, BlockType.FERN]);
const EMISSIVE_BLOCKS = new Set<number>([
  BlockType.LAVA, BlockType.FIRE, BlockType.END_PORTAL, BlockType.GLOWSTONE, BlockType.MAGMA_BLOCK,
]);

function getAnimType(blockType: BlockType): number {
  if (LEAF_BLOCKS.has(blockType)) return ANIM_LEAVES;
  if (blockType === BlockType.TALL_GRASS || blockType === BlockType.FLOWER_RED ||
      blockType === BlockType.FLOWER_YELLOW || blockType === BlockType.FERN ||
      blockType === BlockType.DEAD_BUSH || blockType === BlockType.LILY_PAD) return ANIM_VEGETATION;
  if (blockType === BlockType.NETHER_PORTAL) return ANIM_PORTAL;
  if (EMISSIVE_BLOCKS.has(blockType)) return ANIM_EMISSIVE;
  return ANIM_STATIC;
}

export interface ChunkMeshResult {
  terrain: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
}

export class ChunkMesher {
  private readonly registry: BlockRegistry;
  private readonly atlas: TextureAtlas;
  private biomeSystem: BiomeSystem | null = null;
  private light!: LightEngine;

  constructor(atlas: TextureAtlas) {
    this.registry = BlockRegistry.getInstance();
    this.atlas = atlas;
  }

  /** Pass null for dimensions without biome tinting (Nether, End) */
  setBiomeSystem(biomeSystem: BiomeSystem | null): void {
    this.biomeSystem = biomeSystem;
  }

  buildMesh(
    chunk: Chunk,
    getNeighborBlock: (wx: number, wy: number, wz: number) => BlockType,
    light: LightEngine,
  ): ChunkMeshResult {
    this.light = light;
    const get = (lx: number, ly: number, lz: number): BlockType => {
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && ly >= 0 && ly < WORLD_HEIGHT) {
        return chunk.getBlock(lx, ly, lz);
      }
      return getNeighborBlock(chunk.worldX + lx, ly, chunk.worldZ + lz);
    };

    const tPos: number[] = [], tNorm: number[] = [], tUv: number[] = [];
    const tCol: number[] = [], tAnim: number[] = [], tLight: number[] = [], tIdx: number[] = [];
    let tVtx = 0;
    const wPos: number[] = [], wNorm: number[] = [], wUv: number[] = [];
    const wIdx: number[] = [];
    let wVtx = 0;

    // Per-column tint cache (grass r,g,b, leaves r,g,b)
    const tintCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE * 6);
    const tintDone = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const tintAt = (x: number, z: number): Float32Array => {
      const k = x + z * CHUNK_SIZE;
      if (!tintDone[k]) {
        const t = this.biomeSystem!.getBlendedTints(chunk.worldX + x, chunk.worldZ + z);
        for (let i = 0; i < 6; i++) tintCache[k * 6 + i] = t[i] * 2.2;
        tintDone[k] = 1;
      }
      return tintCache.subarray(k * 6, k * 6 + 6);
    };

    /** Light of a single cell, normalised to 0..1 */
    const cellLight = (wx: number, wy: number, wz: number): [number, number] => [
      this.light.getSky(wx, wy, wz) / 15,
      this.light.getBlockLight(wx, wy, wz) / 15,
    ];

    const pushLight = (n: number, l: [number, number]): void => {
      for (let i = 0; i < n; i++) tLight.push(l[0], l[1]);
    };

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockType = chunk.getBlock(x, y, z);
          if (blockType === BlockType.AIR) continue;

          const wx = chunk.worldX + x;
          const wz = chunk.worldZ + z;

          // ── WATER: separate mesh ──
          if (blockType === BlockType.WATER) {
            const above = get(x, y + 1, z);
            const isTopSurface = above === BlockType.AIR || isBlockCrossShaped(above) || above === BlockType.ICE;
            const texIdx = this.registry.getTextureIndex(BlockType.WATER, 0);
            const [u0, , u1] = this.atlas.getUVs(texIdx);

            if (isTopSurface && above !== BlockType.ICE) {
              const waterY = y + 0.85;
              wPos.push(wx, waterY, wz + 1, wx + 1, waterY, wz + 1, wx + 1, waterY, wz, wx, waterY, wz);
              wNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
              wUv.push(u0, 1, u1, 1, u1, 0, u0, 0);
              wIdx.push(wVtx, wVtx + 1, wVtx + 2, wVtx, wVtx + 2, wVtx + 3);
              wVtx += 4;
            }
            const waterSideFaces = [
              { dir: [1, 0, 0], corners: [[1,1,0],[1,1,1],[1,0,1],[1,0,0]], normal: [1,0,0] },
              { dir: [-1,0, 0], corners: [[0,1,1],[0,1,0],[0,0,0],[0,0,1]], normal: [-1,0,0] },
              { dir: [0, 0, 1], corners: [[1,1,1],[0,1,1],[0,0,1],[1,0,1]], normal: [0,0,1] },
              { dir: [0, 0,-1], corners: [[0,1,0],[1,1,0],[1,0,0],[0,0,0]], normal: [0,0,-1] },
            ];
            for (const face of waterSideFaces) {
              const neighbor = get(x + face.dir[0], y, z + face.dir[2]);
              if (neighbor === BlockType.AIR) {
                const topY = isTopSurface ? y + 0.85 : y + 1;
                for (let i = 0; i < 4; i++) {
                  const c = face.corners[i];
                  wPos.push(wx + c[0], c[1] === 1 ? topY : y, wz + c[2]);
                  wNorm.push(face.normal[0], face.normal[1], face.normal[2]);
                }
                wUv.push(u0, 1, u1, 1, u1, 0, u0, 0);
                wIdx.push(wVtx, wVtx + 1, wVtx + 2, wVtx, wVtx + 2, wVtx + 3);
                wVtx += 4;
              }
            }
            continue;
          }

          const pushQuad = (
            v0: number[], v1: number[], v2: number[], v3: number[],
            nx: number, ny: number, nz: number,
            qu0: number, qv0: number, qu1: number, qv1: number,
            anim: number, shade: number, l: [number, number],
            r = 1, g = 1, b = 1,
          ): void => {
            tPos.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], v3[0], v3[1], v3[2]);
            for (let q = 0; q < 4; q++) {
              tNorm.push(nx, ny, nz);
              tCol.push(shade * r, shade * g, shade * b);
              tAnim.push(anim);
              tLight.push(l[0], l[1]);
            }
            tUv.push(qu0, qv0, qu0, qv1, qu1, qv1, qu1, qv0);
            tIdx.push(tVtx, tVtx + 1, tVtx + 2, tVtx, tVtx + 2, tVtx + 3);
            tVtx += 4;
          };

          // ── LAVA: opaque emissive liquid (was invisible before!) ──
          if (blockType === BlockType.LAVA) {
            const texIdx = this.registry.getTextureIndex(BlockType.LAVA, 0);
            const [u0, , u1] = this.atlas.getUVs(texIdx);
            const above = get(x, y + 1, z);
            const topY = above === BlockType.LAVA ? y + 1 : y + 0.88;
            for (const face of FACES) {
              const n = get(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
              if (n === BlockType.LAVA) continue;
              if (isBlockSolid(n) && !isBlockTransparent(n)) continue;
              const faceUVs: [number, number][] = [[u0, 1], [u1, 1], [u1, 0], [u0, 0]];
              for (let i = 0; i < 4; i++) {
                const c = face.corners[i];
                tPos.push(wx + c[0], c[1] === 1 ? topY : y, wz + c[2]);
                tNorm.push(face.normal[0], face.normal[1], face.normal[2]);
                tUv.push(faceUVs[i][0], faceUVs[i][1]);
                tCol.push(1, 1, 1);
                tAnim.push(ANIM_EMISSIVE);
                tLight.push(0.2, 1);
              }
              tIdx.push(tVtx, tVtx + 1, tVtx + 2, tVtx, tVtx + 2, tVtx + 3);
              tVtx += 4;
            }
            continue;
          }

          // ── NETHER PORTAL: thin glowing pane ──
          if (blockType === BlockType.NETHER_PORTAL) {
            const texIdx = this.registry.getTextureIndex(blockType, 0);
            const [u0, , u1] = this.atlas.getUVs(texIdx);
            const isFrame = (b: BlockType): boolean => b === BlockType.NETHER_PORTAL || b === BlockType.OBSIDIAN;
            const alongX = isFrame(get(x - 1, y, z)) && isFrame(get(x + 1, y, z));
            const l: [number, number] = [1, 1];
            if (alongX) {
              const zc = wz + 0.5;
              pushQuad([wx, y, zc], [wx, y + 1, zc], [wx + 1, y + 1, zc], [wx + 1, y, zc], 0, 0, 1, u0, 0, u1, 1, ANIM_PORTAL, 1, l);
            } else {
              const xc = wx + 0.5;
              pushQuad([xc, y, wz], [xc, y + 1, wz], [xc, y + 1, wz + 1], [xc, y, wz + 1], 1, 0, 0, u0, 0, u1, 1, ANIM_PORTAL, 1, l);
            }
            continue;
          }

          // ── END PORTAL: glowing surface slightly below the block top ──
          if (blockType === BlockType.END_PORTAL) {
            const texIdx = this.registry.getTextureIndex(blockType, 0);
            const [u0, , u1] = this.atlas.getUVs(texIdx);
            const py = y + 0.75;
            pushQuad([wx, py, wz + 1], [wx + 1, py, wz + 1], [wx + 1, py, wz], [wx, py, wz], 0, 1, 0, u0, 0, u1, 1, ANIM_EMISSIVE, 1, [1, 1]);
            continue;
          }

          // ── TORCH: small box ──
          if (blockType === BlockType.TORCH) {
            const def = BLOCK_DEFINITIONS[blockType];
            const texs = def.textures;
            const sideTexIdx = texs.length >= 3 ? (texs as [number, number, number])[2] : texs[0];
            const topTexIdx = texs.length >= 3 ? (texs as [number, number, number])[0] : texs[0];
            const [su0, , su1] = this.atlas.getUVs(sideTexIdx);
            const [tu0, , tu1] = this.atlas.getUVs(topTexIdx);
            const cx = wx + 0.5, cz = wz + 0.5;
            const d = 0.1, h = 0.625;
            const x0 = cx - d, x1 = cx + d, y0 = y, y1 = y + h, z0 = cz - d, z1 = cz + d;
            const l: [number, number] = [Math.max(cellLight(wx, y, wz)[0], 0.3), 1];
            pushQuad([x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], 0, 0, 1, su0, 0, su1, 1, ANIM_STATIC, 1, l);
            pushQuad([x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0], 0, 0, -1, su0, 0, su1, 1, ANIM_STATIC, 1, l);
            pushQuad([x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0], 1, 0, 0, su0, 0, su1, 1, ANIM_STATIC, 1, l);
            pushQuad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], -1, 0, 0, su0, 0, su1, 1, ANIM_STATIC, 1, l);
            pushQuad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], 0, 1, 0, tu0, 0, tu1, 1, ANIM_STATIC, 1, l);
            pushQuad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], 0, -1, 0, su0, 0, su1, 0.15, ANIM_STATIC, 1, l);
            continue;
          }

          // ── CROSS-SHAPED vegetation / fire ──
          if (isBlockCrossShaped(blockType)) {
            const texIdx = this.registry.getTextureIndex(blockType, 0);
            const [u0, , u1] = this.atlas.getUVs(texIdx);
            const animType = getAnimType(blockType);
            let cr = 1, cg = 1, cb = 1;
            if (this.biomeSystem && GRASS_BLOCKS.has(blockType)) {
              const t = tintAt(x, z);
              cr = t[0]; cg = t[1]; cb = t[2];
            }
            const l = cellLight(wx, y, wz);
            const cx = wx + 0.5, cz = wz + 0.5;
            const d = 0.45;
            const crossQuads = [
              [[cx - d, y, cz - d], [cx - d, y + 1, cz - d], [cx + d, y + 1, cz + d], [cx + d, y, cz + d]],
              [[cx + d, y, cz + d], [cx + d, y + 1, cz + d], [cx - d, y + 1, cz - d], [cx - d, y, cz - d]],
              [[cx + d, y, cz - d], [cx + d, y + 1, cz - d], [cx - d, y + 1, cz + d], [cx - d, y, cz + d]],
              [[cx - d, y, cz + d], [cx - d, y + 1, cz + d], [cx + d, y + 1, cz - d], [cx + d, y, cz - d]],
            ];
            for (const quad of crossQuads) {
              for (let i = 0; i < 4; i++) {
                tPos.push(quad[i][0], quad[i][1], quad[i][2]);
                tNorm.push(0, 1, 0);
                tCol.push(cr, cg, cb);
                tAnim.push(blockType === BlockType.FIRE ? ANIM_EMISSIVE : animType);
                tLight.push(l[0], l[1]);
              }
              tUv.push(u0, 0, u0, 1, u1, 1, u1, 0);
              tIdx.push(tVtx, tVtx + 1, tVtx + 2, tVtx, tVtx + 2, tVtx + 3);
              tVtx += 4;
            }
            continue;
          }

          // ── SOLID BLOCKS ──
          if (!isBlockSolid(blockType)) continue;

          const animType = getAnimType(blockType);
          let tintR = 1, tintG = 1, tintB = 1;
          const grassTinted = GRASS_BLOCKS.has(blockType);
          const leafTinted = LEAF_BLOCKS.has(blockType);
          if (this.biomeSystem && (grassTinted || leafTinted)) {
            const t = tintAt(x, z);
            if (grassTinted) { tintR = t[0]; tintG = t[1]; tintB = t[2]; }
            else { tintR = t[3]; tintG = t[4]; tintB = t[5]; }
          }

          for (const face of FACES) {
            const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
            const neighborType = get(nx, ny, nz);
            if (isBlockSolid(neighborType) && !isBlockTransparent(neighborType)) continue;
            // Hide faces between two identical transparent blocks (glass, ice)
            if (neighborType === blockType && isBlockTransparent(blockType)) continue;

            const texIdx = this.registry.getTextureIndex(blockType, face.faceIdx);
            const [u0, , u1] = this.atlas.getUVs(texIdx);
            const faceUVs: [number, number][] = [[u0, 1], [u1, 1], [u1, 0], [u0, 0]];

            const applyTint = (blockType === BlockType.GRASS) ? (face.faceIdx === 0) : (grassTinted || leafTinted);
            const ao: number[] = [];
            const lightVals: [number, number][] = [];

            for (let i = 0; i < 4; i++) {
              const c = face.corners[i];
              const [a, lv] = this.cornerLightAO(wx, y, wz, face.normal, c);
              ao.push(a);
              lightVals.push(lv);
            }

            for (let i = 0; i < 4; i++) {
              const c = face.corners[i];
              tPos.push(wx + c[0], y + c[1], wz + c[2]);
              tNorm.push(face.normal[0], face.normal[1], face.normal[2]);
              tUv.push(faceUVs[i][0], faceUVs[i][1]);
              const aoFactor = (ao[i] / 3) * 0.6 + 0.4;
              const shade = aoFactor * face.shade;
              if (applyTint) tCol.push(shade * tintR, shade * tintG, shade * tintB);
              else tCol.push(shade, shade, shade);
              tAnim.push(animType);
              tLight.push(lightVals[i][0], lightVals[i][1]);
            }

            if (ao[0] + ao[2] > ao[1] + ao[3]) {
              tIdx.push(tVtx, tVtx + 1, tVtx + 2, tVtx, tVtx + 2, tVtx + 3);
            } else {
              tIdx.push(tVtx + 1, tVtx + 2, tVtx + 3, tVtx + 1, tVtx + 3, tVtx);
            }
            tVtx += 4;
          }
        }
      }
    }

    let terrain: THREE.BufferGeometry | null = null;
    if (tPos.length > 0) {
      terrain = new THREE.BufferGeometry();
      terrain.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
      terrain.setAttribute('normal', new THREE.Float32BufferAttribute(tNorm, 3));
      terrain.setAttribute('uv', new THREE.Float32BufferAttribute(tUv, 2));
      terrain.setAttribute('color', new THREE.Float32BufferAttribute(tCol, 3));
      terrain.setAttribute('aAnimType', new THREE.Float32BufferAttribute(tAnim, 1));
      terrain.setAttribute('aLight', new THREE.Float32BufferAttribute(tLight, 2));
      terrain.setIndex(tIdx);
    }

    let water: THREE.BufferGeometry | null = null;
    if (wPos.length > 0) {
      water = new THREE.BufferGeometry();
      water.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
      water.setAttribute('normal', new THREE.Float32BufferAttribute(wNorm, 3));
      water.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
      water.setIndex(wIdx);
    }
    return { terrain, water };
  }

  /**
   * Ambient occlusion (0..3) and smooth light (sky, block in 0..1) for one
   * vertex of a face: averages the 4 cells touching the vertex on the open
   * side of the face, exactly like Minecraft's smooth lighting.
   */
  private cornerLightAO(
    wx: number, wy: number, wz: number,
    normal: number[], corner: number[],
  ): [number, [number, number]] {
    const L = this.light;
    // base (outside) cell
    const ox = wx + normal[0], oy = wy + normal[1], oz = wz + normal[2];
    // tangent axes: those where normal is zero
    const du = [0, 0, 0], dv = [0, 0, 0];
    let first = true;
    for (let a = 0; a < 3; a++) {
      if (normal[a] !== 0) continue;
      const d = corner[a] === 0 ? -1 : 1;
      if (first) { du[a] = d; first = false; } else { dv[a] = d; }
    }
    const s1x = ox + du[0], s1y = oy + du[1], s1z = oz + du[2];
    const s2x = ox + dv[0], s2y = oy + dv[1], s2z = oz + dv[2];
    const dgx = ox + du[0] + dv[0], dgy = oy + du[1] + dv[1], dgz = oz + du[2] + dv[2];

    const o1 = L.isOpaque(s1x, s1y, s1z);
    const o2 = L.isOpaque(s2x, s2y, s2z);
    const od = L.isOpaque(dgx, dgy, dgz);
    const ao = (o1 && o2) ? 0 : 3 - (o1 ? 1 : 0) - (o2 ? 1 : 0) - (od ? 1 : 0);

    const bs = L.getSky(ox, oy, oz), bb = L.getBlockLight(ox, oy, oz);
    const s1s = o1 ? bs : L.getSky(s1x, s1y, s1z), s1b = o1 ? bb : L.getBlockLight(s1x, s1y, s1z);
    const s2s = o2 ? bs : L.getSky(s2x, s2y, s2z), s2b = o2 ? bb : L.getBlockLight(s2x, s2y, s2z);
    const useDiag = !(o1 && o2) && !od;
    const dgs = useDiag ? L.getSky(dgx, dgy, dgz) : bs;
    const dgb = useDiag ? L.getBlockLight(dgx, dgy, dgz) : bb;
    return [ao, [(bs + s1s + s2s + dgs) / 60, (bb + s1b + s2b + dgb) / 60]];
  }
}
