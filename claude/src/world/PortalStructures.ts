import { Chunk } from './Chunk';
import { BlockType } from '../blocks/BlockTypes';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../utils/constants';
import type { TerrainProvider } from './WorldGenerator';
import type { StructureLocation, StructureTypeName } from './StructureGenerator';
import { ChestManager } from './ChestManager';
import { ItemType } from '../ui/ItemTypes';
import type { ItemStack } from '../ui/InventorySystem';

const SEA = 34;
const NETHER_GRID = 208;
const END_GRID = 560;

function hash(x: number, z: number, s: number): number {
  let h = (x * 374761393 + z * 668265263 + s * 1274126177 + 99) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

interface Site { wx: number; wz: number; sy: number; seed: number }

/** Ring of the 12 end portal frames around a 3x3 hole (offsets from centre) */
export const END_FRAME_OFFSETS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = -1; i <= 1; i++) { out.push([i, -2], [i, 2], [-2, i], [2, i]); }
  return out;
})();

/**
 * Two extra overworld structures that lead to other dimensions:
 *  - a ruined Nether portal (obsidian frame, needs flint & steel)
 *  - an End portal shrine below ground level (needs 12 eyes of ender)
 */
export class PortalStructures {
  private readonly terrain: TerrainProvider;
  private readonly chestManager: ChestManager | undefined;

  constructor(terrain: TerrainProvider, chestManager?: ChestManager) {
    this.terrain = terrain;
    this.chestManager = chestManager;
  }

  private site(kind: 'nether' | 'end', cx: number, cz: number): Site | null {
    const grid = kind === 'nether' ? NETHER_GRID : END_GRID;
    const salt = kind === 'nether' ? 11 : 23;
    const h = hash(cx, cz, salt);
    if (kind === 'nether' && h % 100 >= 75) return null;
    const m = 24;
    const wx = cx * grid + m + (hash(cx, cz, salt + 1) % (grid - m * 2));
    const wz = cz * grid + m + (hash(cx, cz, salt + 2) % (grid - m * 2));
    if (this.terrain.getOceanFactor(wx, wz) < 0.85 || this.terrain.getRiverFactor(wx, wz) < 0.8) return null;
    const sy = this.terrain.getTerrainHeight(wx, wz);
    if (sy < SEA + 1 || sy > 80) return null;
    return { wx, wz, sy, seed: hash(cx, cz, salt + 3) };
  }

