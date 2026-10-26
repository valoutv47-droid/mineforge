/**
 * Improved procedural block textures.
 *
 * Every texture is generated on a 16x16 grid with *tileable* noise, a small
 * hand-picked palette per material and pixel-art style details (cracks,
 * pebbles, grain, outlines...) so that the result looks like real Minecraft
 * pixel art instead of smooth random noise.
 *
 * Indexes match the atlas order used by BlockTypes (0..89 existing, 90+ new).
 */

type C = [number, number, number];

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** Deterministic integer hash -> [0,1) */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Tileable value noise, `cells` lattice cells across the texture. */
function vnoise(x: number, y: number, size: number, cells: number, seed: number): number {
  const fx = (x / size) * cells;
  const fy = (y / size) * cells;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const g = (a: number, b: number): number => hash(((a % cells) + cells) % cells, ((b % cells) + cells) % cells, seed);
  const a = g(ix, iy), b = g(ix + 1, iy), c = g(ix, iy + 1), d = g(ix + 1, iy + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

/** Tileable fractal noise in [0,1] */
function fbm(x: number, y: number, size: number, seed: number, base = 2, octaves = 3): number {
  let sum = 0, amp = 1, norm = 0, cells = base;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x, y, size, cells, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    cells *= 2;
  }
  return sum / norm;
}

class Tex {
  readonly size: number;
  readonly d: Uint8ClampedArray;
  constructor(size: number) {
    this.size = size;
    this.d = new Uint8ClampedArray(size * size * 4);
  }
  set(x: number, y: number, c: C, a = 255): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    this.d[i] = clamp255(c[0]); this.d[i + 1] = clamp255(c[1]); this.d[i + 2] = clamp255(c[2]); this.d[i + 3] = a;
  }
  get(x: number, y: number): C {
    const s = this.size;
    const i = ((((y % s) + s) % s) * s + (((x % s) + s) % s)) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return 0;
    return this.d[(y * this.size + x) * 4 + 3];
  }
  fill(fn: (x: number, y: number) => C): this {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) this.set(x, y, fn(x, y));
    return this;
  }
  rect(x0: number, y0: number, w: number, h: number, c: C, a = 255): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a);
  }
  toImageData(): ImageData {
    const img = new ImageData(this.size, this.size);
    img.data.set(this.d);
    return img;
  }
}

const mul = (c: C, f: number): C => [c[0] * f, c[1] * f, c[2] * f];
const add = (c: C, v: number): C => [c[0] + v, c[1] + v, c[2] + v];
const mix = (a: C, b: C, t: number): C => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Quantised palette lookup, t in [0,1] */
function pal(p: C[], t: number): C {
  const i = Math.max(0, Math.min(p.length - 1, Math.floor(t * p.length)));
  return p[i];
}

/** Clustered noise pixel with palette, gives the typical MC "blotchy" look */
function blotch(x: number, y: number, size: number, seed: number, p: C[], contrast = 1.0): C {
  const n = fbm(x, y, size, seed, 2, 3);
  const f = hash(x, y, seed + 99);
  let t = (n - 0.5) * contrast + 0.5 + (f - 0.5) * 0.35;
  t = Math.max(0, Math.min(0.999, t));
  return pal(p, t);
}

type Gen = (S: number) => Tex;

// ──────────────────────────────────────────────────────────────
// Palettes
// ──────────────────────────────────────────────────────────────
const STONE_P: C[] = [[96, 96, 98], [108, 108, 110], [120, 120, 122], [131, 131, 133], [142, 142, 144]];
const DIRT_P: C[] = [[88, 62, 40], [105, 75, 48], [121, 85, 56], [134, 96, 64], [150, 108, 72]];
const SAND_P: C[] = [[200, 186, 140], [212, 198, 152], [222, 208, 160], [230, 216, 170], [238, 225, 182]];
const GRASS_P: C[] = [[52, 96, 22], [62, 108, 28], [72, 120, 32], [82, 132, 38], [94, 144, 46]];
const LEAF_P: C[] = [[30, 80, 20], [38, 96, 26], [48, 112, 32], [60, 128, 38], [74, 144, 46]];

// ──────────────────────────────────────────────────────────────
// Generators
// ──────────────────────────────────────────────────────────────

const grassTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const base = blotch(x, y, S, 11, GRASS_P, 1.5);
  // tiny blade highlights
  if (hash(x, y, 5) > 0.93) return add(base, 14);
  if (hash(x, y, 6) > 0.95) return add(base, -14);
  return base;
});

