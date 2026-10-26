export enum MobType {
  ZOMBIE = 0,
  SKELETON = 1,
  CREEPER = 2,
  SPIDER = 3,
  PIG = 4,
  COW = 5,
  SHEEP = 6,
  HORSE = 7,
  SHARK = 8,
  FISH = 9,
  DOLPHIN = 10,
  CHICKEN = 11,
  WOLF = 12,
  BEE = 13,
  ENDERMAN = 14,
  ENDER_DRAGON = 15,
  ZOMBIE_PIGLIN = 16,
  GHAST = 17,
  BLAZE = 18,
  END_CRYSTAL = 19,
}

export interface BodyPartDef {
  name: string;
  width: number;
  height: number;
  depth: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  pivotX: number;
  pivotY: number;
  pivotZ: number;
  animated: boolean;
  animGroup?: 'legs' | 'arms' | 'head' | 'tail' | 'fins';
  animPhase?: number;
}

export interface DropDef {
  itemType: number;
  minCount: number;
  maxCount: number;
}

export interface MobDefinition {
  readonly type: MobType;
  readonly name: string;
  readonly maxHealth: number;
  readonly speed: number;
  readonly hostile: boolean;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly attackCooldown: number;
  readonly detectionRange: number;
  readonly width: number;
  readonly height: number;
  readonly rideable: boolean;
  readonly aquatic: boolean;
  /** Flying mobs ignore gravity (ghast, blaze, dragon) */
  readonly flying?: boolean;
  readonly bodyParts: readonly BodyPartDef[];
  readonly dropItems: readonly DropDef[];
}

const HUMANOID_PARTS: BodyPartDef[] = [
  { name: 'head', width: 0.5, height: 0.5, depth: 0.5, offsetX: 0, offsetY: 1.5, offsetZ: 0, pivotX: 0, pivotY: 1.5, pivotZ: 0, animated: true, animGroup: 'head' },
  { name: 'body', width: 0.5, height: 0.75, depth: 0.25, offsetX: 0, offsetY: 0.75, offsetZ: 0, pivotX: 0, pivotY: 0.75, pivotZ: 0, animated: false },
  { name: 'armLeft', width: 0.25, height: 0.75, depth: 0.25, offsetX: -0.375, offsetY: 0.75, offsetZ: 0, pivotX: -0.375, pivotY: 1.5, pivotZ: 0, animated: true, animGroup: 'arms', animPhase: 0 },
  { name: 'armRight', width: 0.25, height: 0.75, depth: 0.25, offsetX: 0.375, offsetY: 0.75, offsetZ: 0, pivotX: 0.375, pivotY: 1.5, pivotZ: 0, animated: true, animGroup: 'arms', animPhase: Math.PI },
  { name: 'legLeft', width: 0.25, height: 0.75, depth: 0.25, offsetX: -0.125, offsetY: 0, offsetZ: 0, pivotX: -0.125, pivotY: 0.75, pivotZ: 0, animated: true, animGroup: 'legs', animPhase: 0 },
  { name: 'legRight', width: 0.25, height: 0.75, depth: 0.25, offsetX: 0.125, offsetY: 0, offsetZ: 0, pivotX: 0.125, pivotY: 0.75, pivotZ: 0, animated: true, animGroup: 'legs', animPhase: Math.PI },
];

const QUADRUPED_PARTS: BodyPartDef[] = [
  { name: 'head', width: 0.375, height: 0.375, depth: 0.4, offsetX: 0, offsetY: 0.65, offsetZ: -0.4, pivotX: 0, pivotY: 0.65, pivotZ: -0.2, animated: true, animGroup: 'head' },
  { name: 'body', width: 0.5, height: 0.45, depth: 0.8, offsetX: 0, offsetY: 0.45, offsetZ: 0, pivotX: 0, pivotY: 0.45, pivotZ: 0, animated: false },
  { name: 'legFrontLeft', width: 0.2, height: 0.45, depth: 0.2, offsetX: -0.2, offsetY: 0, offsetZ: -0.25, pivotX: -0.2, pivotY: 0.45, pivotZ: -0.25, animated: true, animGroup: 'legs', animPhase: 0 },
  { name: 'legFrontRight', width: 0.2, height: 0.45, depth: 0.2, offsetX: 0.2, offsetY: 0, offsetZ: -0.25, pivotX: 0.2, pivotY: 0.45, pivotZ: -0.25, animated: true, animGroup: 'legs', animPhase: Math.PI },
  { name: 'legBackLeft', width: 0.2, height: 0.45, depth: 0.2, offsetX: -0.2, offsetY: 0, offsetZ: 0.25, pivotX: -0.2, pivotY: 0.45, pivotZ: 0.25, animated: true, animGroup: 'legs', animPhase: Math.PI },
  { name: 'legBackRight', width: 0.2, height: 0.45, depth: 0.2, offsetX: 0.2, offsetY: 0, offsetZ: 0.25, pivotX: 0.2, pivotY: 0.45, pivotZ: 0.25, animated: true, animGroup: 'legs', animPhase: 0 },
];

