import { Chunk } from './Chunk';
import { BlockType } from '../blocks/BlockTypes';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../utils/constants';
import { noise2d, noise3d } from '../utils/noise';
import type { ChunkGenerator } from './Dimension';
import type { BiomeSystem } from './BiomeSystem';
import { ChestManager } from './ChestManager';
import { ItemType } from '../ui/ItemTypes';
import type { ItemStack } from '../ui/InventorySystem';

export const NETHER_LAVA_LEVEL = 31;
const FORTRESS_GRID = 112;

function hash2(x: number, z: number, s = 0): number {
  let h = (x * 374761393 + z * 668265263 + s * 1274126177 + 1234567) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) >>> 0;
}

/**
 * The Nether: a huge hollow cavern between a bedrock floor and ceiling,
 * lava ocean, netherrack hills, soul sand valleys, glowstone clusters,
 * quartz ore and nether-brick fortresses.
 */
export class NetherGenerator implements ChunkGenerator {
  readonly biomeSystem: BiomeSystem | null = null;
  private readonly chestManager: ChestManager | undefined;

  constructor(chestManager?: ChestManager) {
    this.chestManager = chestManager;
  }

  private density(wx: number, y: number, wz: number): number {
    const n = noise3d(wx * 0.016, y * 0.032, wz * 0.016)
            + noise3d(wx * 0.05 + 300, y * 0.07 + 90, wz * 0.05 + 300) * 0.28
            + noise3d(wx * 0.11, y * 0.12, wz * 0.11) * 0.08;
    const edge = Math.max(0, Math.abs(y - 66) - 24) / 40;
    return n + edge * edge * 1.9 - 0.22;
  }