const dirt: Gen = (S) => {
  const t = new Tex(S).fill((x, y) => blotch(x, y, S, 21, DIRT_P, 1.3));
  // pebbles
  for (let i = 0; i < 7; i++) {
    const px = Math.floor(hash(i, 1, 31) * S), py = Math.floor(hash(i, 2, 31) * S);
    const light = hash(i, 3, 31) > 0.5;
    t.set(px, py, light ? [150, 130, 105] : [66, 46, 30]);
    if (hash(i, 4, 31) > 0.5) t.set(px + 1, py, light ? [138, 118, 92] : [74, 52, 34]);
  }
  return t;
};

const grassSide: Gen = (S) => {
  const t = dirt(S);
  for (let x = 0; x < S; x++) {
    const depth = 2 + Math.floor(hash(x, 0, 41) * 3) + (hash(x >> 1, 1, 42) > 0.6 ? 1 : 0);
    for (let y = 0; y < depth; y++) {
      const g = blotch(x, y, S, 12, GRASS_P, 1.4);
      t.set(x, y, y === depth - 1 ? mul(g, 0.82) : g);
    }
  }
  return t;
};

const stone: Gen = (S) => {
  const t = new Tex(S).fill((x, y) => blotch(x, y, S, 3, STONE_P, 1.25));
  for (let i = 0; i < 5; i++) {
    const px = Math.floor(hash(i, 1, 33) * S), py = Math.floor(hash(i, 2, 33) * S);
    t.set(px, py, [78, 78, 80]);
  }
  return t;
};

const cobble: Gen = (S) => {
  // Voronoi-like rounded stones with dark gaps
  const pts: [number, number][] = [];
  const N = 9;
  for (let i = 0; i < N; i++) pts.push([hash(i, 1, 51) * S, hash(i, 2, 51) * S]);
  const t = new Tex(S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let d1 = 1e9, d2 = 1e9, id = 0;
      for (let i = 0; i < N; i++) {
        for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
          const dx = x - (pts[i][0] + ox), dy = y - (pts[i][1] + oy);
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
        }
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const tone = 0.75 + hash(id, 7, 52) * 0.45;
      let c: C = mul([128, 128, 130], tone);
      c = add(c, (hash(x, y, 53) - 0.5) * 16);
      if (edge < 0.9) c = [60, 60, 62];
      else if (edge < 1.7) c = mul(c, 0.8);
      t.set(x, y, c);
    }
  }
  return t;
};

const woodSide: Gen = (S) => new Tex(S).fill((x, y) => {
  const stripe = vnoise(x, 0, S, 8, 61) * 0.7 + vnoise(x, y, S, 8, 62) * 0.3;
  const p: C[] = [[82, 62, 38], [92, 70, 42], [104, 80, 48], [114, 88, 54]];
  let c = pal(p, stripe);
  if (x % 4 === 0) c = mul(c, 0.82);
  if (hash(x, y, 63) > 0.93) c = mul(c, 0.78);
  return c;
});

const woodTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const dx = x - (S - 1) / 2, dy = y - (S - 1) / 2;
  const r = Math.max(Math.abs(dx), Math.abs(dy));
  if (r > 6.8) return [88, 66, 40]; // bark rim
  const ring = Math.floor(Math.sqrt(dx * dx + dy * dy) * 1.15);
  const c: C = ring % 2 === 0 ? [176, 140, 84] : [152, 118, 68];
  return add(c, (hash(x, y, 64) - 0.5) * 10);
});

const leaves = (p: C[], seed: number): Gen => (S) => {
  const t = new Tex(S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = fbm(x, y, S, seed, 4, 2);
      let c = pal(p, Math.min(0.999, n * 0.9 + hash(x, y, seed + 3) * 0.25));
      // inner depth shading: darker clusters
      if (hash(x, y, seed + 5) > 0.82) c = mul(c, 0.72);
      t.set(x, y, c);
    }
  }
  return t;
};

const sand: Gen = (S) => new Tex(S).fill((x, y) => {
  let c = blotch(x, y, S, 71, SAND_P, 1.0);
  if (hash(x, y, 72) > 0.94) c = add(c, -16);
  return c;
});

const water: Gen = (S) => new Tex(S).fill((x, y) => {
  const n = fbm(x, y, S, 81, 2, 3);
  const c: C = [34 + n * 20, 96 + n * 40, 200 + n * 30];
  return c;
});

const snow: Gen = (S) => new Tex(S).fill((x, y) => {
  const n = fbm(x, y, S, 91, 4, 2);
  const v = 238 + n * 14 - hash(x, y, 92) * 6;
  return [v - 4, v - 1, v + 4 > 255 ? 255 : v + 4];
});

const bedrock: Gen = (S) => {
  const P: C[] = [[28, 28, 30], [46, 46, 48], [64, 64, 66], [84, 84, 86], [20, 20, 22]];
  return new Tex(S).fill((x, y) => {
    const n = hash(x >> 1, y >> 1, 101);
    const m = hash(x, y, 102);
    return pal(P, Math.min(0.99, n * 0.7 + m * 0.3));
  });
};

