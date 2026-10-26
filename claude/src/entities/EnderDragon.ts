import { Entity } from './Entity';
import { MobType } from './MobTypes';
import type { EndCrystal } from './EndCrystal';

export type DragonPhase = 'circle' | 'strafe' | 'approach' | 'perch' | 'takeoff';

const CENTER_Y = 64;

/**
 * The Ender Dragon boss. Flies around the pillars, strafes the player with
 * fireballs, then lands on the fountain where it can be hit at close range.
 * Every living end crystal heals it.
 */
export class EnderDragon extends Entity {
  phase: DragonPhase = 'circle';
  private phaseTimer = 12;
  private angle = 0;
  private radius = 42;
  private altitude = 92;
  private flapT = 0;
  private breathTimer = 0;
  private dragonShootTimer = 3;
  private healTimer = 0;
  private strafeTargetX = 0;
  private strafeTargetY = 0;
  private strafeTargetZ = 0;
  private strafed = false;

  /** Requests read by the End fight manager */
  fireballRequest: { x: number; y: number; z: number; tx: number; ty: number; tz: number } | null = null;
  breathRequest: { x: number; y: number; z: number } | null = null;
  /** Set to true while an alive crystal links to the dragon */
  healBeamTargets: EndCrystal[] = [];
  deathBlast = false;

  constructor(x: number, y: number, z: number) {
    super(MobType.ENDER_DRAGON, x, y, z);
    this.angle = Math.atan2(z, x);
  }

  private fly(tx: number, ty: number, tz: number, speed: number, dt: number): void {
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const k = Math.min(1, dt * 2.0);
    this.vx += (dx / d * speed - this.vx) * k;
    this.vy += (dy / d * speed - this.vy) * k;
    this.vz += (dz / d * speed - this.vz) * k;
  }