const HORSE_PARTS: BodyPartDef[] = [
  { name: 'head', width: 0.4, height: 0.5, depth: 0.55, offsetX: 0, offsetY: 1.2, offsetZ: -0.65, pivotX: 0, pivotY: 1.2, pivotZ: -0.35, animated: true, animGroup: 'head' },
  { name: 'neck', width: 0.3, height: 0.55, depth: 0.3, offsetX: 0, offsetY: 0.95, offsetZ: -0.4, pivotX: 0, pivotY: 0.95, pivotZ: -0.25, animated: false },
  { name: 'body', width: 0.6, height: 0.55, depth: 1.1, offsetX: 0, offsetY: 0.65, offsetZ: 0, pivotX: 0, pivotY: 0.65, pivotZ: 0, animated: false },
  { name: 'legFrontLeft', width: 0.2, height: 0.65, depth: 0.2, offsetX: -0.22, offsetY: 0, offsetZ: -0.35, pivotX: -0.22, pivotY: 0.65, pivotZ: -0.35, animated: true, animGroup: 'legs', animPhase: 0 },
  { name: 'legFrontRight', width: 0.2, height: 0.65, depth: 0.2, offsetX: 0.22, offsetY: 0, offsetZ: -0.35, pivotX: 0.22, pivotY: 0.65, pivotZ: -0.35, animated: true, animGroup: 'legs', animPhase: Math.PI },
  { name: 'legBackLeft', width: 0.2, height: 0.65, depth: 0.2, offsetX: -0.22, offsetY: 0, offsetZ: 0.35, pivotX: -0.22, pivotY: 0.65, pivotZ: 0.35, animated: true, animGroup: 'legs', animPhase: Math.PI },
  { name: 'legBackRight', width: 0.2, height: 0.65, depth: 0.2, offsetX: 0.22, offsetY: 0, offsetZ: 0.35, pivotX: 0.22, pivotY: 0.65, pivotZ: 0.35, animated: true, animGroup: 'legs', animPhase: 0 },
  { name: 'tail', width: 0.1, height: 0.4, depth: 0.1, offsetX: 0, offsetY: 0.85, offsetZ: 0.6, pivotX: 0, pivotY: 1.05, pivotZ: 0.55, animated: true, animGroup: 'arms', animPhase: 0 },
];

const SPIDER_PARTS: BodyPartDef[] = [
  { name: 'head', width: 0.5, height: 0.35, depth: 0.4, offsetX: 0, offsetY: 0.35, offsetZ: -0.45, pivotX: 0, pivotY: 0.35, pivotZ: -0.25, animated: true, animGroup: 'head' },
  { name: 'body', width: 0.65, height: 0.35, depth: 0.7, offsetX: 0, offsetY: 0.35, offsetZ: 0.1, pivotX: 0, pivotY: 0.35, pivotZ: 0.1, animated: false },
  { name: 'legL1', width: 0.08, height: 0.3, depth: 0.08, offsetX: -0.5, offsetY: 0.15, offsetZ: -0.2, pivotX: -0.32, pivotY: 0.35, pivotZ: -0.2, animated: true, animGroup: 'legs', animPhase: 0 },
  { name: 'legR1', width: 0.08, height: 0.3, depth: 0.08, offsetX: 0.5, offsetY: 0.15, offsetZ: -0.2, pivotX: 0.32, pivotY: 0.35, pivotZ: -0.2, animated: true, animGroup: 'legs', animPhase: Math.PI },
  { name: 'legL2', width: 0.08, height: 0.3, depth: 0.08, offsetX: -0.55, offsetY: 0.15, offsetZ: 0, pivotX: -0.32, pivotY: 0.35, pivotZ: 0, animated: true, animGroup: 'legs', animPhase: Math.PI * 0.5 },
  { name: 'legR2', width: 0.08, height: 0.3, depth: 0.08, offsetX: 0.55, offsetY: 0.15, offsetZ: 0, pivotX: 0.32, pivotY: 0.35, pivotZ: 0, animated: true, animGroup: 'legs', animPhase: Math.PI * 1.5 },
  { name: 'legL3', width: 0.08, height: 0.3, depth: 0.08, offsetX: -0.5, offsetY: 0.15, offsetZ: 0.2, pivotX: -0.32, pivotY: 0.35, pivotZ: 0.2, animated: true, animGroup: 'legs', animPhase: Math.PI },
  { name: 'legR3', width: 0.08, height: 0.3, depth: 0.08, offsetX: 0.5, offsetY: 0.15, offsetZ: 0.2, pivotX: 0.32, pivotY: 0.35, pivotZ: 0.2, animated: true, animGroup: 'legs', animPhase: 0 },
  { name: 'legL4', width: 0.08, height: 0.3, depth: 0.08, offsetX: -0.45, offsetY: 0.15, offsetZ: 0.4, pivotX: -0.32, pivotY: 0.35, pivotZ: 0.4, animated: true, animGroup: 'legs', animPhase: Math.PI * 0.5 },
  { name: 'legR4', width: 0.08, height: 0.3, depth: 0.08, offsetX: 0.45, offsetY: 0.15, offsetZ: 0.4, pivotX: 0.32, pivotY: 0.35, pivotZ: 0.4, animated: true, animGroup: 'legs', animPhase: Math.PI * 1.5 },
];