const tallGrass: Gen = (S) => {
  const t = new Tex(S);
  const blades = [[2, 11], [4, 14], [6, 9], [7, 13], [9, 15], [11, 10], [13, 12], [14, 8]];
  for (const [bx, h] of blades) {
    const lean = hash(bx, 1, 111) > 0.5 ? 1 : -1;
    for (let k = 0; k < h; k++) {
      const x = bx + (k > h * 0.6 ? lean : 0);
      const y = S - 1 - k;
      const f = k / h;
      const c = mix([58, 112, 30], [110, 160, 56], f);
      t.set(x, y, c);
    }
  }
  return t;
};

const planks: Gen = (S) => new Tex(S).fill((x, y) => {
  const row = Math.floor(y / 4);
  const base: C[] = [[158, 120, 66], [168, 130, 74], [150, 112, 60], [162, 124, 70]];
  let c = base[row % base.length];
  const grain = vnoise(x + row * 7, y, S, 8, 121);
  c = add(c, (grain - 0.5) * 22);
  if (y % 4 === 3) c = mul(c, 0.68); // gap between boards
  if ((x + row * 5) % 16 === 0 && y % 4 !== 3) c = mul(c, 0.8);
  if (hash(x, y, 122) > 0.965) c = mul(c, 0.82);
  return c;
});

const darkPlanks: Gen = (S) => new Tex(S).fill((x, y) => {
  const row = Math.floor(y / 4);
  const base: C[] = [[66, 44, 24], [74, 50, 28], [60, 40, 22], [70, 47, 26]];
  let c = base[row % base.length];
  c = add(c, (vnoise(x + row * 7, y, S, 8, 131) - 0.5) * 16);
  if (y % 4 === 3) c = mul(c, 0.65);
  return c;
});

const stoneBricks: Gen = (S) => new Tex(S).fill((x, y) => {
  const row = Math.floor(y / 8);
  const off = row % 2 === 0 ? 0 : 8;
  const mortarY = y % 8 === 7;
  const mortarX = (x + off) % 16 === 15;
  if (mortarY || mortarX) return [88, 88, 90];
  const bx = Math.floor((x + off) / 16), id = bx * 3 + row;
  const base = 120 + hash(id, 1, 141) * 22;
  const hi = (y % 8 === 0) ? 10 : 0;
  const v = base + (hash(x, y, 142) - 0.5) * 12 + hi;
  return [v, v, v + 2];
});

const mossyCobble: Gen = (S) => {
  const t = cobble(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const m = fbm(x, y, S, 151, 4, 2);
    if (m > 0.55 && hash(x, y, 152) > 0.25) t.set(x, y, mix(t.get(x, y), [58 + hash(x, y, 153) * 30, 108 + hash(x, y, 154) * 30, 34], 0.75));
  }
  return t;
};

const wool = (c0: C): Gen => (S) => new Tex(S).fill((x, y) => {
  const n = (hash(x, y, 161) - 0.5) * 18 + (vnoise(x, y, S, 8, 162) - 0.5) * 14;
  return add(c0, n);
});

const ironBlock: Gen = (S) => new Tex(S).fill((x, y) => {
  const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
  const inner = x === 1 || y === 1;
  let v = 214 + (hash(x, y, 171) - 0.5) * 10;
  if (edge) v = 168;
  else if (inner) v = 232;
  else if (x === S - 2 || y === S - 2) v = 192;
  return [v, v, v + 2];
});

const chiseled: Gen = (S) => new Tex(S).fill((x, y) => {
  const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
  const ring = (x >= 3 && x <= S - 4 && y >= 3 && y <= S - 4) && (x === 3 || y === 3 || x === S - 4 || y === S - 4);
  const core = (x >= 5 && x <= S - 6 && y >= 5 && y <= S - 6);
  let v = 124 + (hash(x, y, 181) - 0.5) * 12;
  if (edge) v = 88;
  if (ring) v = 92;
  if (core) v = 108 + (hash(x, y, 182) - 0.5) * 8;
  return [v, v, v + 2];
});

const lava: Gen = (S) => new Tex(S).fill((x, y) => {
  const n = fbm(x, y, S, 191, 2, 3);
  const m = hash(x, y, 192);
  const P: C[] = [[168, 40, 8], [214, 72, 12], [244, 118, 18], [255, 168, 40], [255, 214, 90]];
  return pal(P, Math.min(0.99, n * 0.95 + m * 0.12));
});

const ice: Gen = (S) => new Tex(S).fill((x, y) => {
  const n = fbm(x, y, S, 201, 2, 3);
  const c: C = [140 + n * 40, 190 + n * 30, 245];
  return c;
});

