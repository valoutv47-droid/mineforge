import { MobType, isHostileMob, isPassiveMob, isAquaticMob } from './MobTypes';
import { Entity } from './Entity';
import { createEntity } from './EntityFactory';
import { World } from '../world/World';
import { BlockType } from '../blocks/BlockTypes';
import {
  MAX_HOSTILE_MOBS,
  MAX_PASSIVE_MOBS,
  MAX_AQUATIC_MOBS,
  MOB_SPAWN_MIN_RANGE,
  MOB_SPAWN_MAX_RANGE,
  MOB_DESPAWN_RANGE,
  MOB_SPAWN_INTERVAL,
  INITIAL_PASSIVE_SPAWN,
  INITIAL_AQUATIC_SPAWN,
  SEA_LEVEL,
} from '../utils/constants';

const HOSTILE_TYPES: MobType[] = [MobType.ZOMBIE, MobType.SKELETON, MobType.CREEPER, MobType.SPIDER];
const PASSIVE_TYPES: MobType[] = [MobType.PIG, MobType.COW, MobType.SHEEP, MobType.HORSE];
const AQUATIC_TYPES: MobType[] = [MobType.SHARK, MobType.FISH, MobType.DOLPHIN];

export class MobSpawner {
  /** 0 overworld, 1 nether, 2 end */
  dimension: number = 0;
  private spawnTimer: number = 0;
  private initialSpawnDone: boolean = false;

  update(
    dt: number,
    mobs: Entity[],
    world: World,
    playerX: number,
    playerY: number,
    playerZ: number,
    dayFactor: number,
  ): Entity[] {
    const spawned: Entity[] = [];

    if (this.dimension !== 0) return this.updateOtherDimension(dt, mobs, world, playerX, playerY, playerZ);

    // Spawn initial batch on first tick
    if (!this.initialSpawnDone) {
      this.initialSpawnDone = true;
      for (let i = 0; i < INITIAL_PASSIVE_SPAWN; i++) {
        const type = PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
        const mob = this.trySpawnLand(type, world, playerX, playerY, playerZ);
        if (mob) spawned.push(mob);
      }
      for (let i = 0; i < INITIAL_AQUATIC_SPAWN; i++) {
        const type = AQUATIC_TYPES[Math.floor(Math.random() * AQUATIC_TYPES.length)];
        const mob = this.trySpawnAquatic(type, world, playerX, playerZ);
        if (mob) spawned.push(mob);
      }
      return spawned;
    }

    this.spawnTimer += dt;
    if (this.spawnTimer < MOB_SPAWN_INTERVAL) return spawned;
    this.spawnTimer -= MOB_SPAWN_INTERVAL;

    const hostileCount = mobs.filter(m => !m.isDead && isHostileMob(m.mobType) && !isAquaticMob(m.mobType)).length;
    const passiveCount = mobs.filter(m => !m.isDead && isPassiveMob(m.mobType) && !isAquaticMob(m.mobType)).length;
    const aquaticCount = mobs.filter(m => !m.isDead && isAquaticMob(m.mobType)).length;

    const isNight = dayFactor < 0.3;

    // Spawn hostiles at night
    if (isNight && hostileCount < MAX_HOSTILE_MOBS) {
      const type = HOSTILE_TYPES[Math.floor(Math.random() * HOSTILE_TYPES.length)];
      const mob = this.trySpawnLand(type, world, playerX, playerY, playerZ);
      if (mob) spawned.push(mob);
    }

    // Spawn passives (up to 2 at a time)
    if (passiveCount < MAX_PASSIVE_MOBS) {
      const count = Math.min(2, MAX_PASSIVE_MOBS - passiveCount);
      for (let i = 0; i < count; i++) {
        const type = PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
        const mob = this.trySpawnLand(type, world, playerX, playerY, playerZ);
        if (mob) spawned.push(mob);
      }
    }

    // Spawn aquatic
    if (aquaticCount < MAX_AQUATIC_MOBS) {
      const count = Math.min(2, MAX_AQUATIC_MOBS - aquaticCount);
      for (let i = 0; i < count; i++) {
        const type = AQUATIC_TYPES[Math.floor(Math.random() * AQUATIC_TYPES.length)];
        const mob = this.trySpawnAquatic(type, world, playerX, playerZ);
        if (mob) spawned.push(mob);
      }
    }

    return spawned;
  }

  private otherInitial = false;
  private otherTimer = 0;