const SHARK_PARTS: BodyPartDef[] = [
  { name: 'body', width: 0.5, height: 0.4, depth: 1.4, offsetX: 0, offsetY: 0.2, offsetZ: 0, pivotX: 0, pivotY: 0.2, pivotZ: 0, animated: false },
  { name: 'head', width: 0.45, height: 0.35, depth: 0.5, offsetX: 0, offsetY: 0.22, offsetZ: -0.9, pivotX: 0, pivotY: 0.22, pivotZ: -0.65, animated: true, animGroup: 'head' },
  { name: 'tail', width: 0.08, height: 0.5, depth: 0.35, offsetX: 0, offsetY: 0.25, offsetZ: 0.8, pivotX: 0, pivotY: 0.25, pivotZ: 0.6, animated: true, animGroup: 'tail', animPhase: 0 },
  { name: 'finDorsal', width: 0.06, height: 0.35, depth: 0.3, offsetX: 0, offsetY: 0.55, offsetZ: -0.1, pivotX: 0, pivotY: 0.4, pivotZ: -0.1, animated: false },
  { name: 'finLeft', width: 0.35, height: 0.06, depth: 0.2, offsetX: -0.35, offsetY: 0.1, offsetZ: -0.15, pivotX: -0.18, pivotY: 0.15, pivotZ: -0.15, animated: true, animGroup: 'fins', animPhase: 0 },
  { name: 'finRight', width: 0.35, height: 0.06, depth: 0.2, offsetX: 0.35, offsetY: 0.1, offsetZ: -0.15, pivotX: 0.18, pivotY: 0.15, pivotZ: -0.15, animated: true, animGroup: 'fins', animPhase: Math.PI },
];

const FISH_PARTS: BodyPartDef[] = [
  { name: 'body', width: 0.15, height: 0.12, depth: 0.35, offsetX: 0, offsetY: 0.06, offsetZ: 0, pivotX: 0, pivotY: 0.06, pivotZ: 0, animated: false },
  { name: 'tail', width: 0.02, height: 0.15, depth: 0.1, offsetX: 0, offsetY: 0.06, offsetZ: 0.2, pivotX: 0, pivotY: 0.06, pivotZ: 0.15, animated: true, animGroup: 'tail', animPhase: 0 },
  { name: 'finDorsal', width: 0.02, height: 0.08, depth: 0.1, offsetX: 0, offsetY: 0.16, offsetZ: 0, pivotX: 0, pivotY: 0.12, pivotZ: 0, animated: false },
];

const DOLPHIN_PARTS: BodyPartDef[] = [
  { name: 'body', width: 0.35, height: 0.3, depth: 1.0, offsetX: 0, offsetY: 0.15, offsetZ: 0, pivotX: 0, pivotY: 0.15, pivotZ: 0, animated: false },
  { name: 'head', width: 0.3, height: 0.25, depth: 0.45, offsetX: 0, offsetY: 0.17, offsetZ: -0.65, pivotX: 0, pivotY: 0.17, pivotZ: -0.45, animated: true, animGroup: 'head' },
  { name: 'snout', width: 0.15, height: 0.1, depth: 0.3, offsetX: 0, offsetY: 0.14, offsetZ: -1.0, pivotX: 0, pivotY: 0.14, pivotZ: -0.85, animated: false },
  { name: 'tail', width: 0.06, height: 0.08, depth: 0.3, offsetX: 0, offsetY: 0.15, offsetZ: 0.55, pivotX: 0, pivotY: 0.15, pivotZ: 0.4, animated: true, animGroup: 'tail', animPhase: 0 },
  { name: 'fluke', width: 0.35, height: 0.04, depth: 0.15, offsetX: 0, offsetY: 0.15, offsetZ: 0.75, pivotX: 0, pivotY: 0.15, pivotZ: 0.65, animated: true, animGroup: 'tail', animPhase: 0.3 },
  { name: 'finLeft', width: 0.25, height: 0.04, depth: 0.15, offsetX: -0.25, offsetY: 0.08, offsetZ: -0.1, pivotX: -0.12, pivotY: 0.12, pivotZ: -0.1, animated: true, animGroup: 'fins', animPhase: 0 },
  { name: 'finRight', width: 0.25, height: 0.04, depth: 0.15, offsetX: 0.25, offsetY: 0.08, offsetZ: -0.1, pivotX: 0.12, pivotY: 0.12, pivotZ: -0.1, animated: true, animGroup: 'fins', animPhase: Math.PI },
  { name: 'finDorsal', width: 0.04, height: 0.2, depth: 0.2, offsetX: 0, offsetY: 0.4, offsetZ: -0.05, pivotX: 0, pivotY: 0.3, pivotZ: -0.05, animated: false },
];

