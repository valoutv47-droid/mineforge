import { ItemType } from '../ui/ItemTypes';

/**
 * Procedural 16x16 pixel-art icons for every non-block item.
 * Icons are drawn into a plain colour buffer, so they can be used for the
 * hotbar, the inventory, dropped items and the item held in the hand.
 */
export type Pixels = (string | null)[];

const S = 16;

class Canvas16 {
  readonly px: Pixels = new Array(S * S).fill(null);
  set(x: number, y: number, c: string | null): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    this.px[y * S + x] = c;
  }
  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= S || y >= S) return null;
    return this.px[y * S + x];
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  disc(cx: number, cy: number, r: number, c: string): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
      }
    }
  }
  /** Dark outline around everything that is drawn so far */
  outline(c = '#1b1b1b'): void {
    const copy = this.px.slice();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (copy[y * S + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < S && ny < S && copy[ny * S + nx]) { this.px[y * S + x] = c; break; }
      }
    }
  }
}

interface Mat { m: string; l: string; d: string }
const WOOD: Mat = { m: '#9c7a46', l: '#bf9a5c', d: '#6e532c' };
const STONE: Mat = { m: '#8a8a8a', l: '#b0b0b0', d: '#5e5e5e' };
const IRON: Mat = { m: '#d4d4d4', l: '#f4f4f4', d: '#9a9a9a' };
const GOLD: Mat = { m: '#f2cf3c', l: '#fff08c', d: '#bd9210' };
const DIAMOND: Mat = { m: '#46d8c8', l: '#a4f6ee', d: '#229a98' };
const LEATHER: Mat = { m: '#a8642c', l: '#cb8445', d: '#6e3e18' };
const HANDLE: Mat = { m: '#7a5a2c', l: '#9a763c', d: '#4e3818' };

function matOf(name: string): Mat {
  if (/^Wooden/.test(name)) return WOOD;
  if (/^Stone/.test(name)) return STONE;
  if (/^Iron/.test(name)) return IRON;
  if (/^Gold/.test(name)) return GOLD;
  if (/^Diamond/.test(name)) return DIAMOND;
  if (/^Leather/.test(name)) return LEATHER;
  return IRON;
}

function handleLine(c: Canvas16, x0: number, y0: number, x1: number, y1: number): void {
  c.line(x0, y0, x1, y1, HANDLE.m);
  c.line(x0 + 1, y0, x1 + 1, y1, HANDLE.l);
}

function tool(c: Canvas16, kind: string, m: Mat): void {
  if (kind === 'Sword') {
    // blade along the anti-diagonal, guard + grip
    for (let i = 0; i < 9; i++) {
      const x = 13 - i, y = 2 + i;
      c.set(x, y, m.m); c.set(x - 1, y, m.l); c.set(x, y + 1, m.d);
    }
    c.set(14, 1, m.l); c.set(14, 2, m.m);
    c.line(3, 8, 8, 13, HANDLE.d); c.line(4, 8, 8, 12, '#a07828');
    c.line(5, 10, 2, 13, HANDLE.m); c.line(6, 10, 3, 13, HANDLE.l);
    c.set(1, 14, '#d4af37');
    return;
  }
  handleLine(c, 2, 14, 10, 6);
  if (kind === 'Pickaxe') {
    for (let t = -6; t <= 6; t++) {
      const bend = Math.round((36 - t * t) / 9);
      const x = 9 + t + bend, y = 6 + t - bend + 1;
      c.set(x, y, m.m); c.set(x - 1, y, m.l); c.set(x, y + 1, m.d);
    }
  } else if (kind === 'Axe') {
    for (let j = 0; j < 7; j++) for (let i = 0; i < 6; i++) {
      if (i + j > 9 || i + (6 - j) > 9) continue;
      const x = 6 + i, y = 1 + j;
      c.set(x, y, i === 0 ? m.l : j === 6 ? m.d : m.m);
    }
  } else if (kind === 'Shovel') {
    c.disc(11.5, 4.5, 2.7, m.m);
    c.set(10, 3, m.l); c.set(11, 2, m.l); c.set(13, 6, m.d); c.set(12, 7, m.d);
  }
}