  /** Nether: piglins, ghasts, blazes (fortress). End: endermen. */
  private updateOtherDimension(dt: number, mobs: Entity[], world: World, px: number, py: number, pz: number): Entity[] {
    const spawned: Entity[] = [];
    const alive = mobs.filter(m => !m.isDead && m.mobType !== MobType.ENDER_DRAGON && m.mobType !== MobType.END_CRYSTAL);
    const burst = !this.otherInitial ? 10 : 1;
    this.otherTimer += dt;
    if (this.otherInitial && this.otherTimer < 2.5) return spawned;
    this.otherTimer = 0;
    this.otherInitial = true;
    const cap = this.dimension === 1 ? 22 : 10;
    if (alive.length >= cap) return spawned;
    for (let n = 0; n < burst; n++) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const dist = 18 + Math.random() * 40;
        const wx = Math.floor(px + Math.cos(a) * dist), wz = Math.floor(pz + Math.sin(a) * dist);
        if (this.dimension === 2) {
          for (let y = 110; y > 20; y--) {
            const b = world.getBlock(wx, y - 1, wz);
            if (b === BlockType.END_STONE && world.getBlock(wx, y, wz) === BlockType.AIR && world.getBlock(wx, y + 1, wz) === BlockType.AIR && world.getBlock(wx, y + 2, wz) === BlockType.AIR) {
              if (Math.abs(wx) < 6 && Math.abs(wz) < 6) break;
              spawned.push(createEntity(MobType.ENDERMAN, wx + 0.5, y, wz + 0.5));
              attempt = 99;
              break;
            }
          }
          continue;
        }
        // Nether: roll the type first
        const r = Math.random();
        if (r < 0.2) {
          // ghast: open air high above the lava sea
          const y = 48 + Math.floor(Math.random() * 40);
          let free = true;
          for (let dx = -2; dx <= 2 && free; dx++) for (let dz = -2; dz <= 2 && free; dz++) for (let dy = -2; dy <= 2; dy++) {
            if (world.getBlock(wx + dx, y + dy, wz + dz) !== BlockType.AIR) { free = false; break; }
          }
          if (free) { spawned.push(createEntity(MobType.GHAST, wx + 0.5, y, wz + 0.5)); break; }
          continue;
        }
        for (let y = 100; y > 8; y--) {
          const b = world.getBlock(wx, y - 1, wz);
          const solid = b !== BlockType.AIR && b !== BlockType.LAVA && b !== BlockType.FIRE;
          if (solid && world.getBlock(wx, y, wz) === BlockType.AIR && world.getBlock(wx, y + 1, wz) === BlockType.AIR && world.getBlock(wx, y + 2, wz) === BlockType.AIR) {
            const fortress = b === BlockType.NETHER_BRICKS;
            const type = fortress ? MobType.BLAZE : MobType.ZOMBIE_PIGLIN;
            if (type === MobType.BLAZE && Math.random() < 0.5) break;
            spawned.push(createEntity(type, wx + 0.5, y + (fortress ? 1.0 : 0), wz + 0.5));
            attempt = 99;
            break;
          }
        }
      }
    }
    void py;
    return spawned;
  }

  shouldDespawn(entity: Entity, playerX: number, playerZ: number): boolean {
    if (entity.mobType === MobType.ENDER_DRAGON || entity.mobType === MobType.END_CRYSTAL) return false;
    return entity.distanceToXZ(playerX, playerZ) > MOB_DESPAWN_RANGE;
  }

  private trySpawnLand(
    type: MobType,
    world: World,
    playerX: number,
    _playerY: number,
    playerZ: number,
  ): Entity | null {
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = MOB_SPAWN_MIN_RANGE + Math.random() * (MOB_SPAWN_MAX_RANGE - MOB_SPAWN_MIN_RANGE);
      const wx = Math.floor(playerX + Math.cos(angle) * dist);
      const wz = Math.floor(playerZ + Math.sin(angle) * dist);

      let surfaceY = -1;
      for (let y = 120; y > 1; y--) {
        const blockBelow = world.getBlock(wx, y - 1, wz);
        const blockAt = world.getBlock(wx, y, wz);
        const blockAbove = world.getBlock(wx, y + 1, wz);
        if (
          blockBelow !== BlockType.AIR && blockBelow !== BlockType.WATER &&
          blockAt === BlockType.AIR &&
          blockAbove === BlockType.AIR
        ) {
          surfaceY = y;
          break;
        }
      }

      if (surfaceY < 0) continue;

      const surfaceBlock = world.getBlock(wx, surfaceY - 1, wz);
      if (surfaceBlock === BlockType.WATER) continue;

      // Passive mobs prefer grass but also accept dirt/sand
      if (isPassiveMob(type)) {
        if (surfaceBlock !== BlockType.GRASS && surfaceBlock !== BlockType.DIRT && surfaceBlock !== BlockType.SAND) continue;
      }

      return createEntity(type, wx + 0.5, surfaceY, wz + 0.5);
    }

    return null;
  }

  private trySpawnAquatic(
    type: MobType,
    world: World,
    playerX: number,
    playerZ: number,
  ): Entity | null {
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = MOB_SPAWN_MIN_RANGE + Math.random() * (MOB_SPAWN_MAX_RANGE - MOB_SPAWN_MIN_RANGE);
      const wx = Math.floor(playerX + Math.cos(angle) * dist);
      const wz = Math.floor(playerZ + Math.sin(angle) * dist);

      // Check for water at sea level range
      const testY = SEA_LEVEL - 2 - Math.floor(Math.random() * 8);
      if (testY < 5) continue;

      const blockAt = world.getBlock(wx, testY, wz);
      const blockAbove = world.getBlock(wx, testY + 1, wz);

      if (blockAt === BlockType.WATER && blockAbove === BlockType.WATER) {
        const entity = createEntity(type, wx + 0.5, testY + 0.3, wz + 0.5);
        // Set the swim target Y based on spawn position
        entity.ai.setSwimTargetY(testY + 0.3);
        return entity;
      }
    }

    return null;
  }
}
