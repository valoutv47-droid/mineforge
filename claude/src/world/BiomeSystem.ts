import { BlockType } from '../blocks/BlockTypes';
import { fbm2d, noise2d } from '../utils/noise';

export enum Biome {
  PLAINS = 0,
  FOREST = 1,
  DESERT = 2,
  TAIGA = 3,
  JUNGLE = 4,
  SWAMP = 5,
  SAVANNA = 6,
  MOUNTAINS = 7,
  SNOWY_PLAINS = 8,
  BADLANDS = 9,
  BIRCH_FOREST = 10,
}

export type TreeType = 'oak' | 'birch' | 'spruce' | 'jungle' | 'acacia' | 'swamp_oak' | 'forest_mix' | 'none';

export interface VegetationEntry {
  readonly type: BlockType;
  readonly chance: number;
}

export interface BiomeConfig {
  readonly name: string;
  readonly surfaceBlock: BlockType;
  readonly subsurfaceBlock: BlockType;
  readonly deepBlock: BlockType;
  readonly treeType: TreeType;
  readonly treeDensity: number;
  readonly vegetation: readonly VegetationEntry[];
  readonly heightModifier: number;
  readonly fogColor: readonly [number, number, number];
  readonly fogDensity: number;
  readonly waterColor: readonly [number, number, number];
  readonly grassTint: readonly [number, number, number];
  readonly leavesTint: readonly [number, number, number];
  readonly cold: boolean;
}

