import { CHUNK_SIZE, WORLD_HEIGHT } from '../utils/constants';
import { LIGHT_EMISSION, LIGHT_OPACITY } from '../blocks/BlockTypes';
import type { Chunk } from './Chunk';

const W = CHUNK_SIZE * 3;       // window width in blocks (3x3 chunks)
const H = WORLD_HEIGHT;
const AREA = W * W;
const VOL = AREA * H;

/**
 * Computes sky light and block light (0..15) for a 3x3 chunk window centred on
 * a chunk. The result is only valid until the next call to `compute`.
 *
 * Light spreads like in Minecraft: each step through air loses one level,
 * partially transparent blocks (water, leaves) lose more, opaque blocks stop it.
 */
export class LightEngine {
  private readonly blocks = new Uint8Array(VOL);
  private readonly sky = new Uint8Array(VOL);
  private readonly blk = new Uint8Array(VOL);
  private readonly queue = new Int32Array(VOL);
  private readonly colTop = new Int16Array(AREA);

  private originX = 0;   // world X of window cell x=0
  private originZ = 0;
  private hasSky = true;

  /** World X/Z -> window cell index helpers */
  private idx(x: number, y: number, z: number): number {
    return x + z * W + y * AREA;
  }

  compute(center: Chunk, getChunk: (cx: number, cz: number) => Chunk | undefined, hasSky: boolean): void {
    this.hasSky = hasSky;
    this.originX = (center.cx - 1) * CHUNK_SIZE;
    this.originZ = (center.cz - 1) * CHUNK_SIZE;

    // 1) copy block data of the 9 chunks into the window
    for (let dcz = 0; dcz < 3; dcz++) {
      for (let dcx = 0; dcx < 3; dcx++) {
        const ch = getChunk(center.cx - 1 + dcx, center.cz - 1 + dcz);
        for (let y = 0; y < H; y++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const dst = this.idx(dcx * CHUNK_SIZE, y, dcz * CHUNK_SIZE + lz);
            if (ch) {
              const src = lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
              this.blocks.set(ch.blocks.subarray(src, src + CHUNK_SIZE), dst);
            } else {
              // Unknown chunk: treat as open air so it never creates seams
              this.blocks.fill(0, dst, dst + CHUNK_SIZE);
            }
          }
        }
      }
    }

    this.sky.fill(0);
    this.blk.fill(0);