  private set(c: Chunk, x: number, y: number, z: number, t: BlockType): void {
    const lx = x - c.worldX, lz = z - c.worldZ;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 1 || y >= WORLD_HEIGHT) return;
    c.setBlock(lx, y, lz, t);
  }

  generate(c: Chunk): void {
    for (const kind of ['nether', 'end'] as const) {
      const grid = kind === 'nether' ? NETHER_GRID : END_GRID;
      const x0 = Math.floor((c.worldX - 16) / grid), x1 = Math.floor((c.worldX + CHUNK_SIZE + 16) / grid);
      const z0 = Math.floor((c.worldZ - 16) / grid), z1 = Math.floor((c.worldZ + CHUNK_SIZE + 16) / grid);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const s = this.site(kind, cx, cz);
        if (!s) continue;
        if (kind === 'nether') this.genNetherPortal(c, s); else this.genEndShrine(c, s);
      }
    }
  }

  private genNetherPortal(c: Chunk, s: Site): void {
    const { wx, wz, sy, seed } = s;
    // Platform of netherrack / magma / cobble, flush with the ground
    for (let dx = -3; dx <= 7; dx++) for (let dz = -3; dz <= 4; dz++) {
      const d = Math.abs(dx - 2) + Math.abs(dz);
      if (d > 8) continue;
      const r = hash(wx + dx, wz + dz, seed) % 10;
      const t = r < 5 ? BlockType.NETHERRACK : r < 7 ? BlockType.COBBLESTONE : r < 8 ? BlockType.MAGMA_BLOCK : BlockType.MOSSY_COBBLESTONE;
      this.set(c, wx + dx, sy - 1, wz + dz, t);
      for (let y = sy; y <= sy + 6; y++) {
        this.set(c, wx + dx, y, wz + dz, BlockType.AIR);
      }
    }
    // Frame 4 wide x 5 tall along X
    for (let i = 0; i < 4; i++) {
      this.set(c, wx + i, sy, wz, BlockType.OBSIDIAN);
      this.set(c, wx + i, sy + 4, wz, BlockType.OBSIDIAN);
    }
    for (let j = 1; j <= 3; j++) {
      this.set(c, wx, sy + j, wz, BlockType.OBSIDIAN);
      this.set(c, wx + 3, sy + j, wz, BlockType.OBSIDIAN);
    }
    // A bit of fire and a chest with the key to open it
    this.set(c, wx + 5, sy, wz + 2, BlockType.NETHERRACK);
    this.set(c, wx + 5, sy + 1, wz + 2, BlockType.FIRE);
    this.set(c, wx + 6, sy, wz - 1, BlockType.CHEST);
    if (this.chestManager && wx + 6 >= c.worldX && wx + 6 < c.worldX + CHUNK_SIZE && wz - 1 >= c.worldZ && wz - 1 < c.worldZ + CHUNK_SIZE) {
      const slots: (ItemStack | null)[] = new Array(27).fill(null);
      slots[4] = { itemType: ItemType.FLINT_AND_STEEL, count: 1 };
      slots[10] = { itemType: ItemType.GOLD_INGOT, count: 4 + (seed % 5) };
      slots[13] = { itemType: ItemType.OBSIDIAN, count: 2 };
      slots[16] = { itemType: ItemType.IRON_INGOT, count: 3 };
      this.chestManager.registerChest(wx + 6, sy, wz - 1, slots);
    }
  }

  /** Eyes pre-placed in frames (deterministic) */
  static prefilled(seed: number): boolean[] {
    return END_FRAME_OFFSETS.map((_, i) => hash(seed, i, 5) % 3 === 0);
  }

  private genEndShrine(c: Chunk, s: Site): void {
    const { wx, wz, sy, seed } = s;
    const y0 = sy - 5;
    const H = 5;
    const BR = BlockType.STONE_BRICKS;
    // Room: 11x11 pit
    for (let dx = -H; dx <= H; dx++) for (let dz = -H; dz <= H; dz++) {
      const edge = Math.abs(dx) === H || Math.abs(dz) === H;
      for (let y = y0; y <= sy + 6; y++) {
        if (y === y0) this.set(c, wx + dx, y, wz + dz, Math.abs(dx) + Math.abs(dz) === 3 ? BlockType.MOSSY_COBBLESTONE : BR);
        else if (edge && y <= sy) this.set(c, wx + dx, y, wz + dz, hash(wx + dx, wz + dz + y, seed) % 5 === 0 ? BlockType.MOSSY_COBBLESTONE : BR);
        else this.set(c, wx + dx, y, wz + dz, BlockType.AIR);
      }
    }
    // Ramp to the surface (east side)
    for (let i = 0; i <= 5; i++) for (let dz = -1; dz <= 1; dz++) {
      const x = wx + H + 1 + i;
      for (let y = y0; y <= sy + 6; y++) {
        if (y <= y0 + i) this.set(c, x, y, wz + dz, BR); else this.set(c, x, y, wz + dz, BlockType.AIR);
      }
    }
    for (let dz = -1; dz <= 1; dz++) this.set(c, wx + H, y0 + 1, wz + dz, BlockType.AIR); // doorway into the pit
    for (let dz = -1; dz <= 1; dz++) this.set(c, wx + H, y0 + 2, wz + dz, BlockType.AIR);
    for (let dz = -1; dz <= 1; dz++) this.set(c, wx + H, y0 + 3, wz + dz, BlockType.AIR);

    // End portal frames
    const pre = PortalStructures.prefilled(seed);
    END_FRAME_OFFSETS.forEach(([ox, oz], i) => {
      this.set(c, wx + ox, y0 + 1, wz + oz, pre[i] ? BlockType.END_PORTAL_FRAME_EYE : BlockType.END_PORTAL_FRAME);
    });
    // Torches in the corners of the room
    for (const [tx, tz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) this.set(c, wx + tx, y0 + 1, wz + tz, BlockType.TORCH);
    // Chest with exactly enough eyes
    const need = pre.filter(p => !p).length;
    this.set(c, wx - 4, y0 + 1, wz, BlockType.CHEST);
    if (this.chestManager && wx - 4 >= c.worldX && wx - 4 < c.worldX + CHUNK_SIZE && wz >= c.worldZ && wz < c.worldZ + CHUNK_SIZE) {
      const slots: (ItemStack | null)[] = new Array(27).fill(null);
      slots[11] = { itemType: ItemType.ENDER_EYE, count: need };
      slots[13] = { itemType: ItemType.GOLDEN_APPLE, count: 2 };
      slots[15] = { itemType: ItemType.TORCH, count: 8 };
      this.chestManager.registerChest(wx - 4, y0 + 1, wz, slots);
    }
  }

  find(px: number, pz: number, type: StructureTypeName): StructureLocation | null {
    const kind = type === 'nether_portal' ? 'nether' : type === 'end_portal' ? 'end' : null;
    if (!kind) return null;
    const grid = kind === 'nether' ? NETHER_GRID : END_GRID;
    const pcx = Math.floor(px / grid), pcz = Math.floor(pz / grid);
    let best: StructureLocation | null = null;
    for (let ring = 0; ring <= 12 && !best; ring++) {
      for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
        if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
        const s = this.site(kind, pcx + dx, pcz + dz);
        if (!s) continue;
        const dist = Math.hypot(s.wx - px, s.wz - pz);
        if (!best || dist < best.dist) best = { type, wx: s.wx, wy: kind === 'end' ? s.sy - 4 : s.sy, wz: s.wz, dist };
      }
    }
    return best;
  }
}