  generateChunk(chunk: Chunk): void {
    const wx0 = chunk.worldX, wz0 = chunk.worldZ;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let block: BlockType = BlockType.AIR;
          if (y === 0 || y === WORLD_HEIGHT - 1) block = BlockType.BEDROCK;
          else if (y <= 3 && hash2(wx, wz, y) % (y + 1) === 0 && y < 3) block = BlockType.BEDROCK;
          else if (y >= WORLD_HEIGHT - 4 && hash2(wx, wz, y) % (WORLD_HEIGHT - y) === 0 && y > WORLD_HEIGHT - 4) block = BlockType.BEDROCK;
          else if (this.density(wx, y, wz) > 0) block = BlockType.NETHERRACK;
          else if (y <= NETHER_LAVA_LEVEL) block = BlockType.LAVA;
          chunk.setBlock(lx, y, lz, block);
        }
      }
    }

    // Surface decoration
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const soul = noise2d(wx * 0.04 + 50, wz * 0.04 - 20);
        const grav = noise2d(wx * 0.05 - 80, wz * 0.05 + 33);
        for (let y = 2; y < WORLD_HEIGHT - 3; y++) {
          const b = chunk.getBlock(lx, y, lz);
          if (b !== BlockType.NETHERRACK) continue;
          const above = chunk.getBlock(lx, y + 1, lz);
          const below = chunk.getBlock(lx, y - 1, lz);
          const h = hash2(wx, wz, y);

          // Floor surface (open above)
          if (above === BlockType.AIR) {
            if (soul > 0.25 && y < 60) chunk.setBlock(lx, y, lz, BlockType.SOUL_SAND);
            else if (grav > 0.55) chunk.setBlock(lx, y, lz, BlockType.GRAVEL);
            else if (y <= NETHER_LAVA_LEVEL + 1 && h % 9 === 0) chunk.setBlock(lx, y, lz, BlockType.MAGMA_BLOCK);
            else if (h % 48 === 0) chunk.setBlock(lx, y + 1, lz, BlockType.FIRE);
          } else if (above === BlockType.LAVA && h % 7 === 0) {
            chunk.setBlock(lx, y, lz, BlockType.MAGMA_BLOCK);
          }

          // Ceiling surface: glowstone clusters
          if (below === BlockType.AIR && y > 70 && h % 90 === 0) {
            this.glowCluster(chunk, lx, y, lz, h);
          }
          // Quartz ore sprinkled in the rock
          if (h % 140 === 7) chunk.setBlock(lx, y, lz, BlockType.NETHER_QUARTZ_ORE);
        }
      }
    }

    // Fortresses
    this.generateFortresses(chunk);
  }

  private glowCluster(chunk: Chunk, lx: number, y: number, lz: number, h: number): void {
    const r = 2 + (h >> 4) % 2;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dy = -r - 1; dy <= 1; dy++) {
          const d2 = dx * dx + dz * dz + dy * dy * 0.9;
          if (d2 > r * r + 0.5) continue;
          if (hash2(dx + lx * 31, dz + lz * 17, dy + y) % 5 === 0) continue;
          const x = lx + dx, z = lz + dz, yy = y + dy;
          if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
          const cur = chunk.getBlock(x, yy, z);
          if (cur === BlockType.AIR || cur === BlockType.NETHERRACK) chunk.setBlock(x, yy, z, BlockType.GLOWSTONE);
        }
      }
    }
  }

  // ────────────────────────── Fortress ──────────────────────────

  private fortressAt(cx: number, cz: number): { x: number; z: number; y: number; lx: number; lz: number } | null {
    const h = hash2(cx * 13 + 7, cz * 29 + 3, 99);
    if (h % 100 >= 60) return null;
    const x = cx * FORTRESS_GRID + 24 + (h >> 3) % (FORTRESS_GRID - 48);
    const z = cz * FORTRESS_GRID + 24 + (h >> 9) % (FORTRESS_GRID - 48);
    return { x, z, y: 52 + (h >> 15) % 14, lx: 26 + (h >> 4) % 18, lz: 26 + (h >> 11) % 18 };
  }

  private generateFortresses(chunk: Chunk): void {
    const x0 = chunk.worldX, z0 = chunk.worldZ;
    const gx0 = Math.floor((x0 - 50) / FORTRESS_GRID), gx1 = Math.floor((x0 + CHUNK_SIZE + 50) / FORTRESS_GRID);
    const gz0 = Math.floor((z0 - 50) / FORTRESS_GRID), gz1 = Math.floor((z0 + CHUNK_SIZE + 50) / FORTRESS_GRID);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const f = this.fortressAt(gx, gz);
        if (!f) continue;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const dx = x0 + lx - f.x, dz = z0 + lz - f.z;
            const inX = Math.abs(dz) <= 3 && Math.abs(dx) <= f.lx;   // corridor along X
            const inZ = Math.abs(dx) <= 3 && Math.abs(dz) <= f.lz;   // corridor along Z
            if (!inX && !inZ) continue;
            // Is this column wall (edge of the union) or interior?
            const interior = (inX && Math.abs(dz) <= 2 && Math.abs(dx) <= f.lx - 1) || (inZ && Math.abs(dx) <= 2 && Math.abs(dz) <= f.lz - 1);
            const y0 = f.y;
            // Floor
            chunk.setBlock(lx, y0, lz, BlockType.NETHER_BRICKS);
            if (interior) {
              for (let y = y0 + 1; y <= y0 + 5; y++) chunk.setBlock(lx, y, lz, BlockType.AIR);
              chunk.setBlock(lx, y0 + 6, lz, BlockType.NETHER_BRICKS);
              // Ceiling lights
              if (Math.abs(dx) % 10 === 0 && Math.abs(dz) % 10 === 0 && dx % 4 === 0) chunk.setBlock(lx, y0 + 5, lz, BlockType.GLOWSTONE);
            } else {
              // Walls with windows
              for (let y = y0 + 1; y <= y0 + 6; y++) {
                const window = (y === y0 + 3 || y === y0 + 4) && ((Math.abs(dx) + Math.abs(dz)) % 4 !== 0);
                chunk.setBlock(lx, y, lz, window ? BlockType.AIR : BlockType.NETHER_BRICKS);
              }
            }
            // Support pillars down to the ground/lava every 6 blocks on the wall line
            if (!interior && (Math.abs(dx) + Math.abs(dz)) % 6 === 0) {
              for (let y = y0 - 1; y > 4; y--) {
                const cur = chunk.getBlock(lx, y, lz);
                if (cur !== BlockType.AIR && cur !== BlockType.LAVA) break;
                chunk.setBlock(lx, y, lz, BlockType.NETHER_BRICKS);
              }
            }
          }
        }
        // Treasure chest at the crossing
        const cxw = f.x, czw = f.z;
        if (cxw >= x0 && cxw < x0 + CHUNK_SIZE && czw >= z0 && czw < z0 + CHUNK_SIZE) {
          chunk.setBlock(cxw - x0, f.y + 1, czw - z0, BlockType.CHEST);
          if (this.chestManager) {
            const slots: (ItemStack | null)[] = new Array(27).fill(null);
            const loot: [ItemType, number, number][] = [
              [ItemType.GOLD_INGOT, 2, 6], [ItemType.IRON_INGOT, 2, 5], [ItemType.DIAMOND, 1, 2],
              [ItemType.FLINT_AND_STEEL, 1, 1], [ItemType.OBSIDIAN, 4, 10], [ItemType.GOLDEN_APPLE, 1, 2],
              [ItemType.BLAZE_POWDER, 1, 3],
            ];
            let slot = 0;
            loot.forEach(([item, mn, mx], i) => {
              if (hash2(f.x + i, f.z, 5) % 100 < 70) {
                slots[(slot++ * 3 + i) % 27] = { itemType: item, count: mn + hash2(f.x, f.z + i, 6) % (mx - mn + 1) };
              }
            });
            this.chestManager.registerChest(cxw, f.y + 1, czw, slots);
          }
        }
      }
    }
  }
}

/** Is this a nether-brick fortress block (used for blaze spawning)? */
export function isFortressBlock(b: number): boolean {
  return b === BlockType.NETHER_BRICKS;
}