    // 2) sky light: straight columns first
    const top = this.colTop;
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        let level = hasSky ? 15 : 0;
        let highest = -1;
        for (let y = H - 1; y >= 0; y--) {
          const i = this.idx(x, y, z);
          const op = LIGHT_OPACITY[this.blocks[i]];
          if (op > 0 && highest < 0) highest = y;
          if (op >= 15) level = 0; else if (op > 0) level = Math.max(0, level - op);
          this.sky[i] = level;
        }
        top[x + z * W] = highest;
      }
    }

    // 3) seed the BFS with sky cells that border darker open cells
    let head = 0, tail = 0;
    const q = this.queue;
    if (hasSky) {
      for (let z = 1; z < W - 1; z++) {
        for (let x = 1; x < W - 1; x++) {
          const c = x + z * W;
          let maxTop = top[c];
          if (top[c - 1] > maxTop) maxTop = top[c - 1];
          if (top[c + 1] > maxTop) maxTop = top[c + 1];
          if (top[c - W] > maxTop) maxTop = top[c - W];
          if (top[c + W] > maxTop) maxTop = top[c + W];
          const yMax = Math.min(H - 1, maxTop + 1);
          for (let y = 0; y <= yMax; y++) {
            const i = this.idx(x, y, z);
            const l = this.sky[i];
            if (l <= 1) continue;
            if (this.sky[i - 1] < l - 1 || this.sky[i + 1] < l - 1 ||
                this.sky[i - W] < l - 1 || this.sky[i + W] < l - 1) {
              q[tail++ % VOL] = i;
            }
          }
        }
      }
      this.propagate(this.sky, head, tail);
    }

    // 4) block light seeds (emitters that have at least one dimmer neighbour)
    head = 0; tail = 0;
    for (let y = 0; y < H; y++) {
      for (let z = 0; z < W; z++) {
        const row = this.idx(0, y, z);
        for (let x = 0; x < W; x++) {
          const i = row + x;
          const e = LIGHT_EMISSION[this.blocks[i]];
          if (e === 0) continue;
          this.blk[i] = e;
          if (x === 0 || z === 0 || x === W - 1 || z === W - 1 || y === 0 || y === H - 1) {
            q[tail++ % VOL] = i;
            continue;
          }
          if (LIGHT_EMISSION[this.blocks[i - 1]] < e || LIGHT_EMISSION[this.blocks[i + 1]] < e ||
              LIGHT_EMISSION[this.blocks[i - W]] < e || LIGHT_EMISSION[this.blocks[i + W]] < e ||
              LIGHT_EMISSION[this.blocks[i - AREA]] < e || LIGHT_EMISSION[this.blocks[i + AREA]] < e) {
            q[tail++ % VOL] = i;
          }
        }
      }
    }
    this.propagate(this.blk, head, tail);
  }

  /** Breadth first light spreading. `tail` counts total pushes (ring buffer). */
  private propagate(arr: Uint8Array, head: number, tail: number): void {
    const q = this.queue;
    const blocks = this.blocks;
    while (head < tail) {
      const i = q[head++ % VOL];
      const l = arr[i];
      if (l <= 1) continue;
      const y = (i / AREA) | 0;
      const rem = i - y * AREA;
      const z = (rem / W) | 0;
      const x = rem - z * W;

      // 6 neighbours
      if (x > 0) { const n = i - 1; const nl = l - 1 - LIGHT_OPACITY[blocks[n]]; if (LIGHT_OPACITY[blocks[n]] < 15 && nl > arr[n]) { arr[n] = nl; q[tail++ % VOL] = n; } }
      if (x < W - 1) { const n = i + 1; const nl = l - 1 - LIGHT_OPACITY[blocks[n]]; if (LIGHT_OPACITY[blocks[n]] < 15 && nl > arr[n]) { arr[n] = nl; q[tail++ % VOL] = n; } }
      if (z > 0) { const n = i - W; const nl = l - 1 - LIGHT_OPACITY[blocks[n]]; if (LIGHT_OPACITY[blocks[n]] < 15 && nl > arr[n]) { arr[n] = nl; q[tail++ % VOL] = n; } }
      if (z < W - 1) { const n = i + W; const nl = l - 1 - LIGHT_OPACITY[blocks[n]]; if (LIGHT_OPACITY[blocks[n]] < 15 && nl > arr[n]) { arr[n] = nl; q[tail++ % VOL] = n; } }
      if (y > 0) { const n = i - AREA; const nl = l - 1 - LIGHT_OPACITY[blocks[n]]; if (LIGHT_OPACITY[blocks[n]] < 15 && nl > arr[n]) { arr[n] = nl; q[tail++ % VOL] = n; } }
      if (y < H - 1) { const n = i + AREA; const nl = l - 1 - LIGHT_OPACITY[blocks[n]]; if (LIGHT_OPACITY[blocks[n]] < 15 && nl > arr[n]) { arr[n] = nl; q[tail++ % VOL] = n; } }
    }
  }

  // ── Queries (world coordinates) ───────────────────────────

  /** True when the world position falls inside the computed window. */
  private inside(wx: number, wy: number, wz: number): boolean {
    const x = wx - this.originX, z = wz - this.originZ;
    return x >= 0 && x < W && z >= 0 && z < W && wy >= 0 && wy < H;
  }

  getSky(wx: number, wy: number, wz: number): number {
    if (wy >= H) return this.hasSky ? 15 : 0;
    if (wy < 0) return 0;
    if (!this.inside(wx, wy, wz)) return this.hasSky ? 15 : 0;
    return this.sky[this.idx(wx - this.originX, wy, wz - this.originZ)];
  }

  getBlockLight(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= H) return 0;
    if (!this.inside(wx, wy, wz)) return 0;
    return this.blk[this.idx(wx - this.originX, wy, wz - this.originZ)];
  }

  /** Is the cell fully opaque for light? */
  isOpaque(wx: number, wy: number, wz: number): boolean {
    if (wy < 0 || wy >= H) return false;
    if (!this.inside(wx, wy, wz)) return false;
    return LIGHT_OPACITY[this.blocks[this.idx(wx - this.originX, wy, wz - this.originZ)]] >= 15;
  }
}