  update(dt: number, _physics: unknown, px: number, py: number, pz: number): void {
    if (this.isDead) {
      // Death: sink slowly while shaking, then vanish
      this.deathTimer += dt;
      this.y += Math.sin(this.deathTimer * 20) * 0.02 - dt * 0.4;
      this.model.group.position.set(this.x, this.y, this.z);
      this.model.group.rotation.z = Math.sin(this.deathTimer * 30) * 0.05;
      if (this.deathTimer > 6) this.markedForRemoval = true;
      this.animateWings(dt, 0.6);
      return;
    }
    if (this.hurtTimer > 0) this.hurtTimer -= dt;

    // Crystals heal the dragon
    this.healTimer += dt;
    if (this.healTimer >= 1.0) {
      this.healTimer = 0;
      const alive = this.healBeamTargets.filter(c => !c.isDead).length;
      if (alive > 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + alive);
    }

    this.phaseTimer -= dt;
    const enraged = this.health < this.maxHealth * 0.5;

    switch (this.phase) {
      case 'circle': {
        this.angle += dt * (0.32 + (enraged ? 0.1 : 0));
        const tx = Math.cos(this.angle) * this.radius;
        const tz = Math.sin(this.angle) * this.radius;
        const ty = this.altitude + Math.sin(this.angle * 2.3) * 8;
        this.fly(tx, ty, tz, 13, dt);
        this.dragonShootTimer -= dt;
        if (this.dragonShootTimer <= 0) {
          this.dragonShootTimer = enraged ? 3.5 : 5;
          this.fireballRequest = { x: this.x, y: this.y + 1.5, z: this.z, tx: px, ty: py + 1, tz: pz };
        }
        if (this.phaseTimer <= 0) {
          // Choose next move: strafe attack or landing
          if (Math.random() < 0.55) {
            this.phase = 'strafe';
            this.strafed = false;
            this.strafeTargetX = px; this.strafeTargetY = py + 1; this.strafeTargetZ = pz;
            this.phaseTimer = 9;
          } else {
            this.phase = 'approach';
            this.phaseTimer = 14;
          }
        }
        break;
      }
      case 'strafe': {
        this.fly(this.strafeTargetX, this.strafeTargetY, this.strafeTargetZ, 22, dt);
        const dx = this.x - this.strafeTargetX, dz = this.z - this.strafeTargetZ, dy = this.y - this.strafeTargetY;
        if (dx * dx + dy * dy + dz * dz < 25 || this.phaseTimer <= 0) {
          this.phase = 'circle';
          this.phaseTimer = 10 + Math.random() * 6;
          this.angle = Math.atan2(this.z, this.x);
        }
        break;
      }
      case 'approach': {
        this.fly(0, CENTER_Y + 7, 0, 12, dt);
        const d2 = this.x * this.x + this.z * this.z + (this.y - (CENTER_Y + 7)) ** 2;
        if (d2 < 36 || this.phaseTimer <= 0) { this.phase = 'perch'; this.phaseTimer = 12; this.breathTimer = 1.5; }
        break;
      }
      case 'perch': {
        this.fly(0, CENTER_Y + 4.2, 0, 4, dt);
        this.vx *= 0.9; this.vz *= 0.9;
        this.breathTimer -= dt;
        if (this.breathTimer <= 0) {
          this.breathTimer = 1.8;
          this.breathRequest = { x: px, y: Math.max(CENTER_Y + 1, py), z: pz };
        }
        if (this.phaseTimer <= 0) { this.phase = 'takeoff'; this.phaseTimer = 5; }
        break;
      }
      case 'takeoff': {
        this.fly(Math.cos(this.angle) * this.radius, this.altitude, Math.sin(this.angle) * this.radius, 14, dt);
        if (this.phaseTimer <= 0 || this.y > this.altitude - 5) {
          this.phase = 'circle';
          this.phaseTimer = 12 + Math.random() * 6;
        }
        break;
      }
    }

    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    if (this.y < CENTER_Y + 2) this.y = CENTER_Y + 2;

    // Face travel direction (model front is -Z)
    const sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (sp > 0.5) {
      const target = Math.atan2(-this.vx, -this.vz);
      let diff = target - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 2.2);
    }
    // Melee contact request (MobManager reads ai.canAttackPlayer)
    const dxp = px - this.x, dyp = py + 1 - (this.y + 1.5), dzp = pz - this.z;
    this.ai.canAttackPlayer = (dxp * dxp + dyp * dyp + dzp * dzp) < 6.5 * 6.5 && this.phase !== 'circle';

    this.animateWings(dt, this.phase === 'perch' ? 0.5 : 1.0);
    this.model.group.position.set(this.x, this.y, this.z);
    this.model.group.rotation.y = this.yaw;
    this.model.group.rotation.x = Math.max(-0.5, Math.min(0.5, -this.vy * 0.03));
    this.model.group.rotation.z = Math.max(-0.4, Math.min(0.4, -(this.yaw - Math.atan2(-this.vx, -this.vz)) * 0.5));
  }

  private animateWings(dt: number, amount: number): void {
    this.flapT += dt * (this.phase === 'perch' ? 2.2 : 3.4);
    const flap = Math.sin(this.flapT) * 0.55 * amount;
    this.model.group.traverse(o => {
      if (o.name === 'wingLeft_pivot' || o.name === 'wingLeft') o.rotation.z = flap + 0.15;
      if (o.name === 'wingRight_pivot' || o.name === 'wingRight') o.rotation.z = -flap - 0.15;
    });
    // tail wave
    let i = 0;
    this.model.group.traverse(o => {
      if (o.name.startsWith('tail') && o.name.endsWith('_pivot')) {
        o.rotation.y = Math.sin(this.flapT * 0.5 - i * 0.7) * 0.25;
        i++;
      }
    });
  }

  takeDamage(amount: number, kx: number, kz: number): void {
    if (this.isDead) return;
    // Taking damage while perched hurts more (like head hits in vanilla)
    const mult = this.phase === 'perch' ? 1.5 : 1.0;
    this.health -= amount * mult;
    this.hurtTimer = 0.3;
    void kx; void kz;
    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.deathBlast = true;
      this.ai.canAttackPlayer = false;
    }
  }
}