const GHAST_PARTS: BodyPartDef[] = (() => {
  const parts: BodyPartDef[] = [
    { name: 'head', width: 4, height: 4, depth: 4, offsetX: 0, offsetY: 1.1, offsetZ: 0, pivotX: 0, pivotY: 3, pivotZ: 0, animated: true, animGroup: 'head' },
  ];
  let n = 0;
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      const len = 1.0 + ((n * 7) % 5) * 0.12;
      parts.push({
        name: `tentacle${n}`, width: 0.5, height: len, depth: 0.5,
        offsetX: ix * 1.2, offsetY: 1.1 - len, offsetZ: iz * 1.2,
        pivotX: ix * 1.2, pivotY: 1.1, pivotZ: iz * 1.2,
        animated: true, animGroup: 'legs', animPhase: n * 0.8,
      });
      n++;
    }
  }
  return parts;
})();

const BLAZE_PARTS: BodyPartDef[] = (() => {
  const parts: BodyPartDef[] = [
    { name: 'head', width: 0.5, height: 0.5, depth: 0.5, offsetX: 0, offsetY: 1.3, offsetZ: 0, pivotX: 0, pivotY: 1.5, pivotZ: 0, animated: true, animGroup: 'head' },
    { name: 'core', width: 0.3, height: 0.9, depth: 0.3, offsetX: 0, offsetY: 0.4, offsetZ: 0, pivotX: 0, pivotY: 0.4, pivotZ: 0, animated: false },
  ];
  const rings = [[0.1, 0.0], [0.6, 0.78], [1.0, 0.4]];
  let n = 0;
  for (const [y, rot] of rings) {
    for (let k = 0; k < 4; k++) {
      const a = rot + (k * Math.PI) / 2;
      const r = 0.42;
      parts.push({
        name: `rod${n++}`, width: 0.14, height: 0.55, depth: 0.14,
        offsetX: Math.cos(a) * r, offsetY: y, offsetZ: Math.sin(a) * r,
        pivotX: 0, pivotY: 0, pivotZ: 0, animated: false,
      });
    }
  }
  return parts;
})();

const CRYSTAL_PARTS: BodyPartDef[] = [
  { name: 'base', width: 0.8, height: 0.3, depth: 0.8, offsetX: 0, offsetY: 0.0, offsetZ: 0, pivotX: 0, pivotY: 0, pivotZ: 0, animated: false },
  { name: 'crystalOuter', width: 0.85, height: 0.85, depth: 0.85, offsetX: 0, offsetY: 0.55, offsetZ: 0, pivotX: 0, pivotY: 0.55, pivotZ: 0, animated: false },
  { name: 'crystalInner', width: 0.5, height: 0.5, depth: 0.5, offsetX: 0, offsetY: 0.73, offsetZ: 0, pivotX: 0, pivotY: 0.73, pivotZ: 0, animated: false },
];