const packedIce: Gen = (S) => new Tex(S).fill((x, y) => {
  const n = fbm(x, y, S, 211, 4, 2);
  const c: C = [112 + n * 36, 160 + n * 30, 232];
  if (hash(x, y, 212) > 0.95) return [200, 226, 255];
  return c;
});

const glowstone: Gen = (S) => {
  const P: C[] = [[168, 120, 52], [200, 148, 64], [230, 182, 84], [250, 216, 120], [255, 240, 170]];
  return new Tex(S).fill((x, y) => {
    const cx = Math.floor(x / 3), cy = Math.floor(y / 3);
    const n = hash(cx, cy, 221) * 0.6 + hash(x, y, 222) * 0.4;
    return pal(P, Math.min(0.99, n));
  });
};

const cactusSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let c: C = (x % 5 === 2) ? [58, 120, 40] : [34, 98, 30];
  if (x === 0 || x === S - 1) c = [26, 76, 24];
  if (x % 5 === 2 && y % 4 === 1) c = [210, 220, 150]; // spines
  return add(c, (hash(x, y, 231) - 0.5) * 8);
});
const cactusTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
  const mid = x >= 4 && x <= S - 5 && y >= 4 && y <= S - 5;
  const c: C = edge ? [30, 84, 28] : mid ? [96, 156, 70] : [52, 118, 40];
  return add(c, (hash(x, y, 232) - 0.5) * 8);
});

const obsidian: Gen = (S) => {
  const P: C[] = [[12, 8, 22], [20, 12, 36], [30, 18, 54], [44, 26, 78], [64, 36, 104]];
  return new Tex(S).fill((x, y) => {
    const n = fbm(x, y, S, 241, 4, 2);
    let c = pal(P, Math.min(0.99, n * 0.8 + hash(x, y, 242) * 0.3));
    if (hash(x, y, 243) > 0.97) c = [110, 70, 170];
    return c;
  });
};

const metalBlock = (hi: C, mid: C, lo: C, dark: C, seed: number): Gen => (S) => new Tex(S).fill((x, y) => {
  const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
  const n = fbm(x, y, S, seed, 4, 2);
  let c = n > 0.62 ? hi : n > 0.38 ? mid : lo;
  if (edge) c = dark;
  if ((x === 1 && y > 0 && y < S - 1) || (y === 1 && x > 0 && x < S - 1)) c = hi;
  // sparkle
  if (hash(x, y, seed + 1) > 0.965) c = hi;
  return c;
});

const brick: Gen = (S) => new Tex(S).fill((x, y) => {
  const row = Math.floor(y / 4);
  const off = row % 2 === 0 ? 0 : 4;
  if (y % 4 === 3 || (x + off) % 8 === 7) return [168, 160, 150];
  const id = Math.floor((x + off) / 8) + row * 3;
  const base: C = [150, 70, 54];
  const t = hash(id, 1, 251);
  return add(mul(base, 0.85 + t * 0.35), (hash(x, y, 252) - 0.5) * 12);
});

const hayBaleSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let c: C = [196, 160, 40];
  c = add(c, (vnoise(x, y, S, 8, 261) - 0.5) * 36 + (hash(x, y, 262) - 0.5) * 16);
  if (y === 4 || y === 11) c = [112, 84, 20];
  if (x % 4 === 0) c = mul(c, 0.92);
  return c;
});
const hayBaleTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const dx = x - (S - 1) / 2, dy = y - (S - 1) / 2;
  const ring = Math.floor(Math.max(Math.abs(dx), Math.abs(dy)));
  let c: C = ring % 2 === 0 ? [208, 172, 52] : [176, 142, 34];
  if (ring > 6) c = [120, 90, 24];
  return add(c, (hash(x, y, 271) - 0.5) * 12);
});

const slime: Gen = (S) => new Tex(S).fill((x, y) => {
  const edge = x <= 1 || y <= 1 || x >= S - 2 || y >= S - 2;
  const n = fbm(x, y, S, 281, 2, 2);
  return edge ? [86, 170, 66] : [112 + n * 30, 210, 90 + n * 20];
});

const gravel: Gen = (S) => {
  const P: C[] = [[96, 92, 90], [116, 110, 106], [136, 130, 124], [154, 148, 142], [78, 74, 72]];
  return new Tex(S).fill((x, y) => {
    const cx = Math.floor((x + (Math.floor(y / 3) % 2) * 1) / 3), cy = Math.floor(y / 3);
    const n = hash(cx, cy, 291) * 0.75 + hash(x, y, 292) * 0.25;
    return pal(P, Math.min(0.99, n));
  });
};

