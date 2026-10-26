import * as THREE from 'three';
import { MobType, MobDefinition, MOB_DEFINITIONS } from './MobTypes';
import { MobModel, createMobModel, animateMobModel, disposeMobModel } from './MobModelFactory';
import { MobAI } from './MobAI';
import { Physics, AABB } from '../player/Physics';
import { World } from '../world/World';
import { GRAVITY, TERMINAL_VELOCITY } from '../utils/constants';
import { clamp } from '../utils/math';

export class Entity {
  readonly mobType: MobType;
  readonly definition: MobDefinition;
  readonly model: MobModel;
  readonly ai: MobAI;

  // Position (feet position)
  x: number;
  y: number;
  z: number;

  // Velocity
  vx: number = 0;
  vy: number = 0;
  vz: number = 0;

  // Rotation
  yaw: number = 0;

  // State
  grounded: boolean = false;
  health: number;
  readonly maxHealth: number;
  isDead: boolean = false;
  markedForRemoval: boolean = false;

  // Timers
  hurtTimer: number = 0;
  deathTimer: number = 0;
  private readonly HURT_FLASH_DURATION = 0.3;
  private readonly DEATH_DURATION = 1.0;

  // Ranged attackers (ghast, blaze): MobManager turns this into a fireball
  shootRequest: { count: number } | null = null;
  private shootTimer: number = 2 + Math.random() * 2;
  private burstLeft: number = 0;
  private burstTimer: number = 0;
  private hoverPhase: number = Math.random() * 6;
  private wanderT: number = 0;
  private wanderX: number = 0;
  private wanderZ: number = 0;

  // Riding
  rider: { x: number; y: number; z: number } | null = null;

  constructor(type: MobType, x: number, y: number, z: number) {
    this.mobType = type;
    this.definition = MOB_DEFINITIONS[type];
    this.x = x;
    this.y = y;
    this.z = z;
    this.health = this.definition.maxHealth;
    this.maxHealth = this.definition.maxHealth;
    this.yaw = Math.random() * Math.PI * 2;
    this.model = createMobModel(type);
    this.ai = new MobAI(this.definition);
    this.updateModelPosition();
  }

  update(dt: number, physics: Physics, playerX: number, playerY: number, playerZ: number, world?: World): void {
    if (this.isDead) {
      this.deathTimer += dt;
      if (this.deathTimer >= this.DEATH_DURATION) {
        this.markedForRemoval = true;
      }
      if (this.definition.aquatic && world && world.isWater(this.x, this.y - 0.2, this.z)) {
        this.y -= 0.8 * dt;
      }
      this.updateAnimation(dt, false);
      this.updateModelPosition();
      return;
    }

    // Hurt timer
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
    }

    if (this.definition.flying) {
      this.updateFlyer(dt, physics, playerX, playerY, playerZ);
      return;
    }

    // AI update
    this.ai.update(dt, this, playerX, playerY, playerZ, world);

    if (this.definition.aquatic) {
      this.updateAquaticMovement(dt, world);
    } else {
      // Apply gravity
      this.vy -= GRAVITY * dt;
      this.vy = clamp(this.vy, -TERMINAL_VELOCITY, TERMINAL_VELOCITY);

      // Physics collision
      const result = physics.moveEntityWithCollision(
        this.x, this.y, this.z,
        this.vx, this.vy, this.vz,
        dt,
        this.definition.width,
        this.definition.height,
      );

      this.x = result.x;
      this.y = result.y;
      this.z = result.z;
      this.vx = result.vx;
      this.vy = result.vy;
      this.vz = result.vz;
      this.grounded = result.grounded;
    }

