import * as THREE from 'three';
import { Entity } from './Entity';
import { MobType } from './MobTypes';

/** End crystal: floats and spins on an obsidian pillar and heals the dragon. */
export class EndCrystal extends Entity {
  /** Set when the crystal was destroyed and an explosion must happen */
  explodeRequested = false;
  private t = Math.random() * 10;

  constructor(x: number, y: number, z: number) {
    super(MobType.END_CRYSTAL, x, y, z);
    this.model.group.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
      if (m && 'emissive' in m) {
        m.emissive = new THREE.Color(0xb050d0);
        m.emissiveIntensity = 0.7;
      }
    });
  }

  update(dt: number): void {
    this.t += dt;
    if (this.isDead) { this.markedForRemoval = true; return; }
    const g = this.model.group;
    g.position.set(this.x, this.y + Math.sin(this.t * 1.5) * 0.12, this.z);
    g.rotation.y = this.t * 1.2;
    // tumbling inner crystal
    const inner = g.children[g.children.length - 1];
    if (inner) { inner.rotation.x = this.t * 1.7; inner.rotation.z = this.t * 1.1; }
  }

  takeDamage(): void {
    if (this.isDead) return;
    this.isDead = true;
    this.explodeRequested = true;
    this.markedForRemoval = true;
  }
}