/** Ore overlay on a stone base. `chunks` are blob centres. */
const ore = (seed: number, a: C, b: C, blobs = 5): Gen => (S) => {
  const t = stone(S);
  for (let i = 0; i < blobs; i++) {
    const cx = 2 + Math.floor(hash(i, 1, seed) * (S - 5)), cy = 2 + Math.floor(hash(i, 2, seed) * (S - 5));
    const shape = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
    const n = 3 + Math.floor(hash(i, 3, seed) * 3);
    for (let k = 0; k < n; k++) {
      const [ox, oy] = shape[k];
      const c = hash(cx + ox, cy + oy, seed + 7) > 0.5 ? a : b;
      t.set(cx + ox, cy + oy, c);
    }
  }
  // dark outline pixel under each blob for depth
  return t;
};

const sandstoneSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let c = blotch(x, y, S, 301, [[206, 190, 140], [216, 200, 150], [222, 206, 158], [228, 212, 168]], 0.9);
  if (y === 3 || y === 4) c = [190, 172, 124];
  if (y === 10) c = [196, 178, 130];
  if (y === 0) c = [232, 216, 172];
  return c;
});
const sandstoneTop: Gen = (S) => new Tex(S).fill((x, y) => blotch(x, y, S, 302, [[222, 206, 158], [228, 212, 166], [234, 218, 174]], 0.8));
const sandstoneBottom: Gen = (S) => new Tex(S).fill((x, y) => blotch(x, y, S, 303, [[196, 180, 132], [204, 188, 140], [210, 194, 146]], 0.8));

const redSand: Gen = (S) => new Tex(S).fill((x, y) => blotch(x, y, S, 311, [[170, 84, 38], [182, 92, 42], [192, 100, 46], [200, 108, 52]], 1.0));
const redSandstoneSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let c = blotch(x, y, S, 312, [[176, 90, 42], [186, 98, 46], [194, 104, 50], [202, 112, 56]], 0.9);
  if (y === 3 || y === 4) c = [150, 72, 32];
  if (y === 10) c = [160, 78, 36];
  if (y === 0) c = [206, 118, 62];
  return c;
});
const redSandstoneTop: Gen = (S) => new Tex(S).fill((x, y) => blotch(x, y, S, 313, [[190, 100, 48], [196, 106, 52], [202, 112, 56]], 0.8));

const terracotta = (c0: C, seed: number): Gen => (S) => new Tex(S).fill((x, y) => add(c0, (vnoise(x, y, S, 4, seed) - 0.5) * 14 + (hash(x, y, seed + 1) - 0.5) * 8));

const clay: Gen = (S) => new Tex(S).fill((x, y) => blotch(x, y, S, 321, [[146, 152, 164], [156, 162, 174], [164, 170, 182], [172, 178, 190]], 0.9));

const fern: Gen = (S) => {
  const t = new Tex(S);
  const cx = 8;
  for (let k = 0; k < 13; k++) {
    const y = S - 1 - k;
    const c = mix([46, 100, 28], [88, 150, 52], k / 13);
    t.set(cx, y, c);
    const spread = Math.min(k, 13 - k) * 0.62;
    for (let s = 1; s <= spread; s++) {
      if (k % 2 === 0) { t.set(cx - s, y - Math.floor(s / 2), c); t.set(cx + s, y - Math.floor(s / 2), c); }
    }
  }
  return t;
};

const deadBush: Gen = (S) => {
  const t = new Tex(S);
  const P: C = [112, 78, 38];
  const D: C = [88, 60, 28];
  const branch = (x0: number, y0: number, dx: number, dy: number, len: number): void => {
    for (let i = 0; i < len; i++) t.set(Math.round(x0 + dx * i), Math.round(y0 + dy * i), i % 2 ? D : P);
  };
  branch(8, 15, 0, -1, 7);
  branch(8, 10, -0.7, -0.7, 5);
  branch(8, 9, 0.7, -0.8, 5);
  branch(8, 12, 0.8, -0.4, 4);
  branch(8, 13, -0.8, -0.3, 4);
  return t;
};

const lilyPad: Gen = (S) => {
  const t = new Tex(S);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r < 6.6 && !(dx > 0 && Math.abs(dy) < 1.0)) {
      t.set(x, y, add(r > 5.6 ? [24, 80, 20] : [40, 118, 36], (hash(x, y, 331) - 0.5) * 14));
    }
  }
  return t;
};

const birchSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let c: C = [214, 210, 196];
  c = add(c, (vnoise(x, y, S, 8, 341) - 0.5) * 16);
  const mark = hash(Math.floor(x / 3), Math.floor(y / 3), 342);
  if (mark > 0.82 && hash(x, y, 343) > 0.3) c = [52, 48, 44];
  return c;
});
const birchTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const dx = x - (S - 1) / 2, dy = y - (S - 1) / 2;
  const r = Math.max(Math.abs(dx), Math.abs(dy));
  if (r > 6.8) return [200, 196, 182];
  const ring = Math.floor(Math.sqrt(dx * dx + dy * dy) * 1.1);
  return add(ring % 2 === 0 ? [198, 172, 116] : [178, 152, 98], (hash(x, y, 344) - 0.5) * 8);
});
const spruceSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let c: C = [60, 42, 24];
  c = add(c, (vnoise(x, 0, S, 8, 351) - 0.5) * 22 + (hash(x, y, 352) - 0.5) * 8);
  if (x % 4 === 0) c = mul(c, 0.8);
  return c;
});
const spruceTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const dx = x - (S - 1) / 2, dy = y - (S - 1) / 2;
  const r = Math.max(Math.abs(dx), Math.abs(dy));
  if (r > 6.8) return [58, 40, 22];
  const ring = Math.floor(Math.sqrt(dx * dx + dy * dy) * 1.15);
  return add(ring % 2 === 0 ? [122, 92, 54] : [102, 76, 44], (hash(x, y, 353) - 0.5) * 8);
});
const jungleSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let c: C = [88, 70, 34];
  c = add(c, (vnoise(x, 0, S, 8, 361) - 0.5) * 26 + (hash(x, y, 362) - 0.5) * 10);
  if (x % 4 === 0) c = mul(c, 0.8);
  if (hash(x, y, 363) > 0.9) c = mix(c, [50, 100, 36], 0.7); // moss
  return c;
});
const jungleTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const dx = x - (S - 1) / 2, dy = y - (S - 1) / 2;
  const r = Math.max(Math.abs(dx), Math.abs(dy));
  if (r > 6.8) return [80, 62, 30];
  const ring = Math.floor(Math.sqrt(dx * dx + dy * dy) * 1.15);
  return add(ring % 2 === 0 ? [168, 130, 76] : [146, 110, 62], (hash(x, y, 364) - 0.5) * 8);
});
const acaciaSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let c: C = [128, 112, 98];
  c = add(c, (vnoise(x, 0, S, 8, 371) - 0.5) * 22 + (hash(x, y, 372) - 0.5) * 8);
  if (x % 5 === 1) c = mul(c, 0.84);
  if (hash(Math.floor(x / 2), Math.floor(y / 4), 373) > 0.86) c = [168, 92, 54];
  return c;
});
const acaciaTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const dx = x - (S - 1) / 2, dy = y - (S - 1) / 2;
  const r = Math.max(Math.abs(dx), Math.abs(dy));
  if (r > 6.8) return [116, 100, 86];
  const ring = Math.floor(Math.sqrt(dx * dx + dy * dy) * 1.15);
  return add(ring % 2 === 0 ? [176, 98, 58] : [154, 82, 46], (hash(x, y, 374) - 0.5) * 8);
});

// ── New textures (Nether / End / etc.) ───────────────────────

const netherrack: Gen = (S) => {
  const P: C[] = [[78, 28, 30], [94, 36, 36], [108, 44, 42], [122, 54, 50], [138, 66, 58]];
  return new Tex(S).fill((x, y) => {
    let c = blotch(x, y, S, 401, P, 1.6);
    if (hash(x, y, 402) > 0.93) c = mul(c, 0.72);
    return c;
  });
};

const soulSand: Gen = (S) => {
  const P: C[] = [[62, 48, 40], [74, 58, 48], [86, 68, 56], [98, 78, 64]];
  return new Tex(S).fill((x, y) => {
    let c = blotch(x, y, S, 411, P, 1.2);
    // "faces" in the sand: dark eye/mouth dots
    const cell = hash(Math.floor(x / 4), Math.floor(y / 4), 412);
    if (cell > 0.55) {
      const lx = x % 4, ly = y % 4;
      if ((lx === 1 && ly === 1) || (lx === 2 && ly === 1) || (lx >= 1 && lx <= 2 && ly === 3)) c = [38, 28, 24];
    }
    return c;
  });
};

const netherBricks: Gen = (S) => new Tex(S).fill((x, y) => {
  const row = Math.floor(y / 4);
  const off = row % 2 === 0 ? 0 : 4;
  if (y % 4 === 3 || (x + off) % 8 === 7) return [30, 14, 18];
  const id = Math.floor((x + off) / 8) + row * 3;
  const v = 0.85 + hash(id, 1, 421) * 0.35;
  return add(mul([68, 30, 36], v), (hash(x, y, 422) - 0.5) * 8);
});