const DRAGON_PARTS: BodyPartDef[] = [
  { name: 'body', width: 2.2, height: 1.8, depth: 4.6, offsetX: 0, offsetY: 0.4, offsetZ: 0, pivotX: 0, pivotY: 1.3, pivotZ: 0, animated: false },
  { name: 'neck1', width: 1.1, height: 1.1, depth: 1.5, offsetX: 0, offsetY: 0.9, offsetZ: -2.8, pivotX: 0, pivotY: 1.4, pivotZ: -2.5, animated: false },
  { name: 'neck2', width: 1.0, height: 1.0, depth: 1.5, offsetX: 0, offsetY: 1.15, offsetZ: -4.0, pivotX: 0, pivotY: 1.6, pivotZ: -3.7, animated: false },
  { name: 'head', width: 1.7, height: 1.2, depth: 2.2, offsetX: 0, offsetY: 1.3, offsetZ: -5.5, pivotX: 0, pivotY: 1.8, pivotZ: -4.6, animated: true, animGroup: 'head' },
  { name: 'wingLeft', width: 6.2, height: 0.18, depth: 3.2, offsetX: -4.2, offsetY: 1.9, offsetZ: 0.3, pivotX: -1.1, pivotY: 2.0, pivotZ: 0.3, animated: true, animGroup: 'fins', animPhase: 0 },
  { name: 'wingRight', width: 6.2, height: 0.18, depth: 3.2, offsetX: 4.2, offsetY: 1.9, offsetZ: 0.3, pivotX: 1.1, pivotY: 2.0, pivotZ: 0.3, animated: true, animGroup: 'fins', animPhase: Math.PI },
  { name: 'tail1', width: 1.2, height: 1.0, depth: 1.7, offsetX: 0, offsetY: 0.7, offsetZ: 3.3, pivotX: 0, pivotY: 1.2, pivotZ: 2.5, animated: true, animGroup: 'tail', animPhase: 0 },
  { name: 'tail2', width: 0.95, height: 0.8, depth: 1.7, offsetX: 0, offsetY: 0.6, offsetZ: 4.9, pivotX: 0, pivotY: 1.1, pivotZ: 4.1, animated: true, animGroup: 'tail', animPhase: 0.6 },
  { name: 'tail3', width: 0.7, height: 0.6, depth: 1.7, offsetX: 0, offsetY: 0.5, offsetZ: 6.5, pivotX: 0, pivotY: 0.9, pivotZ: 5.7, animated: true, animGroup: 'tail', animPhase: 1.2 },
  { name: 'tail4', width: 0.45, height: 0.45, depth: 1.7, offsetX: 0, offsetY: 0.4, offsetZ: 8.1, pivotX: 0, pivotY: 0.7, pivotZ: 7.3, animated: true, animGroup: 'tail', animPhase: 1.8 },
  { name: 'legFL', width: 0.6, height: 1.2, depth: 0.7, offsetX: -0.8, offsetY: -0.7, offsetZ: -1.2, pivotX: -0.8, pivotY: 0.5, pivotZ: -1.2, animated: false },
  { name: 'legFR', width: 0.6, height: 1.2, depth: 0.7, offsetX: 0.8, offsetY: -0.7, offsetZ: -1.2, pivotX: 0.8, pivotY: 0.5, pivotZ: -1.2, animated: false },
  { name: 'legBL', width: 0.7, height: 1.4, depth: 0.8, offsetX: -0.8, offsetY: -0.9, offsetZ: 1.6, pivotX: -0.8, pivotY: 0.5, pivotZ: 1.6, animated: false },
  { name: 'legBR', width: 0.7, height: 1.4, depth: 0.8, offsetX: 0.8, offsetY: -0.9, offsetZ: 1.6, pivotX: 0.8, pivotY: 0.5, pivotZ: 1.6, animated: false },
];

