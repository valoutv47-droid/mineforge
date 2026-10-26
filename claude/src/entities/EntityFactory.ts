import { Entity } from './Entity';
import { EnderDragon } from './EnderDragon';
import { EndCrystal } from './EndCrystal';
import { MobType } from './MobTypes';

export function createEntity(type: MobType, x: number, y: number, z: number): Entity {
  switch (type) {
    case MobType.ENDER_DRAGON: return new EnderDragon(x, y, z);
    case MobType.END_CRYSTAL: return new EndCrystal(x, y, z);
    default: return new Entity(type, x, y, z);
  }
}