function armor(c: Canvas16, piece: string, m: Mat): void {
  const fill = (x: number, y: number, w: number, h: number): void => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(x + i, y + j, j === 0 || i === 0 ? m.l : (j === h - 1 || i === w - 1) ? m.d : m.m);
  };
  if (piece === 'Helmet') {
    fill(3, 3, 10, 5); fill(3, 8, 3, 5); fill(10, 8, 3, 5);
    c.set(6, 8, null);
  } else if (piece === 'Chestplate') {
    fill(2, 2, 4, 4); fill(10, 2, 4, 4); fill(4, 2, 8, 12);
    c.rect(6, 2, 4, 2, m.d);
  } else if (piece === 'Leggings') {
    fill(3, 2, 10, 4); fill(3, 6, 4, 8); fill(9, 6, 4, 8);
  } else {
    fill(2, 7, 5, 7); fill(9, 7, 5, 7);
    c.rect(2, 12, 6, 2, m.d); c.rect(9, 12, 6, 2, m.d);
  }
}

function ingot(c: Canvas16, m: Mat): void {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 11; x++) {
      const px = 2 + x + Math.floor((6 - y) / 2), py = 5 + y;
      c.set(px, py, y === 0 ? m.l : y === 6 ? m.d : x === 0 ? m.l : x === 10 ? m.d : m.m);
    }
  }
  c.set(6, 7, m.l); c.set(7, 7, m.l);
}

function gem(c: Canvas16, m: Mat): void {
  const rows = [[6, 9], [4, 11], [3, 12], [3, 12], [4, 11], [5, 10], [6, 9], [7, 8]];
  rows.forEach(([a, b], j) => { for (let x = a; x <= b; x++) c.set(x, 3 + j, j < 2 ? m.l : j > 5 ? m.d : m.m); });
  c.set(5, 5, m.l); c.set(6, 6, '#ffffff'); c.set(10, 8, m.d);
}

function lump(c: Canvas16, base: string, dark: string, spots?: string): void {
  c.disc(7.5, 8, 4.6, base);
  c.disc(10, 9.5, 2.6, dark);
  c.set(5, 5, lighten(base));
  c.set(6, 5, lighten(base));
  if (spots) { c.set(6, 8, spots); c.set(9, 6, spots); c.set(8, 10, spots); c.set(5, 10, spots); }
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 50), g = Math.min(255, ((n >> 8) & 255) + 50), b = Math.min(255, (n & 255) + 50);
  return `rgb(${r},${g},${b})`;
}

function bucket(c: Canvas16, fill: string | null): void {
  for (let y = 0; y < 8; y++) {
    const inset = Math.floor(y / 4);
    for (let x = 3 + inset; x < 13 - inset; x++) c.set(x, 6 + y, y === 0 ? '#e4e4e4' : x === 3 + inset ? '#bcbcbc' : x === 12 - inset ? '#7a7a7a' : '#9c9c9c');
  }
  c.rect(3, 4, 10, 1, '#c8c8c8');
  c.line(4, 4, 5, 2, '#9c9c9c'); c.line(11, 4, 10, 2, '#9c9c9c'); c.line(5, 2, 10, 2, '#9c9c9c');
  if (fill) { c.rect(4, 5, 8, 1, fill); c.rect(5, 6, 6, 1, fill); }
}

