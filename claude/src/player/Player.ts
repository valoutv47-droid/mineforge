import * as THREE from 'three';
import { InputManager } from '../core/InputManager';
import type { PlayerAvatar } from './PlayerAvatar';
import { BlockType } from '../blocks/BlockTypes';
import { Physics } from './Physics';
import {
  GRAVITY, JUMP_FORCE, PLAYER_SPEED, PLAYER_SPRINT_SPEED,
  PLAYER_EYE_HEIGHT, TERMINAL_VELOCITY, PLAYER_HURT_INVINCIBILITY,
  KNOCKBACK_FORCE, SWIM_SPEED, SWIM_SPRINT_SPEED, WATER_GRAVITY,
  WATER_BUOYANCY, WATER_DRAG, SWIM_UP_FORCE, SWIM_DOWN_SPEED,
  OXYGEN_MAX, OXYGEN_DEPLETION_RATE, OXYGEN_REGEN_RATE,
  DROWNING_DAMAGE, DROWNING_INTERVAL,
} from '../utils/constants';
import { World } from '../world/World';
import { clamp } from '../utils/math';
import { Entity } from '../entities/Entity';
import { StatusEffectManager, StatusEffectType } from './StatusEffects';

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  private readonly input: InputManager;
  private readonly physics: Physics;
  private world: World | null = null;

  // Position (feet position)
  x: number = 0;
  y: number = 80;
  z: number = 0;

  // Velocity
  vx: number = 0;
  vy: number = 0;
  vz: number = 0;

  // Rotation
  yaw: number = 0;
  pitch: number = 0;

  // State
  grounded: boolean = false;

  // Survival stats
  health: number = 20;
  maxHealth: number = 20;
  hunger: number = 20;
  maxHunger: number = 20;
  saturation: number = 5;
  armor: number = 0;
  private hungerTimer: number = 0;
  private regenTimer: number = 0;
  private starvationTimer: number = 0;
  distanceMoved: number = 0;
  private lastX: number = 0;
  private lastZ: number = 0;

  // Camera feel
  avatar: PlayerAvatar | null = null;
  /** 0 = first person, 1 = third person back, 2 = third person front (F5) */
  cameraMode: number = 0;
  private baseFov: number = 70;
  private bobPhase: number = 0;
  private bobAmount: number = 0;
  private landDip: number = 0;
  private camDistance: number = 4;
  private smoothSpeed: number = 0;

  // Hazards
  isInLava: boolean = false;
  burnTimer: number = 0;
  private burnDamageTimer: number = 0;
  private lavaDamageTimer: number = 0;
  private magmaTimer: number = 0;
  onSoulSand: boolean = false;
  /** Set by the dimension controller to the lowest survivable Y (void) */
  voidY: number = -12;

  // Fall damage
  private fallStartY: number = 0;
  private isFalling: boolean = false;

  // Combat
  hurtInvincibility: number = 0;
  hurtFlashTimer: number = 0;

  // Horse riding
  isRiding: boolean = false;
  ridingEntity: Entity | null = null;

  // Status effects
  readonly statusEffects: StatusEffectManager = new StatusEffectManager();

  // Creative mode
  isCreative: boolean = false;
  isFlying: boolean = false;
  private flyDoubleTapTimer: number = 0;

  // Game stats
  totalDistanceTraveled: number = 0;
  blocksMined: number = 0;
  blocksPlaced: number = 0;
  mobsKilled: number = 0;
  survivalTime: number = 0;
  nightsSurvived: number = 0;

  // Food eating
  isEating: boolean = false;
  eatingTimer: number = 0;
  private readonly EATING_DURATION: number = 1.5;

  // Swimming & Underwater
  oxygen: number = OXYGEN_MAX;
  maxOxygen: number = OXYGEN_MAX;
  isUnderwater: boolean = false;
  isInWater: boolean = false;
  isSwimming: boolean = false;
  swimStrokePhase: number = 0;
  private drowningTimer: number = 0;
  private waterEntryTimer: number = 0;
  /** 0..1 blending factor for underwater camera effects */
  underwaterFactor: number = 0;

  // Death
  isDead: boolean = false;

  private mouseSensitivity = 0.002;

  setMouseSensitivity(multiplier: number): void {
    this.mouseSensitivity = 0.002 * multiplier;
  }

  constructor(camera: THREE.PerspectiveCamera, input: InputManager, physics: Physics) {
    this.camera = camera;
    this.input = input;
    this.physics = physics;
  }

  setWorld(world: World): void {
    this.world = world;
  }

  /** Remember the FOV chosen in the options (sprinting widens it a bit) */
  setBaseFov(fov: number): void {
    this.baseFov = fov;
  }

  cycleCameraMode(): void {
    this.cameraMode = (this.cameraMode + 1) % 3;
  }

  /** Dispel burning (water, potion...) */
  extinguish(): void {
    this.burnTimer = 0;
  }

  ignite(seconds: number): void {
    if (this.isCreative) return;
    if (this.isInWater && !this.isInLava) return;
    this.burnTimer = Math.max(this.burnTimer, seconds);
  }

  update(dt: number): void {
    if (this.isDead) return;

    this.handleMouse();

    // Combat timers
    if (this.hurtInvincibility > 0) this.hurtInvincibility -= dt;
    if (this.hurtFlashTimer > 0) this.hurtFlashTimer -= dt;

    // Status effects
    this.statusEffects.update(dt);

    // Survival time
    this.survivalTime += dt;

    // Flying double-tap
    if (this.flyDoubleTapTimer > 0) this.flyDoubleTapTimer -= dt;

    // Water detection
    this.updateWaterState();

    if (this.isRiding && this.ridingEntity) {
      this.handleRiding(dt);
    } else if (this.isFlying) {
      this.handleFlying(dt);
    } else if (this.isInWater) {
      this.handleSwimming(dt);
    } else {
      this.handleMovement(dt);
    }

    if (this.isInLava) {
      this.vx *= 0.6; this.vz *= 0.6;
      if (this.vy < -2.5) this.vy = -2.5;
    }

    this.updateCamera(dt);
    if (!this.isCreative) {
      this.updateSurvival(dt);
      this.updateOxygen(dt);
      this.updateHazards(dt);
    }
  }

  private handleMouse(): void {
    this.yaw -= this.input.mouseDeltaX * this.mouseSensitivity;
    this.pitch -= this.input.mouseDeltaY * this.mouseSensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }

  private handleMovement(dt: number): void {
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let moveX = 0;
    let moveZ = 0;

    if (this.input.isKeyDown('KeyW') || this.input.isKeyDown('ArrowUp')) { moveX += forwardX; moveZ += forwardZ; }
    if (this.input.isKeyDown('KeyS') || this.input.isKeyDown('ArrowDown')) { moveX -= forwardX; moveZ -= forwardZ; }
    if (this.input.isKeyDown('KeyA') || this.input.isKeyDown('ArrowLeft')) { moveX -= rightX; moveZ -= rightZ; }
    if (this.input.isKeyDown('KeyD') || this.input.isKeyDown('ArrowRight')) { moveX += rightX; moveZ += rightZ; }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }

    // Speed with status effect multiplier
    let speed = this.input.isKeyDown('ShiftLeft') ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
    speed *= this.statusEffects.getSpeedMultiplier();
    this.onSoulSand = !!this.world && this.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z)) === BlockType.SOUL_SAND;
    if (this.onSoulSand) speed *= 0.55;
    this.vx = moveX * speed;
    this.vz = moveZ * speed;

    // Gravity with slow falling
    const gravity = this.statusEffects.hasSlowFalling() ? GRAVITY * 0.15 : GRAVITY;
    this.vy -= gravity * dt;
    this.vy = clamp(this.vy, -TERMINAL_VELOCITY, TERMINAL_VELOCITY);

    // Jump with jump boost
    const jumpForce = JUMP_FORCE * this.statusEffects.getJumpMultiplier();
    if ((this.input.isKeyDown('Space')) && this.grounded) {
      this.vy = jumpForce;
      this.grounded = false;

      // Flying double-tap in creative
      if (this.isCreative && this.flyDoubleTapTimer > 0) {
        this.isFlying = true;
        this.vy = 0;
        return;
      }
      this.flyDoubleTapTimer = 0.3;
    }

    // Track fall start
    const wasGrounded = this.grounded;
    if (!wasGrounded && this.vy < 0 && !this.isFalling) {
      this.isFalling = true;
      this.fallStartY = this.y;
    }

    // Physics collision
    const result = this.physics.moveWithCollision(
      this.x, this.y, this.z,
      this.vx, this.vy, this.vz,
      dt
    );

    this.x = result.x;
    this.y = result.y;
    this.z = result.z;
    this.vx = result.vx;
    this.vy = result.vy;
    this.vz = result.vz;
    this.grounded = result.grounded;

    // Fall damage on landing
    if (this.grounded && this.isFalling && !this.isCreative) {
      const fallDistance = this.fallStartY - this.y;
      if (fallDistance > 1.5) this.landDip = Math.min(0.35, fallDistance * 0.05);
      if (fallDistance > 3) {
        const damage = Math.floor(fallDistance - 3);
        if (damage > 0) {
          this.takeDamage(damage, 0, 0);
        }
      }
      this.isFalling = false;
    }
    if (this.grounded) {
      this.isFalling = false;
    }
  }

  private updateWaterState(): void {
    if (!this.world) return;

    // Check if body is in water (feet level or waist level)
    const feetInWater = this.world.isWater(this.x, this.y + 0.1, this.z);
    const waistInWater = this.world.isWater(this.x, this.y + 0.8, this.z);
    const headInWater = this.world.isWater(this.x, this.y + PLAYER_EYE_HEIGHT, this.z);

    const feetLava = this.world.isLava(this.x, this.y + 0.1, this.z);
    const waistLava = this.world.isLava(this.x, this.y + 0.8, this.z);
    this.isInLava = feetLava || waistLava;
    this.isInWater = feetInWater || waistInWater || this.isInLava;
    this.isUnderwater = headInWater;
    this.isSwimming = this.isInWater && !this.grounded && !this.isInLava;

    // Smooth transition for underwater visual effects
    const targetFactor = this.isUnderwater ? 1.0 : 0.0;
    this.underwaterFactor += (targetFactor - this.underwaterFactor) * 0.12;
    if (Math.abs(this.underwaterFactor - targetFactor) < 0.01) {
      this.underwaterFactor = targetFactor;
    }
  }

  private handleSwimming(dt: number): void {
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    // Forward direction includes pitch for diving/rising
    const lookY = Math.sin(this.pitch);
    const lookHorizontal = Math.cos(this.pitch);

    let moveX = 0;
    let moveZ = 0;
    let moveY = 0;

    const isMoving =
      this.input.isKeyDown('KeyW') || this.input.isKeyDown('ArrowUp') ||
      this.input.isKeyDown('KeyS') || this.input.isKeyDown('ArrowDown') ||
      this.input.isKeyDown('KeyA') || this.input.isKeyDown('ArrowLeft') ||
      this.input.isKeyDown('KeyD') || this.input.isKeyDown('ArrowRight');

    if (this.input.isKeyDown('KeyW') || this.input.isKeyDown('ArrowUp')) {
      moveX += forwardX * lookHorizontal;
      moveZ += forwardZ * lookHorizontal;
      moveY += lookY;
    }
    if (this.input.isKeyDown('KeyS') || this.input.isKeyDown('ArrowDown')) {
      moveX -= forwardX * lookHorizontal;
      moveZ -= forwardZ * lookHorizontal;
      moveY -= lookY;
    }
    if (this.input.isKeyDown('KeyA') || this.input.isKeyDown('ArrowLeft')) {
      moveX -= rightX; moveZ -= rightZ;
    }
    if (this.input.isKeyDown('KeyD') || this.input.isKeyDown('ArrowRight')) {
      moveX += rightX; moveZ += rightZ;
    }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ + moveY * moveY);
    if (len > 0) { moveX /= len; moveZ /= len; moveY /= len; }

    // Swim speed
    let speed = this.input.isKeyDown('ShiftLeft') ? SWIM_SPRINT_SPEED : SWIM_SPEED;
    speed *= this.statusEffects.getSpeedMultiplier();

    this.vx = moveX * speed;
    this.vz = moveZ * speed;

    // Vertical: swim up with Space, sink with Shift, or follow look direction
    if (this.input.isKeyDown('Space')) {
      this.vy = SWIM_UP_FORCE;
    } else if (this.input.isKeyDown('ShiftLeft') && !isMoving) {
      this.vy = -SWIM_DOWN_SPEED;
    } else {
      // Apply gentle gravity (sinking) + buoyancy
      this.vy -= WATER_GRAVITY * dt;
      this.vy += WATER_BUOYANCY * dt * 0.3;

      // When actively moving forward, use the look direction for vertical
      if (isMoving) {
        this.vy += moveY * speed * 0.8;
      }
    }

    // Water drag
    this.vy *= WATER_DRAG;
    this.vy = clamp(this.vy, -SWIM_DOWN_SPEED * 2, SWIM_UP_FORCE);

    // Swimming stroke animation phase
    if (isMoving) {
      this.swimStrokePhase += dt * 4.5;
    } else {
      // Gentle idle bob
      this.swimStrokePhase += dt * 1.2;
    }

    // Physics collision
    const result = this.physics.moveWithCollision(
      this.x, this.y, this.z,
      this.vx, this.vy, this.vz,
      dt,
    );

    this.x = result.x;
    this.y = result.y;
    this.z = result.z;
    this.vx = result.vx;
    this.vy = result.vy;
    this.vz = result.vz;
    this.grounded = result.grounded;

    // Reset falling state in water
    this.isFalling = false;
    this.fallStartY = this.y;
  }

  private updateOxygen(dt: number): void {
    if (this.isUnderwater) {
      // Deplete oxygen
      this.oxygen -= OXYGEN_DEPLETION_RATE * dt;
      if (this.oxygen <= 0) {
        this.oxygen = 0;
        // Drowning damage
        this.drowningTimer += dt;
        if (this.drowningTimer >= DROWNING_INTERVAL) {
          this.drowningTimer -= DROWNING_INTERVAL;
          this.takeDamage(DROWNING_DAMAGE, 0, 0);
        }
      }
    } else {
      // Regen oxygen when not underwater
      this.drowningTimer = 0;
      if (this.oxygen < this.maxOxygen) {
        this.oxygen = Math.min(this.maxOxygen, this.oxygen + OXYGEN_REGEN_RATE * dt);
      }
    }
  }

  private handleFlying(dt: number): void {
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let moveX = 0;
    let moveZ = 0;
    let moveY = 0;

    if (this.input.isKeyDown('KeyW') || this.input.isKeyDown('ArrowUp')) { moveX += forwardX; moveZ += forwardZ; }
    if (this.input.isKeyDown('KeyS') || this.input.isKeyDown('ArrowDown')) { moveX -= forwardX; moveZ -= forwardZ; }
    if (this.input.isKeyDown('KeyA') || this.input.isKeyDown('ArrowLeft')) { moveX -= rightX; moveZ -= rightZ; }
    if (this.input.isKeyDown('KeyD') || this.input.isKeyDown('ArrowRight')) { moveX += rightX; moveZ += rightZ; }
    if (this.input.isKeyDown('Space')) moveY += 1;
    if (this.input.isKeyDown('ShiftLeft')) moveY -= 1;

    const flySpeed = 12;
    this.x += moveX * flySpeed * dt;
    this.y += moveY * flySpeed * dt;
    this.z += moveZ * flySpeed * dt;
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;

    // Double-tap space to stop flying
    if (this.input.wasKeyPressed?.('Space') && this.flyDoubleTapTimer > 0) {
      this.isFlying = false;
    }
    if (this.input.wasKeyPressed?.('Space')) {
      this.flyDoubleTapTimer = 0.3;
    }
  }

  private handleRiding(dt: number): void {
    const horse = this.ridingEntity!;

    // Player controls the horse's movement direction
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let moveX = 0;
    let moveZ = 0;

    if (this.input.isKeyDown('KeyW') || this.input.isKeyDown('ArrowUp')) { moveX += forwardX; moveZ += forwardZ; }
    if (this.input.isKeyDown('KeyS') || this.input.isKeyDown('ArrowDown')) { moveX -= forwardX; moveZ -= forwardZ; }
    if (this.input.isKeyDown('KeyA') || this.input.isKeyDown('ArrowLeft')) { moveX -= rightX; moveZ -= rightZ; }
    if (this.input.isKeyDown('KeyD') || this.input.isKeyDown('ArrowRight')) { moveX += rightX; moveZ += rightZ; }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    // Horse speed
    const horseSpeed = horse.definition.speed;
    horse.vx = moveX * horseSpeed;
    horse.vz = moveZ * horseSpeed;

    // Horse gravity
    horse.vy -= GRAVITY * dt;
    horse.vy = clamp(horse.vy, -TERMINAL_VELOCITY, TERMINAL_VELOCITY);

    // Horse jump (more powerful)
    if (this.input.isKeyDown('Space') && horse.grounded) {
      horse.vy = JUMP_FORCE * 1.5;
      horse.grounded = false;
    }

    // Horse physics
    const result = this.physics.moveEntityWithCollision(
      horse.x, horse.y, horse.z,
      horse.vx, horse.vy, horse.vz,
      dt,
      horse.definition.width,
      horse.definition.height,
    );

    horse.x = result.x;
    horse.y = result.y;
    horse.z = result.z;
    horse.vx = result.vx;
    horse.vy = result.vy;
    horse.vz = result.vz;
    horse.grounded = result.grounded;

    // Horse rotation follows movement
    if (Math.abs(horse.vx) > 0.1 || Math.abs(horse.vz) > 0.1) {
      horse.yaw = Math.atan2(-horse.vx, -horse.vz);
    }

    // Update horse model position
    horse.model.group.position.set(horse.x, horse.y, horse.z);
    horse.model.group.rotation.y = horse.yaw;

    // Sync player position to horse
    this.x = horse.x;
    this.y = horse.y + horse.definition.height;
    this.z = horse.z;
    this.grounded = horse.grounded;
    this.vx = horse.vx;
    this.vy = horse.vy;
    this.vz = horse.vz;

    // Dismount with Shift
    if (this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight')) {
      this.dismount();
    }
  }

  mountHorse(entity: Entity): void {
    this.isRiding = true;
    this.ridingEntity = entity;
    entity.ai.state = 0; // Reset AI to IDLE
    entity.vx = 0;
    entity.vz = 0;
  }

  dismount(): void {
    if (!this.ridingEntity) return;
    const horse = this.ridingEntity;
    this.isRiding = false;
    this.ridingEntity = null;

    // Place player beside the horse
    const offsetX = Math.sin(horse.yaw) * 1.2;
    const offsetZ = Math.cos(horse.yaw) * 1.2;
    this.x = horse.x + offsetX;
    this.y = horse.y;
    this.z = horse.z + offsetZ;
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
  }

  takeDamage(amount: number, knockbackX: number, knockbackZ: number): void {
    if (this.hurtInvincibility > 0) return;

    this.health = Math.max(0, this.health - amount);
    this.hurtInvincibility = PLAYER_HURT_INVINCIBILITY;
    this.hurtFlashTimer = 0.3;

    // Apply knockback
    const len = Math.sqrt(knockbackX * knockbackX + knockbackZ * knockbackZ);
    if (len > 0) {
      this.vx = (knockbackX / len) * KNOCKBACK_FORCE;
      this.vz = (knockbackZ / len) * KNOCKBACK_FORCE;
      this.vy = KNOCKBACK_FORCE * 0.3;
    }
  }

  private updateCamera(dt: number = 1 / 60): void {
    let eyeX = this.x, eyeY: number, eyeZ = this.z;
    if (this.isRiding && this.ridingEntity) {
      const horse = this.ridingEntity;
      eyeX = horse.x; eyeZ = horse.z;
      eyeY = horse.y + horse.definition.height + PLAYER_EYE_HEIGHT * 0.6;
    } else {
      eyeY = this.y + PLAYER_EYE_HEIGHT;
    }

    // Horizontal speed (smoothed) drives bobbing and FOV
    const hs = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    this.smoothSpeed += (hs - this.smoothSpeed) * Math.min(1, dt * 8);
    const walking = this.grounded && !this.isInWater && !this.isFlying && !this.isRiding && this.smoothSpeed > 0.5;

    // View bobbing
    this.bobPhase += dt * this.smoothSpeed * 1.9;
    const targetBob = walking ? Math.min(1, this.smoothSpeed / PLAYER_SPRINT_SPEED) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(1, dt * 10);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.055 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.035 * this.bobAmount;

    // Landing dip eases back up
    if (this.landDip > 0) this.landDip = Math.max(0, this.landDip - dt * 1.6);
    eyeY += bobY - this.landDip;

    // Underwater camera bob for immersion
    if (this.isInWater && this.underwaterFactor > 0.01) {
      const bobAmount = 0.04 * this.underwaterFactor;
      const bobSpeed = this.isSwimming ? 2.0 : 1.2;
      eyeY += Math.sin(this.swimStrokePhase * bobSpeed) * bobAmount;
    }

    // Sideways sway relative to the view direction
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    eyeX += rightX * bobX;
    eyeZ += rightZ * bobX;

    // Orientation
    let roll = 0;
    if (this.isSwimming && this.underwaterFactor > 0.1) roll += Math.sin(this.swimStrokePhase * 1.3) * 0.02 * this.underwaterFactor;
    if (this.hurtFlashTimer > 0) roll += Math.sin(this.hurtFlashTimer * 40) * 0.05 * (this.hurtFlashTimer / 0.3);
    roll += rightX * 0 + this.bobAmount * Math.cos(this.bobPhase) * 0.004;
    const euler = new THREE.Euler(this.pitch, this.yaw, roll, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // FOV kick when sprinting / flying fast, smooth
    const sprinting = walking && this.smoothSpeed > PLAYER_SPEED * 1.15;
    const targetFov = this.baseFov * (sprinting ? 1.12 : 1.0) * (this.isInLava ? 0.92 : 1.0);
    if (Math.abs(this.camera.fov - targetFov) > 0.02) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 7);
      this.camera.updateProjectionMatrix();
    }

    // Third person: pull the camera back, never through blocks
    const third = this.cameraMode !== 0 && !this.isRiding;
    if (third && this.world) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const sign = this.cameraMode === 1 ? -1 : 1;
      let dist = 4.2;
      for (let d = 0.3; d <= 4.2; d += 0.2) {
        const cx = eyeX + dir.x * d * sign, cy = eyeY + dir.y * d * sign, cz = eyeZ + dir.z * d * sign;
        if (this.world.isSolid(cx, cy, cz)) { dist = Math.max(0.3, d - 0.35); break; }
      }
      this.camDistance += (dist - this.camDistance) * Math.min(1, dt * 14);
      if (this.camDistance > dist) this.camDistance = dist;
      this.camera.position.set(eyeX + dir.x * this.camDistance * sign, eyeY + dir.y * this.camDistance * sign, eyeZ + dir.z * this.camDistance * sign);
      if (this.cameraMode === 2) {
        // look back at the player
        this.camera.lookAt(eyeX, eyeY, eyeZ);
      }
    } else {
      this.camera.position.set(eyeX, eyeY, eyeZ);
    }

    if (this.avatar) {
      this.avatar.update(dt, this.x, this.y, this.z, this.yaw, this.pitch, this.smoothSpeed, third);
    }
  }

  /** Lava, fire, magma and the void */
  private updateHazards(dt: number): void {
    if (!this.world) return;
    const w = this.world;
    const fx = Math.floor(this.x), fz = Math.floor(this.z);
    const feet = w.getBlock(fx, Math.floor(this.y + 0.1), fz);
    const body = w.getBlock(fx, Math.floor(this.y + 1.0), fz);

    if (this.isInLava) {
      this.burnTimer = 14;
      this.lavaDamageTimer += dt;
      if (this.lavaDamageTimer >= 0.5) {
        this.lavaDamageTimer = 0;
        this.hurtInvincibility = 0;
        this.takeDamage(4, 0, 0);
      }
    } else {
      this.lavaDamageTimer = 0;
    }
    if (feet === BlockType.FIRE || body === BlockType.FIRE) this.ignite(6);
    if (this.isInWater && !this.isInLava) this.burnTimer = 0;

    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.burnDamageTimer += dt;
      if (this.burnDamageTimer >= 1.0) {
        this.burnDamageTimer = 0;
        this.hurtInvincibility = 0;
        this.takeDamage(1, 0, 0);
      }
    } else {
      this.burnDamageTimer = 0;
    }

    // Magma block under the feet
    if (this.grounded && w.getBlock(fx, Math.floor(this.y - 0.1), fz) === BlockType.MAGMA_BLOCK) {
      this.magmaTimer += dt;
      if (this.magmaTimer >= 1.0) { this.magmaTimer = 0; this.hurtInvincibility = 0; this.takeDamage(1, 0, 0); this.ignite(2); }
    } else {
      this.magmaTimer = 0;
    }

    // Falling into the void
    if (this.y < this.voidY) {
      this.hurtInvincibility = 0;
      this.takeDamage(50, 0, 0);
    }
  }

  private updateSurvival(dt: number): void {
    // Track movement distance for hunger drain
    const dx = this.x - this.lastX;
    const dz = this.z - this.lastZ;
    this.distanceMoved += Math.sqrt(dx * dx + dz * dz);
    this.lastX = this.x;
    this.lastZ = this.z;

    // Hunger drain from movement (every 40 blocks moved)
    if (this.distanceMoved >= 40) {
      this.distanceMoved -= 40;
      if (this.saturation > 0) {
        this.saturation = Math.max(0, this.saturation - 1);
      } else {
        this.hunger = Math.max(0, this.hunger - 1);
      }
    }

    // Passive hunger drain (1 point every 80 seconds)
    this.hungerTimer += dt;
    if (this.hungerTimer >= 80) {
      this.hungerTimer -= 80;
      if (this.saturation > 0) {
        this.saturation = Math.max(0, this.saturation - 1);
      } else {
        this.hunger = Math.max(0, this.hunger - 1);
      }
    }

    // Health regeneration when hunger >= 18
    if (this.hunger >= 18 && this.health < this.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer >= 4) {
        this.regenTimer -= 4;
        this.health = Math.min(this.maxHealth, this.health + 1);
        // Regen costs hunger
        if (this.saturation > 0) {
          this.saturation = Math.max(0, this.saturation - 1);
        } else {
          this.hunger = Math.max(0, this.hunger - 0.5);
        }
      }
    } else {
      this.regenTimer = 0;
    }

    // Starvation damage when hunger === 0
    if (this.hunger <= 0) {
      this.starvationTimer += dt;
      if (this.starvationTimer >= 4) {
        this.starvationTimer -= 4;
        this.health = Math.max(1, this.health - 1);
      }
    } else {
      this.starvationTimer = 0;
    }
  }

  /** Get the direction the player is looking */
  getLookDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);
    return dir;
  }

  /** Eat food to restore hunger and saturation */
  eatFood(hungerRestore: number, saturationRestore: number): void {
    this.hunger = Math.min(this.maxHunger, this.hunger + hungerRestore);
    this.saturation = Math.min(this.maxHunger, this.saturation + saturationRestore);
  }

  /** Kill the player */
  die(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.health = 0;
  }

  /** Respawn player at given position */
  respawn(spawnX: number, spawnY: number, spawnZ: number): void {
    this.isDead = false;
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.saturation = 5;
    this.oxygen = this.maxOxygen;
    this.x = spawnX;
    this.y = spawnY;
    this.z = spawnZ;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.isFalling = false;
    this.isEating = false;
    this.hurtInvincibility = 2;
    this.burnTimer = 0;
  }

  /** Get total armor defense from equipped armor */
  getArmorDefense(): number {
    return this.armor;
  }

  /** Apply armor reduction to incoming damage */
  getReducedDamage(rawDamage: number): number {
    const armorPoints = this.getArmorDefense();
    const reduction = armorPoints * 0.04;
    return Math.max(1, rawDamage * (1 - reduction));
  }
}