const BIOME_CONFIGS: Record<Biome, BiomeConfig> = {
  [Biome.PLAINS]: {
    name: 'Plains',
    surfaceBlock: BlockType.GRASS, subsurfaceBlock: BlockType.DIRT, deepBlock: BlockType.STONE,
    treeType: 'oak', treeDensity: 0.003,
    vegetation: [
      { type: BlockType.TALL_GRASS, chance: 0.30 },
      { type: BlockType.FLOWER_RED, chance: 0.02 },
      { type: BlockType.FLOWER_YELLOW, chance: 0.02 },
    ],
    heightModifier: 0.6,
    fogColor: [0.75, 0.85, 1.0], fogDensity: 1.0,
    waterColor: [0.2, 0.5, 0.8],
    grassTint: [0.45, 0.74, 0.19], leavesTint: [0.36, 0.73, 0.24], cold: false,
  },
  [Biome.FOREST]: {
    name: 'Forest',
    surfaceBlock: BlockType.GRASS, subsurfaceBlock: BlockType.DIRT, deepBlock: BlockType.STONE,
    treeType: 'forest_mix', treeDensity: 0.035,
    vegetation: [
      { type: BlockType.TALL_GRASS, chance: 0.20 },
      { type: BlockType.FLOWER_RED, chance: 0.01 },
      { type: BlockType.FLOWER_YELLOW, chance: 0.008 },
      { type: BlockType.MUSHROOM_BROWN, chance: 0.004 },
    ],
    heightModifier: 0.8,
    fogColor: [0.6, 0.78, 0.55], fogDensity: 1.1,
    waterColor: [0.18, 0.45, 0.7],
    grassTint: [0.35, 0.68, 0.15], leavesTint: [0.30, 0.65, 0.18], cold: false,
  },
  [Biome.BIRCH_FOREST]: {
    name: 'Birch Forest',
    surfaceBlock: BlockType.GRASS, subsurfaceBlock: BlockType.DIRT, deepBlock: BlockType.STONE,
    treeType: 'birch', treeDensity: 0.03,
    vegetation: [
      { type: BlockType.TALL_GRASS, chance: 0.22 },
      { type: BlockType.FLOWER_YELLOW, chance: 0.015 },
      { type: BlockType.FLOWER_RED, chance: 0.01 },
    ],
    heightModifier: 0.75,
    fogColor: [0.66, 0.82, 0.62], fogDensity: 1.0,
    waterColor: [0.2, 0.5, 0.75],
    grassTint: [0.50, 0.74, 0.22], leavesTint: [0.46, 0.72, 0.28], cold: false,
  },
  [Biome.DESERT]: {
    name: 'Desert',
    surfaceBlock: BlockType.SAND, subsurfaceBlock: BlockType.SAND, deepBlock: BlockType.SANDSTONE,
    treeType: 'none', treeDensity: 0.0,
    vegetation: [
      { type: BlockType.DEAD_BUSH, chance: 0.012 },
      { type: BlockType.CACTUS, chance: 0.006 },
    ],
    heightModifier: 0.5,
    fogColor: [0.95, 0.88, 0.7], fogDensity: 0.8,
    waterColor: [0.3, 0.6, 0.7],
    grassTint: [0.6, 0.65, 0.2], leavesTint: [0.5, 0.6, 0.2], cold: false,
  },
  [Biome.BADLANDS]: {
    name: 'Badlands',
    surfaceBlock: BlockType.RED_SAND, subsurfaceBlock: BlockType.TERRACOTTA, deepBlock: BlockType.TERRACOTTA,
    treeType: 'none', treeDensity: 0.0,
    vegetation: [
      { type: BlockType.DEAD_BUSH, chance: 0.02 },
      { type: BlockType.CACTUS, chance: 0.003 },
    ],
    heightModifier: 0.95,
    fogColor: [0.95, 0.8, 0.62], fogDensity: 0.85,
    waterColor: [0.35, 0.55, 0.6],
    grassTint: [0.62, 0.6, 0.22], leavesTint: [0.55, 0.58, 0.2], cold: false,
  },
  [Biome.TAIGA]: {
    name: 'Taiga',
    surfaceBlock: BlockType.GRASS, subsurfaceBlock: BlockType.DIRT, deepBlock: BlockType.STONE,
    treeType: 'spruce', treeDensity: 0.022,
    vegetation: [
      { type: BlockType.FERN, chance: 0.18 },
      { type: BlockType.TALL_GRASS, chance: 0.08 },
      { type: BlockType.MUSHROOM_RED, chance: 0.004 },
    ],
    heightModifier: 0.9,
    fogColor: [0.65, 0.72, 0.82], fogDensity: 1.2,
    waterColor: [0.15, 0.35, 0.65],
    grassTint: [0.30, 0.55, 0.28], leavesTint: [0.18, 0.42, 0.18], cold: true,
  },
  [Biome.SNOWY_PLAINS]: {
    name: 'Snowy Plains',
    surfaceBlock: BlockType.SNOW, subsurfaceBlock: BlockType.DIRT, deepBlock: BlockType.STONE,
    treeType: 'spruce', treeDensity: 0.003,
    vegetation: [],
    heightModifier: 0.55,
    fogColor: [0.82, 0.9, 1.0], fogDensity: 1.0,
    waterColor: [0.2, 0.4, 0.75],
    grassTint: [0.45, 0.62, 0.40], leavesTint: [0.22, 0.45, 0.24], cold: true,
  },
  [Biome.JUNGLE]: {
    name: 'Jungle',
    surfaceBlock: BlockType.GRASS, subsurfaceBlock: BlockType.DIRT, deepBlock: BlockType.STONE,
    treeType: 'jungle', treeDensity: 0.04,
    vegetation: [
      { type: BlockType.FERN, chance: 0.30 },
      { type: BlockType.TALL_GRASS, chance: 0.25 },
      { type: BlockType.FLOWER_RED, chance: 0.01 },
      { type: BlockType.FLOWER_YELLOW, chance: 0.01 },
    ],
    heightModifier: 1.0,
    fogColor: [0.55, 0.75, 0.5], fogDensity: 1.4,
    waterColor: [0.1, 0.55, 0.55],
    grassTint: [0.22, 0.78, 0.15], leavesTint: [0.15, 0.72, 0.12], cold: false,
  },
  [Biome.SWAMP]: {
    name: 'Swamp',
    surfaceBlock: BlockType.GRASS, subsurfaceBlock: BlockType.DIRT, deepBlock: BlockType.CLAY,
    treeType: 'swamp_oak', treeDensity: 0.014,
    vegetation: [
      { type: BlockType.TALL_GRASS, chance: 0.25 },
      { type: BlockType.MUSHROOM_BROWN, chance: 0.01 },
      { type: BlockType.MUSHROOM_RED, chance: 0.005 },
      { type: BlockType.LILY_PAD, chance: 0.04 },
    ],
    heightModifier: 0.4,
    fogColor: [0.55, 0.6, 0.45], fogDensity: 1.6,
    waterColor: [0.25, 0.4, 0.2],
    grassTint: [0.40, 0.55, 0.22], leavesTint: [0.35, 0.50, 0.18], cold: false,
  },
  [Biome.SAVANNA]: {
    name: 'Savanna',
    surfaceBlock: BlockType.GRASS, subsurfaceBlock: BlockType.DIRT, deepBlock: BlockType.STONE,
    treeType: 'acacia', treeDensity: 0.006,
    vegetation: [
      { type: BlockType.TALL_GRASS, chance: 0.35 },
      { type: BlockType.DEAD_BUSH, chance: 0.008 },
    ],
    heightModifier: 0.55,
    fogColor: [0.9, 0.82, 0.6], fogDensity: 0.9,
    waterColor: [0.25, 0.55, 0.65],
    grassTint: [0.62, 0.68, 0.18], leavesTint: [0.55, 0.65, 0.15], cold: false,
  },
  [Biome.MOUNTAINS]: {
    name: 'Mountains',
    surfaceBlock: BlockType.STONE, subsurfaceBlock: BlockType.STONE, deepBlock: BlockType.STONE,
    treeType: 'spruce', treeDensity: 0.006,
    vegetation: [
      { type: BlockType.TALL_GRASS, chance: 0.05 },
      { type: BlockType.FERN, chance: 0.02 },
    ],
    heightModifier: 1.8,
    fogColor: [0.7, 0.78, 0.92], fogDensity: 1.0,
    waterColor: [0.15, 0.4, 0.75],
    grassTint: [0.35, 0.60, 0.22], leavesTint: [0.25, 0.50, 0.20], cold: true,
  },
};