const quartzOre: Gen = (S) => {
  const t = netherrack(S);
  for (let i = 0; i < 6; i++) {
    const cx = 2 + Math.floor(hash(i, 1, 431) * (S - 5)), cy = 2 + Math.floor(hash(i, 2, 431) * (S - 5));
    t.set(cx, cy, [236, 232, 224]);
    t.set(cx + 1, cy, [210, 206, 198]);
    if (hash(i, 3, 431) > 0.4) t.set(cx, cy + 1, [224, 220, 212]);
  }
  return t;
};

const magma: Gen = (S) => new Tex(S).fill((x, y) => {
  const cx = Math.floor(x / 4), cy = Math.floor(y / 4);
  const lx = x % 4, ly = y % 4;
  const crack = lx === 0 || ly === 0 || (lx === 3 && hash(cx, cy, 441) > 0.5);
  const glow = fbm(x, y, S, 442, 2, 3);
  if (crack) return mix([230, 110, 20], [255, 190, 60], glow);
  const base = 34 + hash(cx, cy, 443) * 20 + (hash(x, y, 444) - 0.5) * 10;
  return [base + 12, base * 0.55, base * 0.4];
});

const netherPortal: Gen = (S) => {
  const t = new Tex(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(x, y, S, 451, 2, 3);
    const swirl = Math.sin((x + y * 0.7) * 0.9 + n * 5.0) * 0.5 + 0.5;
    const c: C = mix([70, 20, 150], [190, 90, 255], swirl * 0.8 + n * 0.2);
    t.set(x, y, c, 200);
  }
  return t;
};

const endStone: Gen = (S) => {
  const P: C[] = [[196, 190, 134], [208, 202, 144], [220, 214, 156], [230, 226, 170], [186, 180, 124]];
  return new Tex(S).fill((x, y) => {
    let c = blotch(x, y, S, 461, P, 1.5);
    if (hash(x, y, 462) > 0.95) c = [150, 144, 100];
    return c;
  });
};

const portalFrameTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
  const socket = x >= 4 && x <= S - 5 && y >= 4 && y <= S - 5;
  if (edge) return [32, 74, 66];
  if (socket) return [10, 40, 34];
  return add([54, 120, 100], (hash(x, y, 471) - 0.5) * 14);
});
const portalFrameSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let c: C = endStone(S).get(x, y);
  c = mul(c, 0.9);
  if (y < 5) c = add([58, 126, 104], (hash(x, y, 472) - 0.5) * 12);
  if (y === 5) c = [30, 68, 58];
  return c;
});
const portalFrameEyeTop: Gen = (S) => {
  const t = portalFrameTop(S);
  for (let y = 4; y <= S - 5; y++) for (let x = 4; x <= S - 5; x++) {
    const dx = x - 7.5, dy = y - 7.5, r = Math.sqrt(dx * dx + dy * dy);
    t.set(x, y, r < 1.4 ? [20, 10, 40] : r < 3.2 ? [20, 150, 90] : [10, 70, 50]);
  }
  return t;
};

const endPortal: Gen = (S) => {
  const t = new Tex(S).fill((x, y) => {
    const n = fbm(x, y, S, 481, 2, 3);
    return [4 + n * 14, 10 + n * 40, 14 + n * 36];
  });
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(hash(i, 1, 482) * S), y = Math.floor(hash(i, 2, 482) * S);
    t.set(x, y, hash(i, 3, 482) > 0.5 ? [120, 230, 200] : [180, 140, 255]);
  }
  return t;
};

const fire: Gen = (S) => {
  const t = new Tex(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x - 7.5) / 7.5;
    const h = (S - y) / S; // 1 at bottom
    const flick = fbm(x * 1.0 + y * 0.5, y, S, 491, 2, 3);
    const width = (0.35 + 0.75 * h) * (0.7 + flick * 0.6);
    if (Math.abs(fx) < width && y > 1 + flick * 6) {
      const core = 1 - Math.abs(fx) / width;
      const c: C = core > 0.65 ? [255, 236, 130] : core > 0.35 ? [255, 168, 30] : [226, 80, 10];
      t.set(x, y, c, 235);
    }
  }
  return t;
};

const dragonEgg: Gen = (S) => new Tex(S).fill((x, y) => {
  const n = fbm(x, y, S, 501, 4, 2);
  let c: C = [16 + n * 14, 8 + n * 8, 28 + n * 22];
  if (hash(x, y, 502) > 0.9) c = [150, 60 + hash(x, y, 503) * 40, 220];
  return c;
});

