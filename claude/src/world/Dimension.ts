import type { Chunk } from './Chunk';
import type { BiomeSystem } from './BiomeSystem';
import type { StructureTypeName, StructureLocation } from './StructureGenerator';

export enum Dimension {
  OVERWORLD = 0,
  NETHER = 1,
  END = 2,
}

export const DIMENSION_NAMES: Record<Dimension, string> = {
  [Dimension.OVERWORLD]: 'Overworld',
  [Dimension.NETHER]: 'The Nether',
  [Dimension.END]: 'The End',
};

/** Every dimension has its own terrain generator */
export interface ChunkGenerator {
  readonly biomeSystem: BiomeSystem | null;
  generateChunk(chunk: Chunk): void;
  findNearestStructure?(px: number, pz: number, type: StructureTypeName): StructureLocation | null;
}