const TEMP_OFFSET_X = 500;
const TEMP_OFFSET_Z = 500;
const HUMID_OFFSET_X = -300;
const HUMID_OFFSET_Z = 800;
const TEMP_SCALE = 0.0025;
const HUMID_SCALE = 0.003;
const MOUNTAIN_SCALE = 0.006;
const MOUNTAIN_THRESHOLD = 0.70;
const BLEND_STEP = 16;

export interface BlendInfo {
  heightMod: number;
  desert: number;
  badlands: number;
  mountains: number;
  swamp: number;
}

export class BiomeSystem {
  private readonly latticeCache: Map<number, Biome> = new Map();
  private readonly colorCache: Map<number, [number, number, number, number, number, number]> = new Map();

  getTemperature(wx: number, wz: number): number {
    return fbm2d((wx + TEMP_OFFSET_X) * TEMP_SCALE, (wz + TEMP_OFFSET_Z) * TEMP_SCALE, 3, 2.0, 0.45);
  }

  getHumidity(wx: number, wz: number): number {
    return fbm2d((wx + HUMID_OFFSET_X) * HUMID_SCALE, (wz + HUMID_OFFSET_Z) * HUMID_SCALE, 3, 2.0, 0.45);
  }

  getMountainFactor(wx: number, wz: number): number {
    return fbm2d(wx * MOUNTAIN_SCALE + 1000, wz * MOUNTAIN_SCALE + 1000, 4, 2.0, 0.5);
  }

  private classify(temp: number, humid: number): Biome {
    if (temp < 0.34) return humid < 0.5 ? Biome.SNOWY_PLAINS : Biome.TAIGA;
    if (temp < 0.44) {
      if (humid > 0.6) return Biome.TAIGA;
      if (humid < 0.38) return Biome.PLAINS;
      return Biome.BIRCH_FOREST;
    }
    if (temp < 0.58) {
      if (humid >= 0.64) return Biome.SWAMP;
      if (humid >= 0.36) return humid > 0.55 ? Biome.BIRCH_FOREST : Biome.FOREST;
      return Biome.PLAINS;
    }
    if (temp < 0.62) {
      if (humid < 0.36) return Biome.SAVANNA;
      if (humid > 0.62) return Biome.JUNGLE;
      return Biome.FOREST;
    }
    if (humid < 0.4) return temp > 0.68 && humid > 0.25 ? Biome.BADLANDS : Biome.DESERT;
    if (humid < 0.5) return Biome.SAVANNA;
    return Biome.JUNGLE;
  }