function food(c: Canvas16, name: string): void {
  switch (name) {
    case 'Apple': c.disc(8, 9, 4.5, '#d42a2a'); c.set(6, 6, '#ff8a8a'); c.rect(8, 3, 1, 3, '#6a4a1a'); c.rect(9, 3, 3, 2, '#3c9a2c'); break;
    case 'Golden Apple': c.disc(8, 9, 4.5, '#f4cc2a'); c.set(6, 6, '#fff7a8'); c.rect(8, 3, 1, 3, '#7a5a1a'); c.rect(9, 3, 3, 2, '#3c9a2c'); c.set(10, 10, '#c9980a'); break;
    case 'Bread': for (let x = 2; x < 14; x++) for (let y = 6; y < 12; y++) c.set(x, y, y < 8 ? '#c9893a' : y > 10 ? '#8a5a20' : '#b87a2c'); c.rect(3, 5, 10, 1, '#d9a050'); c.set(5, 7, '#e8b868'); c.set(9, 7, '#e8b868'); break;
    case 'Raw Pork': case 'Cooked Pork': case 'Raw Beef': case 'Cooked Beef': {
      const raw = name.startsWith('Raw');
      const meat = name.includes('Pork') ? (raw ? '#f0a0a0' : '#b8683c') : (raw ? '#c83a3a' : '#7a3a1c');
      c.disc(8, 8, 5, meat); c.disc(10, 9, 2.4, raw ? '#fff4f0' : '#5a2a10'); c.set(5, 6, lighten(meat)); c.set(6, 5, lighten(meat)); break;
    }
    case 'Raw Chicken': case 'Cooked Chicken': {
      const meat = name.startsWith('Raw') ? '#f2c4b0' : '#b8742c';
      c.disc(9, 6, 3.6, meat); c.line(7, 8, 3, 12, '#eee8d8'); c.line(8, 8, 4, 12, '#eee8d8'); c.rect(2, 12, 3, 2, '#f4f0e0'); c.set(8, 4, lighten(meat)); break;
    }
    case 'Raw Fish': case 'Cooked Fish': {
      const body = name.startsWith('Raw') ? '#7ea8b8' : '#b87a3c';
      for (let x = 3; x < 13; x++) { const h = 2 + Math.round(Math.sin((x - 3) / 9 * Math.PI) * 2.5); for (let y = 8 - h; y <= 8 + h - 1; y++) c.set(x, y, y < 8 ? lighten(body) : body); }
      c.set(5, 7, '#101010'); c.line(13, 6, 15, 4, body); c.line(13, 8, 15, 10, body); break;
    }
    case 'Mushroom Stew': bowlShape(c, '#8a5a2c'); c.rect(4, 6, 8, 2, '#a8683a'); c.set(6, 6, '#d44a4a'); c.set(9, 6, '#d44a4a'); break;
    case 'Honey': c.rect(5, 5, 6, 8, '#e6a022'); c.rect(6, 6, 2, 5, '#ffd66a'); c.rect(6, 3, 4, 2, '#8a5a2c'); c.rect(5, 12, 6, 1, '#b87a10'); break;
    default: c.disc(8, 8, 4, '#cccccc');
  }
}

function bowlShape(c: Canvas16, inside: string): void {
  for (let y = 0; y < 5; y++) for (let x = 2 + Math.floor(y / 2); x < 14 - Math.floor(y / 2); x++) c.set(x, 7 + y, y === 0 ? inside : '#8a6a3c');
  c.rect(3, 7, 10, 1, inside);
}

