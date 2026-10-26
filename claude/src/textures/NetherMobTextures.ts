import { MobType } from '../entities/MobTypes';

type Painter = (ctx: CanvasRenderingContext2D, s: number) => void;
type Set = Record<string, HTMLCanvasElement>;

const S = 32;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function make(paint: Painter, size = S): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  paint(c.getContext('2d')!, size);
  return c;
}

/** Noisy fill with a base colour */
function noisy(ctx: CanvasRenderingContext2D, s: number, base: [number, number, number], amp: number, seed: number): void {
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const n = (hash(x >> 1, y >> 1, seed) - 0.5) * amp + (hash(x, y, seed + 1) - 0.5) * amp * 0.5;
    ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, base[0] + n))},${Math.max(0, Math.min(255, base[1] + n))},${Math.max(0, Math.min(255, base[2] + n))})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

function piglin(): Set {
  const skin: [number, number, number] = [196, 126, 120];
  const rot: [number, number, number] = [92, 140, 82];
  const set: Set = {};
  set.head = make((c, s) => {
    noisy(c, s, [170, 120, 100], 20, 11);
    // snout
    c.fillStyle = '#d08a84'; c.fillRect(11, 15, 10, 8);
    c.fillStyle = '#7a3a38'; c.fillRect(13, 18, 2, 3); c.fillRect(17, 18, 2, 3);
    // eyes
    c.fillStyle = '#ffffff'; c.fillRect(6, 10, 5, 3); c.fillRect(21, 10, 5, 3);
    c.fillStyle = '#cf2e1e'; c.fillRect(8, 10, 3, 3); c.fillRect(21, 10, 3, 3);
    // tusks
    c.fillStyle = '#f0e8c8'; c.fillRect(9, 23, 2, 3); c.fillRect(21, 23, 2, 3);
    // ears
    c.fillStyle = '#8a4a46'; c.fillRect(0, 8, 3, 6); c.fillRect(29, 8, 3, 6);
  });
  set.head_side = make((c, s) => noisy(c, s, [170, 120, 100], 20, 12));
  set.body = make((c, s) => {
    noisy(c, s, rot, 22, 13);
    c.fillStyle = '#d4a017'; c.fillRect(0, 0, s, 5);            // golden chest strap
    c.fillStyle = '#8a6a10'; c.fillRect(0, 5, s, 1);
    c.fillStyle = '#3a2a1a'; c.fillRect(0, 22, s, 3);           // belt
  });
  const arm = (seed: number) => make((c, s) => { noisy(c, s, skin, 20, seed); c.fillStyle = '#d4a017'; c.fillRect(0, 0, s, 6); });
  set.armLeft = arm(14); set.armRight = arm(15);
  const leg = (seed: number) => make((c, s) => { noisy(c, s, [120, 80, 70], 18, seed); c.fillStyle = '#2a1a12'; c.fillRect(0, s - 6, s, 6); });
  set.legLeft = leg(16); set.legRight = leg(17);
  return set;
}

function ghast(): Set {
  const set: Set = {};
  set.head = make((c, s) => {
    noisy(c, s, [244, 244, 244], 10, 21);
    // closed eyes + mouth, sad face
    c.fillStyle = '#c8c8c8'; c.fillRect(4, 10, 8, 3); c.fillRect(20, 10, 8, 3);
    c.fillStyle = '#cf3a3a'; c.fillRect(6, 11, 4, 2); c.fillRect(22, 11, 4, 2);
    c.fillStyle = '#b0b0b0'; c.fillRect(13, 20, 6, 4);
    c.fillStyle = '#8a8a8a'; c.fillRect(14, 21, 4, 2);
  });
  set.head_side = make((c, s) => noisy(c, s, [236, 236, 236], 12, 22));
  for (let i = 0; i < 9; i++) set[`tentacle${i}`] = make((c, s) => noisy(c, s, [226, 226, 226], 16, 30 + i));
  return set;
}

function blaze(): Set {
  const set: Set = {};
  set.head = make((c, s) => {
    noisy(c, s, [236, 180, 40], 26, 41);
    c.fillStyle = '#4a2a08'; c.fillRect(6, 11, 6, 4); c.fillRect(20, 11, 6, 4);
    c.fillStyle = '#1a0a00'; c.fillRect(8, 12, 3, 2); c.fillRect(21, 12, 3, 2);
    c.fillStyle = '#7a3a0a'; c.fillRect(11, 21, 10, 3);
  });
  set.head_side = make((c, s) => noisy(c, s, [226, 170, 36], 26, 42));
  set.core = make((c, s) => noisy(c, s, [250, 200, 60], 40, 43));
  for (let i = 0; i < 12; i++) set[`rod${i}`] = make((c, s) => noisy(c, s, [255, 214, 70], 50, 50 + i));
  return set;
}