export const MOB_DEFINITIONS: Record<MobType, MobDefinition> = {
  [MobType.ZOMBIE]: {
    type: MobType.ZOMBIE, name: 'Zombie', maxHealth: 20, speed: 2.5,
    hostile: true, attackDamage: 3, attackRange: 1.8, attackCooldown: 1.2,
    detectionRange: 16, width: 0.6, height: 1.8, rideable: false, aquatic: false,
    bodyParts: HUMANOID_PARTS, dropItems: [{ itemType: 140, minCount: 0, maxCount: 2 }],
  },
  [MobType.SKELETON]: {
    type: MobType.SKELETON, name: 'Skeleton', maxHealth: 20, speed: 3.0,
    hostile: true, attackDamage: 2, attackRange: 1.8, attackCooldown: 1.5,
    detectionRange: 16, width: 0.6, height: 1.8, rideable: false, aquatic: false,
    bodyParts: HUMANOID_PARTS, dropItems: [{ itemType: 137, minCount: 0, maxCount: 2 }, { itemType: 118, minCount: 0, maxCount: 3 }],
  },
  [MobType.CREEPER]: {
    type: MobType.CREEPER, name: 'Creeper', maxHealth: 20, speed: 2.0,
    hostile: true, attackDamage: 8, attackRange: 3.0, attackCooldown: 1.5,
    detectionRange: 16, width: 0.6, height: 1.7, rideable: false, aquatic: false,
    bodyParts: [
      { name: 'head', width: 0.5, height: 0.5, depth: 0.5, offsetX: 0, offsetY: 1.2, offsetZ: 0, pivotX: 0, pivotY: 1.2, pivotZ: 0, animated: true, animGroup: 'head' },
      { name: 'body', width: 0.4, height: 0.7, depth: 0.25, offsetX: 0, offsetY: 0.5, offsetZ: 0, pivotX: 0, pivotY: 0.5, pivotZ: 0, animated: false },
      { name: 'legFrontLeft', width: 0.2, height: 0.5, depth: 0.25, offsetX: -0.15, offsetY: 0, offsetZ: -0.15, pivotX: -0.15, pivotY: 0.5, pivotZ: -0.15, animated: true, animGroup: 'legs', animPhase: 0 },
      { name: 'legFrontRight', width: 0.2, height: 0.5, depth: 0.25, offsetX: 0.15, offsetY: 0, offsetZ: -0.15, pivotX: 0.15, pivotY: 0.5, pivotZ: -0.15, animated: true, animGroup: 'legs', animPhase: Math.PI },
      { name: 'legBackLeft', width: 0.2, height: 0.5, depth: 0.25, offsetX: -0.15, offsetY: 0, offsetZ: 0.15, pivotX: -0.15, pivotY: 0.5, pivotZ: 0.15, animated: true, animGroup: 'legs', animPhase: Math.PI },
      { name: 'legBackRight', width: 0.2, height: 0.5, depth: 0.25, offsetX: 0.15, offsetY: 0, offsetZ: 0.15, pivotX: 0.15, pivotY: 0.5, pivotZ: 0.15, animated: true, animGroup: 'legs', animPhase: 0 },
    ],
    dropItems: [],
  },
  [MobType.SPIDER]: {
    type: MobType.SPIDER, name: 'Spider', maxHealth: 16, speed: 3.5,
    hostile: true, attackDamage: 2, attackRange: 1.6, attackCooldown: 1.0,
    detectionRange: 16, width: 1.0, height: 0.7, rideable: false, aquatic: false,
    bodyParts: SPIDER_PARTS, dropItems: [{ itemType: 140, minCount: 0, maxCount: 2 }],
  },
  [MobType.PIG]: {
    type: MobType.PIG, name: 'Pig', maxHealth: 10, speed: 2.0,
    hostile: false, attackDamage: 0, attackRange: 0, attackCooldown: 0,
    detectionRange: 0, width: 0.5, height: 0.85, rideable: false, aquatic: false,
    bodyParts: QUADRUPED_PARTS, dropItems: [{ itemType: 150, minCount: 1, maxCount: 3 }],
  },
  [MobType.COW]: {
    type: MobType.COW, name: 'Cow', maxHealth: 10, speed: 2.0,
    hostile: false, attackDamage: 0, attackRange: 0, attackCooldown: 0,
    detectionRange: 0, width: 0.55, height: 1.0, rideable: false, aquatic: false,
    bodyParts: QUADRUPED_PARTS, dropItems: [{ itemType: 152, minCount: 1, maxCount: 3 }, { itemType: 139, minCount: 0, maxCount: 2 }],
  },
  [MobType.SHEEP]: {
    type: MobType.SHEEP, name: 'Sheep', maxHealth: 8, speed: 2.0,
    hostile: false, attackDamage: 0, attackRange: 0, attackCooldown: 0,
    detectionRange: 0, width: 0.5, height: 0.9, rideable: false, aquatic: false,
    bodyParts: QUADRUPED_PARTS, dropItems: [{ itemType: 21, minCount: 1, maxCount: 2 }],
  },
  [MobType.HORSE]: {
    type: MobType.HORSE, name: 'Horse', maxHealth: 20, speed: 6.0,
    hostile: false, attackDamage: 0, attackRange: 0, attackCooldown: 0,
    detectionRange: 0, width: 0.7, height: 1.5, rideable: true, aquatic: false,
    bodyParts: HORSE_PARTS, dropItems: [],
  },
  [MobType.SHARK]: {
    type: MobType.SHARK, name: 'Shark', maxHealth: 20, speed: 4.0,
    hostile: true, attackDamage: 4, attackRange: 2.0, attackCooldown: 1.5,
    detectionRange: 20, width: 0.6, height: 0.5, rideable: false, aquatic: true,
    bodyParts: SHARK_PARTS, dropItems: [],
  },
  [MobType.FISH]: {
    type: MobType.FISH, name: 'Fish', maxHealth: 3, speed: 2.5,
    hostile: false, attackDamage: 0, attackRange: 0, attackCooldown: 0,
    detectionRange: 0, width: 0.2, height: 0.15, rideable: false, aquatic: true,
    bodyParts: FISH_PARTS, dropItems: [],
  },
  [MobType.DOLPHIN]: {
    type: MobType.DOLPHIN, name: 'Dolphin', maxHealth: 10, speed: 5.0,
    hostile: false, attackDamage: 0, attackRange: 0, attackCooldown: 0,
    detectionRange: 0, width: 0.4, height: 0.35, rideable: false, aquatic: true,
    bodyParts: DOLPHIN_PARTS, dropItems: [{ itemType: 154, minCount: 0, maxCount: 2 }],
  },
  [MobType.CHICKEN]: {
    type: MobType.CHICKEN, name: 'Chicken', maxHealth: 4, speed: 1.5,
    hostile: false, attackDamage: 0, attackRange: 0, attackCooldown: 0,
    detectionRange: 0, width: 0.3, height: 0.5, rideable: false, aquatic: false,
    bodyParts: [
      { name: 'head', width: 0.2, height: 0.2, depth: 0.2, offsetX: 0, offsetY: 0.45, offsetZ: -0.15, pivotX: 0, pivotY: 0.45, pivotZ: -0.05, animated: true, animGroup: 'head' },
      { name: 'body', width: 0.25, height: 0.2, depth: 0.35, offsetX: 0, offsetY: 0.25, offsetZ: 0, pivotX: 0, pivotY: 0.25, pivotZ: 0, animated: false },
      { name: 'wingLeft', width: 0.02, height: 0.15, depth: 0.2, offsetX: -0.14, offsetY: 0.28, offsetZ: 0, pivotX: -0.13, pivotY: 0.35, pivotZ: 0, animated: true, animGroup: 'arms', animPhase: 0 },
      { name: 'wingRight', width: 0.02, height: 0.15, depth: 0.2, offsetX: 0.14, offsetY: 0.28, offsetZ: 0, pivotX: 0.13, pivotY: 0.35, pivotZ: 0, animated: true, animGroup: 'arms', animPhase: Math.PI },
      { name: 'legLeft', width: 0.06, height: 0.15, depth: 0.06, offsetX: -0.06, offsetY: 0, offsetZ: 0, pivotX: -0.06, pivotY: 0.15, pivotZ: 0, animated: true, animGroup: 'legs', animPhase: 0 },
      { name: 'legRight', width: 0.06, height: 0.15, depth: 0.06, offsetX: 0.06, offsetY: 0, offsetZ: 0, pivotX: 0.06, pivotY: 0.15, pivotZ: 0, animated: true, animGroup: 'legs', animPhase: Math.PI },
    ],
    dropItems: [{ itemType: 160, minCount: 1, maxCount: 2 }, { itemType: 138, minCount: 0, maxCount: 2 }],
  },
  [MobType.WOLF]: {
    type: MobType.WOLF, name: 'Wolf', maxHealth: 8, speed: 3.0,
    hostile: false, attackDamage: 3, attackRange: 1.5, attackCooldown: 1.0,
    detectionRange: 10, width: 0.5, height: 0.7, rideable: false, aquatic: false,
    bodyParts: [
      { name: 'head', width: 0.3, height: 0.28, depth: 0.3, offsetX: 0, offsetY: 0.5, offsetZ: -0.35, pivotX: 0, pivotY: 0.5, pivotZ: -0.2, animated: true, animGroup: 'head' },
      { name: 'body', width: 0.35, height: 0.3, depth: 0.6, offsetX: 0, offsetY: 0.35, offsetZ: 0, pivotX: 0, pivotY: 0.35, pivotZ: 0, animated: false },
      { name: 'legFL', width: 0.12, height: 0.3, depth: 0.12, offsetX: -0.14, offsetY: 0, offsetZ: -0.18, pivotX: -0.14, pivotY: 0.3, pivotZ: -0.18, animated: true, animGroup: 'legs', animPhase: 0 },
      { name: 'legFR', width: 0.12, height: 0.3, depth: 0.12, offsetX: 0.14, offsetY: 0, offsetZ: -0.18, pivotX: 0.14, pivotY: 0.3, pivotZ: -0.18, animated: true, animGroup: 'legs', animPhase: Math.PI },
      { name: 'legBL', width: 0.12, height: 0.3, depth: 0.12, offsetX: -0.14, offsetY: 0, offsetZ: 0.18, pivotX: -0.14, pivotY: 0.3, pivotZ: 0.18, animated: true, animGroup: 'legs', animPhase: Math.PI },
      { name: 'legBR', width: 0.12, height: 0.3, depth: 0.12, offsetX: 0.14, offsetY: 0, offsetZ: 0.18, pivotX: 0.14, pivotY: 0.3, pivotZ: 0.18, animated: true, animGroup: 'legs', animPhase: 0 },
      { name: 'tail', width: 0.08, height: 0.25, depth: 0.08, offsetX: 0, offsetY: 0.45, offsetZ: 0.35, pivotX: 0, pivotY: 0.55, pivotZ: 0.3, animated: true, animGroup: 'tail', animPhase: 0 },
    ],
    dropItems: [],
  },
  [MobType.BEE]: {
    type: MobType.BEE, name: 'Bee', maxHealth: 6, speed: 3.5,
    hostile: false, attackDamage: 2, attackRange: 1.0, attackCooldown: 0.5,
    detectionRange: 5, width: 0.25, height: 0.25, rideable: false, aquatic: false,
    bodyParts: [
      { name: 'body', width: 0.2, height: 0.18, depth: 0.3, offsetX: 0, offsetY: 0.1, offsetZ: 0, pivotX: 0, pivotY: 0.1, pivotZ: 0, animated: false },
      { name: 'head', width: 0.15, height: 0.14, depth: 0.12, offsetX: 0, offsetY: 0.12, offsetZ: -0.2, pivotX: 0, pivotY: 0.12, pivotZ: -0.14, animated: true, animGroup: 'head' },
      { name: 'wingLeft', width: 0.18, height: 0.02, depth: 0.12, offsetX: -0.15, offsetY: 0.22, offsetZ: 0, pivotX: -0.06, pivotY: 0.2, pivotZ: 0, animated: true, animGroup: 'arms', animPhase: 0 },
      { name: 'wingRight', width: 0.18, height: 0.02, depth: 0.12, offsetX: 0.15, offsetY: 0.22, offsetZ: 0, pivotX: 0.06, pivotY: 0.2, pivotZ: 0, animated: true, animGroup: 'arms', animPhase: Math.PI },
    ],
    dropItems: [{ itemType: 162, minCount: 0, maxCount: 1 }],
  },
  [MobType.ENDERMAN]: {
    type: MobType.ENDERMAN, name: 'Enderman', maxHealth: 40, speed: 4.0,
    hostile: true, attackDamage: 7, attackRange: 2.2, attackCooldown: 0.9,
    detectionRange: 18, width: 0.6, height: 2.9, rideable: false, aquatic: false,
    bodyParts: [
      { name: 'head', width: 0.5, height: 0.5, depth: 0.5, offsetX: 0, offsetY: 2.5, offsetZ: 0, pivotX: 0, pivotY: 2.5, pivotZ: 0, animated: true, animGroup: 'head' },
      { name: 'body', width: 0.35, height: 1.2, depth: 0.2, offsetX: 0, offsetY: 1.3, offsetZ: 0, pivotX: 0, pivotY: 1.3, pivotZ: 0, animated: false },
      { name: 'armLeft', width: 0.12, height: 1.3, depth: 0.12, offsetX: -0.3, offsetY: 1.2, offsetZ: 0, pivotX: -0.3, pivotY: 2.5, pivotZ: 0, animated: true, animGroup: 'arms', animPhase: 0 },
      { name: 'armRight', width: 0.12, height: 1.3, depth: 0.12, offsetX: 0.3, offsetY: 1.2, offsetZ: 0, pivotX: 0.3, pivotY: 2.5, pivotZ: 0, animated: true, animGroup: 'arms', animPhase: Math.PI },
      { name: 'legLeft', width: 0.15, height: 1.3, depth: 0.15, offsetX: -0.1, offsetY: 0, offsetZ: 0, pivotX: -0.1, pivotY: 1.3, pivotZ: 0, animated: true, animGroup: 'legs', animPhase: 0 },
      { name: 'legRight', width: 0.15, height: 1.3, depth: 0.15, offsetX: 0.1, offsetY: 0, offsetZ: 0, pivotX: 0.1, pivotY: 1.3, pivotZ: 0, animated: true, animGroup: 'legs', animPhase: Math.PI },
    ],
    dropItems: [{ itemType: 190, minCount: 0, maxCount: 1 }],
  },
  [MobType.ENDER_DRAGON]: {
    type: MobType.ENDER_DRAGON, name: 'Ender Dragon', maxHealth: 200, speed: 14.0,
    hostile: true, attackDamage: 10, attackRange: 6.5, attackCooldown: 1.2,
    detectionRange: 200, width: 6.0, height: 3.4, rideable: false, aquatic: false, flying: true,
    bodyParts: DRAGON_PARTS, dropItems: [],
  },
  [MobType.ZOMBIE_PIGLIN]: {
    type: MobType.ZOMBIE_PIGLIN, name: 'Zombified Piglin', maxHealth: 20, speed: 3.0,
    hostile: true, attackDamage: 4, attackRange: 1.9, attackCooldown: 1.0,
    detectionRange: 14, width: 0.6, height: 1.8, rideable: false, aquatic: false,
    bodyParts: HUMANOID_PARTS, dropItems: [{ itemType: 132, minCount: 0, maxCount: 1 }],
  },
  [MobType.GHAST]: {
    type: MobType.GHAST, name: 'Ghast', maxHealth: 10, speed: 2.0,
    hostile: true, attackDamage: 6, attackRange: 0, attackCooldown: 3.2,
    detectionRange: 50, width: 4.0, height: 4.0, rideable: false, aquatic: false, flying: true,
    bodyParts: GHAST_PARTS, dropItems: [{ itemType: 204, minCount: 0, maxCount: 1 }],
  },
  [MobType.BLAZE]: {
    type: MobType.BLAZE, name: 'Blaze', maxHealth: 20, speed: 3.2,
    hostile: true, attackDamage: 5, attackRange: 0, attackCooldown: 3.0,
    detectionRange: 26, width: 0.7, height: 1.8, rideable: false, aquatic: false, flying: true,
    bodyParts: BLAZE_PARTS, dropItems: [{ itemType: 199, minCount: 0, maxCount: 2 }],
  },
  [MobType.END_CRYSTAL]: {
    type: MobType.END_CRYSTAL, name: 'End Crystal', maxHealth: 1, speed: 0,
    hostile: false, attackDamage: 0, attackRange: 0, attackCooldown: 0,
    detectionRange: 0, width: 1.2, height: 2.0, rideable: false, aquatic: false,
    bodyParts: CRYSTAL_PARTS, dropItems: [],
  },
};

export function isHostileMob(type: MobType): boolean {
  return MOB_DEFINITIONS[type].hostile;
}

export function isPassiveMob(type: MobType): boolean {
  return !MOB_DEFINITIONS[type].hostile;
}

export function isAquaticMob(type: MobType): boolean {
  return MOB_DEFINITIONS[type].aquatic;
}