function material(c: Canvas16, name: string): void {
  switch (name) {
    case 'Stick': c.line(3, 13, 12, 3, HANDLE.m); c.line(4, 13, 13, 3, HANDLE.l); break;
    case 'Coal': lump(c, '#2a2a2a', '#171717', '#555555'); break;
    case 'Raw Iron': lump(c, '#9a8a7a', '#6e5e50', '#d8a888'); break;
    case 'Raw Gold': lump(c, '#a89a6a', '#7a6c3c', '#f4d040'); break;
    case 'Iron Ingot': ingot(c, IRON); break;
    case 'Gold Ingot': ingot(c, GOLD); break;
    case 'Diamond': gem(c, DIAMOND); break;
    case 'Emerald': gem(c, { m: '#2ec45a', l: '#8af2a4', d: '#16803a' }); break;
    case 'Nether Quartz': gem(c, { m: '#e8e2d8', l: '#ffffff', d: '#b0a89a' }); break;
    case 'Bone': c.line(4, 12, 12, 4, '#ece6d0'); c.line(5, 12, 13, 4, '#d4ccb0'); c.disc(3.5, 12.5, 1.6, '#ece6d0'); c.disc(12.5, 3.5, 1.6, '#ece6d0'); break;
    case 'Feather': c.line(3, 13, 12, 3, '#e8e8e8'); for (let i = 0; i < 6; i++) { c.set(5 + i, 11 - i + 1, '#ffffff'); c.set(6 + i, 11 - i + 2, '#cfcfcf'); c.set(4 + i, 10 - i, '#f4f4f4'); } break;
    case 'Leather': for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) c.set(x, y, (x + y) % 5 === 0 ? LEATHER.d : LEATHER.m); c.rect(3, 3, 10, 1, LEATHER.l); c.set(4, 12, null); c.set(12, 3, null); break;
    case 'String': c.line(3, 12, 8, 6, '#f0f0f0'); c.line(8, 6, 13, 12, '#d0d0d0'); c.line(5, 4, 11, 11, '#e4e4e4'); break;
    case 'Arrow': c.line(3, 12, 12, 3, '#8a6a3c'); c.set(13, 2, '#aaaaaa'); c.set(12, 2, '#cccccc'); c.set(13, 3, '#888888'); c.set(2, 13, '#e8e8e8'); c.set(3, 13, '#e8e8e8'); c.set(2, 12, '#e8e8e8'); break;
    case 'Ender Pearl': c.disc(8, 8, 4.6, '#1a6a5a'); c.disc(7, 7, 2.6, '#2a9a82'); c.set(6, 6, '#a8ffe8'); c.set(10, 10, '#0a3a30'); break;
    case 'Eye of Ender': c.disc(8, 8, 4.8, '#1a6a5a'); c.disc(7, 7, 2.8, '#2a9a82'); c.disc(8, 8, 1.7, '#0a1a14'); c.set(8, 8, '#f08020'); c.set(6, 6, '#a8ffe8'); break;
    case 'Blaze Rod': c.line(3, 13, 12, 4, '#e0902a'); c.line(4, 13, 13, 4, '#f8c040'); c.set(13, 3, '#fff0a0'); c.set(2, 14, '#a05a10'); break;
    case 'Blaze Powder': for (const [x, y, k] of [[5, 9, 0], [8, 7, 1], [10, 10, 0], [7, 11, 1], [6, 6, 0], [9, 9, 1], [11, 7, 0]] as [number, number, number][]) { c.rect(x - 1, y - 1, 2, 2, k ? '#ffd040' : '#f08a20'); } break;
    case 'Flint': c.disc(8, 9, 4, '#3a3a3a'); c.disc(7, 8, 2.2, '#585858'); c.set(11, 6, '#303030'); c.set(5, 7, '#9a9a9a'); c.set(9, 4, '#282828'); break;
    case 'Ghast Tear': c.disc(8, 10, 3.6, '#f4f4f8'); for (let i = 0; i < 5; i++) c.set(8, 2 + i, i < 2 ? '#d8d8e8' : '#f4f4f8'); c.set(7, 9, '#ffffff'); c.set(10, 12, '#b8b8cc'); break;
    case 'Bucket': bucket(c, null); break;
    case 'Water Bucket': bucket(c, '#3a7ae0'); break;
    case 'Lava Bucket': bucket(c, '#f07a10'); break;
    case 'Bowl': bowlShape(c, '#6a4a22'); break;
    case 'Wheat': for (let i = 0; i < 3; i++) { c.line(4 + i * 3, 14, 5 + i * 3, 3, '#a8883c'); for (let k = 0; k < 4; k++) { c.set(4 + i * 3, 4 + k * 2, '#e8c050'); c.set(6 + i * 3, 3 + k * 2, '#d8a838'); } } break;
    case 'Egg': c.disc(8, 9, 3.8, '#f2e8d4'); c.disc(8, 6.5, 2.6, '#f2e8d4'); c.set(6, 7, '#ffffff'); c.set(10, 11, '#cbb898'); break;
    case 'Music Disc': c.disc(8, 8, 6, '#151515'); c.disc(8, 8, 2.4, '#d8402a'); c.set(8, 8, '#000000'); c.set(5, 5, '#3a3a4a'); c.set(11, 6, '#3a3a4a'); break;
    default: c.disc(8, 8, 4, '#c0c0c0');
  }
}

