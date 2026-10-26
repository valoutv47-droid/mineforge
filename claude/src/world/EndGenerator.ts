import { Chunk } from './Chunk';
import { BlockType } from '../blocks/BlockTypes';
import { CHUNK_SIZE } from '../utils/constants';
import { noise2d } from '../utils/noise';
import type { ChunkGenerator } from './Dimension';
import type { BiomeSystem } from './BiomeSystem';

export const END_ISLAND_RADIUS = 66;
export const END_SURFACE_Y = 64;

export interface EndPillar {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** Y of the topmost obsidian block */
  readonly height: number;
  readonly caged: boolean;
}

const HEIGHTS = [76, 100, 82, 94, 88, 103, 79, 97, 85, 91];
const RADII = [2, 3, 3, 4, 2, 5, 3, 4, 2, 3];

/** The ten obsidian pillars on top of which the end crystals rest */
export function getEndPillars(): EndPillar[] {
  const out: EndPillar[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    out.push({
      x: Math.round(Math.cos(a) * 42),
      z: Math.round(Math.sin(a) * 42),
      radius: RADII[i],
      height: HEIGHTS[i],
      caged: i === 1 || i === 5 || i === 7,
    });
  }
  return out;
}

function h2(x: number, z: number, s = 0): number {
  let h = (x * 374761393 + z * 668265263 + s * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) >>> 0;
}

/** Surface height of the end main island (or -1 where there is void) */
function islandTop(wx: number, wz: number): { top: number; bottom: number } | null {
  // main island
  const r = Math.sqrt(wx * wx + wz * wz);
  const wobble = noise2d(wx * 0.04, wz * 0.04) * 5;
  const R = END_ISLAND_RADIUS + wobble;
  if (r < R) {
    const t = r / R;
    const top = Math.round(END_SURFACE_Y - t * t * 5 + noise2d(wx * 0.1 + 9, wz * 0.1) * 1.2);
    const depth = Math.round(30 * (1 - Math.pow(t, 1.4)) + noise2d(wx * 0.08, wz * 0.08 + 5) * 3);
    return { top, bottom: top - Math.max(2, depth) };
  }
  // small outer islands
  const G = 90;
  const gx = Math.floor(wx / G), gz = Math.floor(wz / G);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const cx = gx + ox, cz = gz + oz;
      const hh = h2(cx, cz, 77);
      if (hh % 100 > 45) continue;
      const ix = cx * G + 10 + (hh >> 4) % (G - 20);
      const iz = cz * G + 10 + (hh >> 11) % (G - 20);
      const dist = Math.sqrt(ix * ix + iz * iz);
      if (dist < END_ISLAND_RADIUS + 38) continue;
      const rad = 6 + (hh >> 17) % 9;
      const d = Math.sqrt((wx - ix) ** 2 + (wz - iz) ** 2);
      if (d < rad) {
        const t = d / rad;
        const top = 58 + (hh >> 21) % 14;
        const depth = Math.round(8 * (1 - t * t)) + 1;
        return { top: Math.round(top - t * 2), bottom: top - depth };
      }
    }
  }
  return null;
}

/** Position of the dragon fountain / exit portal centre */
export const END_FOUNTAIN_Y = END_SURFACE_Y;

export class EndGenerator implements ChunkGenerator {
  readonly biomeSystem: BiomeSystem | null = null;

  generateChunk(chunk: Chunk): void {
    const wx0 = chunk.worldX, wz0 = chunk.worldZ;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const col = islandTop(wx, wz);
        if (!col) continue;
        for (let y = col.bottom; y <= col.top; y++) chunk.setBlock(lx, y, lz, BlockType.END_STONE);
      }
    }

    // Obsidian pillars
    for (const p of getEndPillars()) {
      const r = p.radius;
      if (p.x + r + 3 < wx0 || p.x - r - 3 >= wx0 + CHUNK_SIZE || p.z + r + 3 < wz0 || p.z - r - 3 >= wz0 + CHUNK_SIZE) continue;
      for (let dx = -r - 2; dx <= r + 2; dx++) {
        for (let dz = -r - 2; dz <= r + 2; dz++) {
          const x = p.x + dx - wx0, z = p.z + dz - wz0;
          if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
          const d2 = dx * dx + dz * dz;
          if (d2 <= r * r + r * 0.6) {
            for (let y = END_SURFACE_Y - 6; y <= p.height; y++) chunk.setBlock(x, y, z, BlockType.OBSIDIAN);
            if (dx === 0 && dz === 0) {
              chunk.setBlock(x, p.height + 1, z, BlockType.BEDROCK);
              chunk.setBlock(x, p.height + 2, z, BlockType.FIRE);
            }
          }
          if (p.caged) {
            // glass cage around the crystal: walls at distance 2, roof at +4
            const ring = Math.max(Math.abs(dx), Math.abs(dz));
            if (ring === 2) for (let y = p.height + 1; y <= p.height + 4; y++) chunk.setBlock(x, y, z, BlockType.GLASS);
            if (ring <= 2) chunk.setBlock(x, p.height + 5, z, BlockType.GLASS);
          }
        }
      }
    }

    // Central fountain (bedrock ring + column), portal hole in the middle
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        const x = dx - wx0, z = dz - wz0;
        if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
        const d = Math.sqrt(dx * dx + dz * dz);
        const y = END_FOUNTAIN_Y;
        // clear space above
        for (let yy = y + 1; yy <= y + 8; yy++) chunk.setBlock(x, yy, z, BlockType.AIR);
        if (d < 2.6) {
          // portal bed (empty until the dragon dies)
          chunk.setBlock(x, y, z, BlockType.BEDROCK);
          chunk.setBlock(x, y - 1, z, BlockType.BEDROCK);
          chunk.setBlock(x, y, z, BlockType.AIR);
        } else if (d < 3.6) {
          chunk.setBlock(x, y, z, BlockType.BEDROCK);
          chunk.setBlock(x, y + 1, z, BlockType.BEDROCK);
        }
        if (dx === 0 && dz === 0) {
          for (let yy = y; yy <= y + 4; yy++) chunk.setBlock(x, yy, z, BlockType.BEDROCK);
        }
      }
    }
  }
}

/** Fill the exit portal after the dragon dies */
export const END_EXIT_RADIUS = 2.6;
