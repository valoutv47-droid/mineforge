import * as THREE from 'three';
import type { World } from '../world/World';

export type FireballKind = 'ghast' | 'blaze' | 'dragon';

export interface ProjectileCallbacks {
  /** Player takes damage. `fire` = sets the player on fire */
  hitPlayer: (damage: number, fire: boolean, fromX: number, fromZ: number) => void;
  /** An explosion should happen (block damage + area damage) */
  explode: (x: number, y: number, z: number, radius: number, damagePlayer: number) => void;
}

interface Fireball {
  kind: FireballKind;
  mesh: THREE.Mesh;
  glow: THREE.PointLight | null;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
}

const GEOS: Record<FireballKind, { radius: number; color: number; damage: number; explosion: number; fire: boolean }> = {
  ghast: { radius: 0.55, color: 0xffa040, damage: 6, explosion: 2.2, fire: true },
  blaze: { radius: 0.18, color: 0xffcc40, damage: 5, explosion: 0, fire: true },
  dragon: { radius: 0.7, color: 0xc060ff, damage: 8, explosion: 2.6, fire: false },
};

/** Fireballs shot by ghasts, blazes and the ender dragon */
export class ProjectileManager {
  private readonly scene: THREE.Scene;
  private readonly balls: Fireball[] = [];
  private readonly geoCache = new Map<FireballKind, THREE.SphereGeometry>();
  private readonly matCache = new Map<FireballKind, THREE.MeshBasicMaterial>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  shoot(kind: FireballKind, x: number, y: number, z: number, tx: number, ty: number, tz: number, speed = 9): void {
    const cfg = GEOS[kind];
    let geo = this.geoCache.get(kind);
    if (!geo) { geo = new THREE.SphereGeometry(cfg.radius, 10, 8); this.geoCache.set(kind, geo); }
    let mat = this.matCache.get(kind);
    if (!mat) { mat = new THREE.MeshBasicMaterial({ color: cfg.color }); this.matCache.set(kind, mat); }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    let dx = tx - x, dy = ty - y, dz = tz - z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= len; dy /= len; dz /= len;
    this.balls.push({ kind, mesh, glow: null, x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, life: 9 });
  }

  update(dt: number, world: World, px: number, py: number, pz: number, cb: ProjectileCallbacks): void {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const cfg = GEOS[b.kind];
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.life -= dt;
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.scale.setScalar(1 + Math.sin(b.life * 20) * 0.08);

      let done = b.life <= 0;
      const dx = b.x - px, dy = b.y - (py + 0.9), dz = b.z - pz;
      if (dx * dx + dy * dy + dz * dz < (cfg.radius + 0.55) * (cfg.radius + 0.55)) {
        cb.hitPlayer(cfg.damage, cfg.fire, b.x - b.vx, b.z - b.vz);
        if (cfg.explosion > 0) cb.explode(b.x, b.y, b.z, cfg.explosion, 0);
        done = true;
      } else if (world.isSolid(b.x, b.y, b.z)) {
        if (cfg.explosion > 0) cb.explode(b.x, b.y, b.z, cfg.explosion, cfg.damage);
        done = true;
      }
      if (done) {
        this.scene.remove(b.mesh);
        this.balls.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const b of this.balls) this.scene.remove(b.mesh);
    this.balls.length = 0;
  }
}