function crystal(): Set {
  const set: Set = {};
  set.base = make((c, s) => noisy(c, s, [34, 30, 38], 24, 61));
  set.crystalOuter = make((c, s) => {
    for (let y = 0; y < s; y++) {
      const t = y / s;
      c.fillStyle = `rgba(${180 + 60 * t},${70 + 80 * (1 - t)},${230},0.92)`;
      c.fillRect(0, y, s, 1);
    }
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(Math.floor(hash(i, 1, 62) * s), Math.floor(hash(i, 2, 62) * s), 1, 1); }
    c.strokeStyle = '#fff8'; c.strokeRect(1, 1, s - 2, s - 2);
  });
  set.crystalInner = make((c, s) => noisy(c, s, [255, 150, 240], 60, 63));
  return set;
}

function dragon(): Set {
  const set: Set = {};
  const scales = (base: [number, number, number], seed: number) => make((c, s) => {
    noisy(c, s, base, 16, seed);
    for (let y = 0; y < s; y += 4) for (let x = ((y / 4) % 2) * 2; x < s; x += 4) {
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y, 3, 1); c.fillRect(x, y, 1, 3);
    }
    for (let i = 0; i < 6; i++) { c.fillStyle = '#7a3ac0'; c.fillRect(Math.floor(hash(i, 1, seed) * s), Math.floor(hash(i, 2, seed) * s), 1, 1); }
  });
  set.body = scales([30, 26, 36], 71);
  set.neck1 = scales([34, 30, 40], 72);
  set.neck2 = scales([34, 30, 40], 73);
  set.head = make((c, s) => {
    noisy(c, s, [30, 26, 36], 14, 74);
    c.fillStyle = '#d070ff'; c.fillRect(5, 10, 6, 4); c.fillRect(21, 10, 6, 4);   // glowing purple eyes
    c.fillStyle = '#fff'; c.fillRect(7, 11, 2, 2); c.fillRect(23, 11, 2, 2);
    c.fillStyle = '#12101a'; c.fillRect(8, 20, 16, 6);                             // mouth
    c.fillStyle = '#e8e0f0'; for (let x = 8; x < 24; x += 3) c.fillRect(x, 20, 1, 2);
    c.fillStyle = '#12101a'; c.fillRect(13, 16, 2, 2); c.fillRect(17, 16, 2, 2);   // nostrils
  });
  set.head_side = scales([28, 24, 34], 75);
  for (let i = 1; i <= 4; i++) set[`tail${i}`] = scales([30, 26, 36], 80 + i);
  const wing = (seed: number) => make((c, s) => {
    noisy(c, s, [24, 20, 30], 14, seed);
    c.fillStyle = '#4a2a70';
    for (let x = 3; x < s; x += 6) c.fillRect(x, 0, 1, s);        // wing struts
    c.fillStyle = 'rgba(90,40,140,0.6)'; c.fillRect(0, 0, s, 2);
  });
  set.wingLeft = wing(90); set.wingRight = wing(91);
  for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) set[n] = scales([26, 22, 32], 95);
  return set;
}

function enderman(): Set {
  const set: Set = {};
  const dark = (seed: number) => make((c, s) => noisy(c, s, [22, 18, 26], 10, seed));
  set.head = make((c, s) => {
    noisy(c, s, [22, 18, 26], 10, 101);
    c.fillStyle = '#e070ff'; c.fillRect(4, 14, 9, 3); c.fillRect(19, 14, 9, 3);
    c.fillStyle = '#f8d8ff'; c.fillRect(4, 14, 4, 3); c.fillRect(19, 14, 4, 3);
    c.fillStyle = '#0a0810'; c.fillRect(8, 24, 16, 2);
  });
  set.head_side = dark(102);
  set.body = dark(103); set.armLeft = dark(104); set.armRight = dark(105); set.legLeft = dark(106); set.legRight = dark(107);
  return set;
}

export function generateExtraMobTextures(type: MobType): Set | null {
  switch (type) {
    case MobType.ZOMBIE_PIGLIN: return piglin();
    case MobType.GHAST: return ghast();
    case MobType.BLAZE: return blaze();
    case MobType.END_CRYSTAL: return crystal();
    case MobType.ENDERMAN: return enderman();
    case MobType.ENDER_DRAGON: return dragon();
    default: return null;
  }
}