const quartzSide: Gen = (S) => new Tex(S).fill((x, y) => {
  let v = 232 + (vnoise(x, y, S, 4, 511) - 0.5) * 12;
  if (y === 0 || y === S - 1) v = 214;
  if (y === 1) v = 242;
  return [v, v - 2, v - 6];
});
const quartzTop: Gen = (S) => new Tex(S).fill((x, y) => {
  let v = 238 + (vnoise(x, y, S, 4, 512) - 0.5) * 10;
  if (x === 0 || y === 0 || x === S - 1 || y === S - 1) v = 220;
  return [v, v - 2, v - 6];
});

const podzolTop: Gen = (S) => new Tex(S).fill((x, y) => {
  const P: C[] = [[88, 56, 28], [102, 66, 32], [116, 76, 38], [130, 88, 44]];
  let c = blotch(x, y, S, 521, P, 1.5);
  if (hash(x, y, 522) > 0.9) c = [58, 38, 20];
  return c;
});
const podzolSide: Gen = (S) => {
  const t = dirt(S);
  for (let x = 0; x < S; x++) {
    const depth = 2 + Math.floor(hash(x, 0, 531) * 3);
    for (let y = 0; y < depth; y++) {
      t.set(x, y, add([112, 72, 36], (hash(x, y, 532) - 0.5) * 18));
    }
  }
  return t;
};

// ──────────────────────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────────────────────

const stoneP2 = ore;

export const IMPROVED_BLOCK_TEXTURES: Record<number, Gen> = {
  0: grassTop,
  1: grassSide,
  2: dirt,
  3: stone,
  4: woodSide,
  5: woodTop,
  6: leaves(LEAF_P, 7),
  7: sand,
  8: water,
  9: snow,
  10: bedrock,
  11: tallGrass,
  14: planks,
  15: cobble,
  21: stoneBricks,
  22: mossyCobble,
  25: wool([176, 36, 34]),
  26: ironBlock,
  27: darkPlanks,
  28: chiseled,
  34: lava,
  35: ice,
  36: glowstone,
  39: cactusSide,
  40: cactusTop,
  43: obsidian,
  44: metalBlock([255, 246, 120], [244, 214, 52], [214, 168, 28], [160, 118, 16], 601),
  45: metalBlock([160, 250, 240], [76, 220, 204], [40, 168, 168], [24, 112, 120], 602),
  46: brick,
  47: hayBaleSide,
  48: hayBaleTop,
  49: slime,
  50: gravel,
  52: stoneP2(701, [26, 26, 28], [48, 48, 50], 6),
  53: stoneP2(702, [214, 170, 140], [190, 140, 112], 5),
  54: stoneP2(703, [250, 222, 70], [226, 190, 40], 5),
  55: stoneP2(704, [100, 240, 236], [60, 200, 214], 5),
  56: stoneP2(705, [60, 220, 100], [30, 170, 70], 4),
  69: birchSide,
  70: birchTop,
  71: leaves([[64, 112, 44], [78, 128, 52], [92, 144, 60], [106, 158, 70], [54, 98, 38]], 711),
  72: spruceSide,
  73: spruceTop,
  74: leaves([[24, 58, 30], [30, 70, 36], [38, 84, 44], [46, 98, 52], [18, 46, 24]], 741),
  75: jungleSide,
  76: jungleTop,
  77: leaves([[18, 96, 18], [24, 116, 22], [32, 136, 28], [44, 156, 36], [14, 78, 14]], 771),
  78: acaciaSide,
  79: acaciaTop,
  80: leaves([[86, 112, 34], [100, 128, 40], [114, 144, 46], [128, 158, 54], [74, 96, 28]], 801),
  81: sandstoneSide,
  82: sandstoneTop,
  83: sandstoneBottom,
  84: redSand,
  85: terracotta([152, 94, 68], 851),
  86: clay,
  87: fern,
  88: deadBush,
  89: lilyPad,
  // New
  90: netherrack,
  91: soulSand,
  92: netherBricks,
  93: quartzOre,
  94: magma,
  95: netherPortal,
  96: endStone,
  97: portalFrameTop,
  98: portalFrameSide,
  99: portalFrameEyeTop,
  100: endPortal,
  101: fire,
  102: terracotta([160, 82, 38], 1021),
  103: terracotta([186, 134, 40], 1031),
  104: terracotta([142, 60, 46], 1041),
  105: terracotta([208, 178, 160], 1051),
  106: terracotta([78, 52, 36], 1061),
  107: redSandstoneSide,
  108: redSandstoneTop,
  109: podzolTop,
  110: podzolSide,
  111: packedIce,
  112: dragonEgg,
  113: quartzSide,
  114: quartzTop,
};

/** Total number of atlas slots we guarantee to exist. */
export const BLOCK_TEXTURE_COUNT = 115;

export function generateImprovedTexture(index: number, size: number): ImageData | null {
  const g = IMPROVED_BLOCK_TEXTURES[index];
  if (!g) return null;
  return g(size).toImageData();
}