  /** Raw (un-jittered) biome, used for blending and tint grid */
  getBiomeRaw(wx: number, wz: number): Biome {
    if (this.getMountainFactor(wx, wz) > MOUNTAIN_THRESHOLD) return Biome.MOUNTAINS;
    return this.classify(this.getTemperature(wx, wz), this.getHumidity(wx, wz));
  }

  /** Biome of a column: sample point is wobbled so borders are ragged and mix */
  getBiome(wx: number, wz: number): Biome {
    const jx = noise2d(wx * 0.045 + 12.3, wz * 0.045 - 7.7) * 4.5;
    const jz = noise2d(wx * 0.045 - 31.1, wz * 0.045 + 52.9) * 4.5;
    return this.getBiomeRaw(wx + jx, wz + jz);
  }

  getConfig(biome: Biome): BiomeConfig {
    return BIOME_CONFIGS[biome];
  }

  private lattice(ix: number, iz: number): Biome {
    const key = (ix + 32768) * 65536 + (iz + 32768);
    let b = this.latticeCache.get(key);
    if (b === undefined) {
      b = this.getBiomeRaw(ix * BLEND_STEP, iz * BLEND_STEP);
      if (this.latticeCache.size > 60000) this.latticeCache.clear();
      this.latticeCache.set(key, b);
    }
    return b;
  }

  /** Smoothly blended terrain parameters (bilinear on a 16-block lattice) */
  getBlend(wx: number, wz: number): BlendInfo {
    const fx = wx / BLEND_STEP, fz = wz / BLEND_STEP;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    let tx = fx - ix, tz = fz - iz;
    tx = tx * tx * (3 - 2 * tx);
    tz = tz * tz * (3 - 2 * tz);
    const corners: [Biome, number][] = [
      [this.lattice(ix, iz), (1 - tx) * (1 - tz)],
      [this.lattice(ix + 1, iz), tx * (1 - tz)],
      [this.lattice(ix, iz + 1), (1 - tx) * tz],
      [this.lattice(ix + 1, iz + 1), tx * tz],
    ];
    const out: BlendInfo = { heightMod: 0, desert: 0, badlands: 0, mountains: 0, swamp: 0 };
    for (const [b, w] of corners) {
      out.heightMod += BIOME_CONFIGS[b].heightModifier * w;
      if (b === Biome.DESERT) out.desert += w;
      else if (b === Biome.BADLANDS) out.badlands += w;
      else if (b === Biome.MOUNTAINS) out.mountains += w;
      else if (b === Biome.SWAMP) out.swamp += w;
    }
    return out;
  }

  /** Smooth [grassRGB, leavesRGB] tint: box blur of biome colours */
  getBlendedTints(wx: number, wz: number): [number, number, number, number, number, number] {
    const cell = 4;
    const cx = Math.floor(wx / cell), cz = Math.floor(wz / cell);
    const key = (cx + 32768) * 65536 + (cz + 32768);
    let v = this.colorCache.get(key);
    if (v) return v;
    let gr = 0, gg = 0, gb = 0, lr = 0, lg = 0, lb = 0, n = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const b = this.getBiomeRaw(cx * cell + dx * 6 + 2, cz * cell + dz * 6 + 2);
        const c = BIOME_CONFIGS[b];
        gr += c.grassTint[0]; gg += c.grassTint[1]; gb += c.grassTint[2];
        lr += c.leavesTint[0]; lg += c.leavesTint[1]; lb += c.leavesTint[2];
        n++;
      }
    }
    v = [gr / n, gg / n, gb / n, lr / n, lg / n, lb / n];
    if (this.colorCache.size > 40000) this.colorCache.clear();
    this.colorCache.set(key, v);
    return v;
  }

  getSurfaceBlock(biome: Biome, height: number): BlockType {
    const config = BIOME_CONFIGS[biome];
    if (biome === Biome.MOUNTAINS) return height > 78 ? BlockType.SNOW : BlockType.STONE;
    if (biome === Biome.TAIGA && height > 56) return BlockType.SNOW;
    return config.surfaceBlock;
  }
}