    // Animation
    const isMoving = Math.abs(this.vx) > 0.1 || Math.abs(this.vz) > 0.1 || (this.definition.aquatic && Math.abs(this.vy) > 0.1);
    this.updateAnimation(dt, isMoving);
    this.updateModelPosition();
  }

  /** Hovering shooters: ghast (big, slow, far away) and blaze (close, bursts) */
  private updateFlyer(dt: number, physics: Physics, px: number, py: number, pz: number): void {
    const def = this.definition;
    this.hoverPhase += dt;
    const dx = px - this.x, dz = pz - this.z;
    const dy = (py + 1.0) - (this.y + def.height * 0.5);
    const distXZ = Math.sqrt(dx * dx + dz * dz);
    const dist = Math.sqrt(distXZ * distXZ + dy * dy);
    const aggro = dist < def.detectionRange;
    const isGhast = this.mobType === MobType.GHAST;

    let tvx = 0, tvy = 0, tvz = 0;
    if (aggro) {
      // desired distance from the player
      const want = isGhast ? 20 : 8;
      const toward = distXZ > want + 2 ? 1 : distXZ < want - 3 ? -1 : 0;
      const nx = distXZ > 0.01 ? dx / distXZ : 0, nz = distXZ > 0.01 ? dz / distXZ : 0;
      // strafe around the player a bit
      const sx = -nz * Math.sin(this.hoverPhase * 0.6) * 0.8, sz = nx * Math.sin(this.hoverPhase * 0.6) * 0.8;
      tvx = (nx * toward + sx) * def.speed;
      tvz = (nz * toward + sz) * def.speed;
      const hoverY = py + (isGhast ? 8 : 3) + Math.sin(this.hoverPhase * 1.4) * 1.2;
      tvy = Math.max(-def.speed, Math.min(def.speed, (hoverY - this.y) * 0.8));
      // face the player
      const targetYaw = Math.atan2(-dx, -dz);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 5);

      // shooting
      this.shootTimer -= dt;
      if (this.burstLeft > 0) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) { this.shootRequest = { count: 1 }; this.burstLeft--; this.burstTimer = 0.25; }
      } else if (this.shootTimer <= 0 && distXZ < def.detectionRange) {
        this.shootTimer = def.attackCooldown;
        if (isGhast) { this.shootRequest = { count: 1 }; } else { this.burstLeft = 3; this.burstTimer = 0; }
      }
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 3 + Math.random() * 4;
        const a = Math.random() * Math.PI * 2;
        this.wanderX = Math.cos(a) * def.speed * 0.3; this.wanderZ = Math.sin(a) * def.speed * 0.3;
      }
      tvx = this.wanderX; tvz = this.wanderZ;
      tvy = Math.sin(this.hoverPhase) * 0.6;
      if (Math.abs(tvx) + Math.abs(tvz) > 0.1) this.yaw += (Math.atan2(-tvx, -tvz) - this.yaw) * Math.min(1, dt * 2);
    }
    const k = Math.min(1, dt * 2.5);
    this.vx += (tvx - this.vx) * k; this.vy += (tvy - this.vy) * k; this.vz += (tvz - this.vz) * k;

    const r = physics.moveEntityWithCollision(this.x, this.y, this.z, this.vx, this.vy, this.vz, dt, def.width, def.height);
    this.x = r.x; this.y = r.y; this.z = r.z;
    this.vx = r.vx; this.vy = r.vy; this.vz = r.vz;
    this.grounded = false;

    this.updateAnimation(dt, true);
    this.updateModelPosition();
  }

  /**
   * Aquatic movement: the mob may only ever occupy water cells.
   * Each axis is tested separately, so a shark can slide along the shore
   * instead of beaching itself or flying through the air.
   */
  private updateAquaticMovement(dt: number, world?: World): void {
    const isWaterAt = (x: number, y: number, z: number): boolean =>
      world ? world.isWater(x, y, z) : true;
    const h = this.definition.height;
    const r = this.definition.width * 0.5;

    // Body fits in water if centre + head are water cells
    const fits = (x: number, y: number, z: number): boolean =>
      isWaterAt(x, y + 0.15, z) && isWaterAt(x, y + h * 0.5, z) && isWaterAt(x + r, y + h * 0.5, z) && isWaterAt(x - r, y + h * 0.5, z) &&
      isWaterAt(x, y + h * 0.5, z + r) && isWaterAt(x, y + h * 0.5, z - r);

    // Knockback gets damped much faster in water
    const nx = this.x + this.vx * dt;
    if (fits(nx, this.y, this.z)) this.x = nx; else { this.vx *= -0.3; }
    const nz = this.z + this.vz * dt;
    if (fits(this.x, this.y, nz)) this.z = nz; else { this.vz *= -0.3; }
    let ny = this.y + this.vy * dt;
    // Never get closer than 0.4 to the surface: no more sharks jumping out
    if (ny + h > 0 && fits(this.x, ny, this.z) && isWaterAt(this.x, ny + h + 0.35, this.z)) {
      this.y = ny;
    } else {
      this.vy *= -0.2;
    }

    // Safety net: if the mob somehow ended up out of water, push it down
    if (!isWaterAt(this.x, this.y + h * 0.5, this.z)) {
      this.vy = -2;
      this.y -= 0.05;
      // Find nearest water below and snap
      for (let dy = 0; dy < 10; dy++) {
        if (isWaterAt(this.x, this.y - dy, this.z)) { this.y -= dy; break; }
      }
    }

    // Water resistance
    const drag = Math.pow(0.04, dt);
    this.vx *= Math.max(drag, 0.9);
    this.vy *= Math.max(drag, 0.9);
    this.vz *= Math.max(drag, 0.9);
    this.grounded = false;
  }

  private updateAnimation(dt: number, isMoving: boolean): void {
    animateMobModel(
      this.model,
      dt,
      this.definition.speed,
      isMoving,
      this.hurtTimer > 0,
      this.isDead,
      Math.min(1, this.deathTimer / this.DEATH_DURATION),
    );
  }

  private updateModelPosition(): void {
    this.model.group.position.set(this.x, this.y, this.z);
    this.model.group.rotation.y = this.yaw;
    // Aquatic mobs pitch when moving vertically
    if (this.definition.aquatic) {
      const speed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
      if (speed > 0.1) {
        this.model.group.rotation.x = clamp(-this.vy * 0.15, -0.4, 0.4);
      } else {
        this.model.group.rotation.x *= 0.9;
      }
    }
  }

  takeDamage(amount: number, knockbackX: number, knockbackZ: number, knockbackForce: number): void {
    if (this.isDead) return;

    this.health -= amount;
    this.hurtTimer = this.HURT_FLASH_DURATION;

    // Apply knockback
    const len = Math.sqrt(knockbackX * knockbackX + knockbackZ * knockbackZ);
    if (len > 0) {
      this.vx = (knockbackX / len) * knockbackForce;
      this.vz = (knockbackZ / len) * knockbackForce;
      this.vy = knockbackForce * 0.4;
    }

    // Notify AI of damage
    this.ai.onDamaged();

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.deathTimer = 0;
    }
  }

  getAABB(): AABB {
    const hw = this.definition.width / 2;
    return {
      minX: this.x - hw,
      minY: this.y,
      minZ: this.z - hw,
      maxX: this.x + hw,
      maxY: this.y + this.definition.height,
      maxZ: this.z + hw,
    };
  }

  distanceTo(px: number, py: number, pz: number): number {
    const dx = this.x - px;
    const dy = (this.y + this.definition.height / 2) - py;
    const dz = this.z - pz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  distanceToXZ(px: number, pz: number): number {
    const dx = this.x - px;
    const dz = this.z - pz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Check if a ray from origin in direction hits this entity's AABB */
  rayIntersects(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
    const aabb = this.getAABB();
    let tmin = 0;
    let tmax = maxDist;

    // X slab
    if (Math.abs(dx) < 1e-8) {
      if (ox < aabb.minX || ox > aabb.maxX) return -1;
    } else {
      const invD = 1 / dx;
      let t1 = (aabb.minX - ox) * invD;
      let t2 = (aabb.maxX - ox) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }

    // Y slab
    if (Math.abs(dy) < 1e-8) {
      if (oy < aabb.minY || oy > aabb.maxY) return -1;
    } else {
      const invD = 1 / dy;
      let t1 = (aabb.minY - oy) * invD;
      let t2 = (aabb.maxY - oy) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }

    // Z slab
    if (Math.abs(dz) < 1e-8) {
      if (oz < aabb.minZ || oz > aabb.maxZ) return -1;
    } else {
      const invD = 1 / dz;
      let t1 = (aabb.minZ - oz) * invD;
      let t2 = (aabb.maxZ - oz) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }

    return tmin >= 0 ? tmin : -1;
  }

  dispose(): void {
    disposeMobModel(this.model);
  }
}