function special(c: Canvas16, name: string): boolean {
  if (name === 'Bow') {
    for (let t = -6; t <= 6; t++) { const x = 4 + Math.round((36 - t * t) / 9); c.set(x, 8 + t, '#8a6a3c'); c.set(x + 1, 8 + t, '#a98350'); }
    c.line(4, 2, 4, 14, '#e8e8e8');
    return true;
  }
  if (name === 'Shield') {
    for (let y = 2; y < 14; y++) { const w = y > 9 ? 12 - y : 5; for (let x = 8 - w; x < 8 + w; x++) c.set(x, y, x < 8 ? '#8a6a3c' : '#6e532c'); }
    c.rect(7, 2, 2, 10, '#c8c8c8'); c.rect(3, 6, 10, 2, '#c8c8c8'); c.set(7, 6, '#f0f0f0');
    return true;
  }
  if (name === 'Fishing Rod') {
    c.line(3, 14, 12, 3, HANDLE.m); c.line(4, 14, 13, 3, HANDLE.l);
    c.line(13, 3, 14, 12, '#e8e8e8'); c.set(14, 13, '#d03030');
    return true;
  }
  if (name === 'Flint and Steel') {
    c.rect(3, 8, 8, 5, '#9a9a9a'); c.rect(3, 8, 8, 1, '#d4d4d4'); c.rect(3, 12, 8, 1, '#6a6a6a');
    c.rect(4, 9, 6, 3, '#7a7a7a');
    c.rect(5, 10, 4, 1, '#c0c0c0');
    c.disc(11.5, 4.5, 2.6, '#3a3a3a'); c.set(10, 3, '#8a8a8a'); c.line(9, 6, 11, 8, '#6a6a6a');
    return true;
  }
  return false;
}

const cache = new Map<number, Pixels>();

export function getItemIconPixels(type: ItemType, name: string): Pixels {
  const hit = cache.get(type);
  if (hit) return hit;
  const c = new Canvas16();
  const parts = name.split(' ');
  const last = parts[parts.length - 1];
  if (special(c, name)) {
    // drawn
  } else if (['Pickaxe', 'Axe', 'Shovel', 'Sword'].includes(last)) {
    tool(c, last, matOf(name));
  } else if (['Helmet', 'Chestplate', 'Leggings', 'Boots'].includes(last)) {
    armor(c, last, matOf(name));
  } else if (/^(Raw Pork|Cooked Pork|Raw Beef|Cooked Beef|Raw Fish|Cooked Fish|Apple|Golden Apple|Bread|Mushroom Stew|Raw Chicken|Cooked Chicken|Honey)$/.test(name)) {
    food(c, name);
  } else {
    material(c, name);
  }
  c.outline();
  cache.set(type, c.px);
  return c.px;
}

/** Draw into a 2D canvas context (scaled to `size` pixels) */
export function drawItemIconToContext(ctx: CanvasRenderingContext2D, type: ItemType, name: string, size = 16): void {
  const px = getItemIconPixels(type, name);
  const k = size / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const col = px[y * S + x];
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x * k), Math.floor(y * k), Math.ceil(k), Math.ceil(k));
  }
}

export function makeItemIconCanvas(type: ItemType, name: string, size = 16): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  drawItemIconToContext(canvas.getContext('2d')!, type, name, size);
  return canvas;
}
