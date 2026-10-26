import * as THREE from 'three';
import { World } from '../world/World';
import { Dimension, DIMENSION_NAMES } from '../world/Dimension';
import { Player } from '../player/Player';
import { MobManager } from '../entities/MobManager';
import { Sky } from '../rendering/Sky';
import { TorchLightManager } from '../rendering/TorchLightManager';
import { SoundEngine } from '../audio/SoundEngine';
import { CommandSystem } from '../ui/CommandSystem';
import { XPSystem } from '../ui/XPSystem';
import { InventorySystem } from '../ui/InventorySystem';
import { BlockType, isBlockSolid } from '../blocks/BlockTypes';
import { MobType } from '../entities/MobTypes';
import { EnderDragon } from '../entities/EnderDragon';
import { EndCrystal } from '../entities/EndCrystal';
import { getEndPillars, END_FOUNTAIN_Y, EndPillar } from '../world/EndGenerator';
import { END_FRAME_OFFSETS } from '../world/PortalStructures';
import type { DroppedItemManager } from '../world/DroppedItemManager';

export interface DimensionDeps {
  world: World;
  player: Player;
  mobManager: MobManager;
  sky: Sky;
  scene: THREE.Scene;
  torchLights: TorchLightManager;
  sound: SoundEngine;
  chat: CommandSystem;
  xp: XPSystem;
  inventory: InventorySystem;
  droppedItems: DroppedItemManager;
  getSpawn: () => { x: number; y: number; z: number };
}

const PORTAL_TIME = 3.0;

/**
 * Everything that has to do with dimensions: lighting Nether portals,
 * End portal frames, travelling between worlds, the Ender Dragon fight,
 * explosions, and the little UI around them (portal vignette, boss bar).
 */
export class DimensionController {
  private readonly d: DimensionDeps;
  current: Dimension = Dimension.OVERWORLD;

  // portal travel
  private portalTimer = 0;
  private mustLeavePortal = false;

  // end fight
  private dragonDefeated = false;
  private fightStarted = false;
  private readonly crystalDestroyed: boolean[] = new Array(10).fill(false);
  private pillars: EndPillar[] = getEndPillars();
  private crystals: (EndCrystal | null)[] = new Array(10).fill(null);
  private beams: THREE.Line[] = [];
  private breaths: { mesh: THREE.Mesh; x: number; y: number; z: number; t: number; dmg: number }[] = [];
  private exitPortalOpened = false;
  private creditsTimer = -1;
  private deathHandled = false;

  // dom
  private readonly vignette: HTMLDivElement;
  private readonly loading: HTMLDivElement;
  private readonly loadingText: HTMLDivElement;
  private readonly bossBar: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossName: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private bannerTimer = 0;
  private readonly fireOverlay: HTMLDivElement;
  onDimensionChanged: ((dim: Dimension) => void) | null = null;

  constructor(deps: DimensionDeps) {
    this.d = deps;
    this.d.player.voidY = -12;
    this.d.mobManager.projectileCallbacks = {
      hitPlayer: (dmg, fire, fx, fz) => {
        if (this.d.player.isCreative) return;
        this.d.player.takeDamage(dmg, this.d.player.x - fx, this.d.player.z - fz);
        if (fire) this.d.player.ignite(5);
      },
      explode: (x, y, z, r, dmg) => this.explode(x, y, z, r, dmg),
    };

    const css = (el: HTMLElement, s: string): void => { el.style.cssText = s; };
    this.vignette = document.createElement('div');
    css(this.vignette, 'position:fixed;inset:0;pointer-events:none;z-index:50;opacity:0;background:radial-gradient(ellipse at center, rgba(120,40,200,0.25) 0%, rgba(90,20,180,0.75) 100%);mix-blend-mode:screen;transition:opacity .15s');
    document.body.appendChild(this.vignette);

    this.fireOverlay = document.createElement('div');
    css(this.fireOverlay, 'position:fixed;inset:0;pointer-events:none;z-index:49;opacity:0;background:linear-gradient(to top, rgba(255,120,20,0.55), rgba(255,60,0,0.0) 55%);transition:opacity .25s');
    document.body.appendChild(this.fireOverlay);

    this.loading = document.createElement('div');
    css(this.loading, 'position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;flex-direction:column;background:#150a1f;color:#fff;font-family:monospace');
    this.loadingText = document.createElement('div');
    css(this.loadingText, 'font-size:26px;letter-spacing:2px;text-shadow:2px 2px #000');
    this.loading.appendChild(this.loadingText);
    document.body.appendChild(this.loading);

    this.bossBar = document.createElement('div');
    css(this.bossBar, 'position:fixed;top:14px;left:50%;transform:translateX(-50%);width:min(520px,70vw);z-index:60;display:none;pointer-events:none;font-family:monospace;color:#fff;text-align:center;text-shadow:1px 1px #000');
    this.bossName = document.createElement('div');
    this.bossName.textContent = 'Ender Dragon';
    css(this.bossName, 'font-size:15px;margin-bottom:3px');
    const track = document.createElement('div');
    css(track, 'height:12px;background:rgba(20,0,30,0.85);border:2px solid #000;box-shadow:0 0 0 1px #5a3a7a');
    this.bossFill = document.createElement('div');
    css(this.bossFill, 'height:100%;width:100%;background:linear-gradient(#e060ff,#8a20c0);transition:width .15s');
    track.appendChild(this.bossFill);
    this.bossBar.appendChild(this.bossName);
    this.bossBar.appendChild(track);
    document.body.appendChild(this.bossBar);

    this.banner = document.createElement('div');
    css(this.banner, 'position:fixed;top:28%;left:0;right:0;text-align:center;z-index:70;pointer-events:none;font-family:monospace;font-size:34px;color:#fff;text-shadow:3px 3px #000;opacity:0;transition:opacity .6s');
    document.body.appendChild(this.banner);
  }

  // ─────────────────────────── helpers ───────────────────────────

  private get w(): World { return this.d.world; }

  private get(x: number, y: number, z: number): BlockType { return this.w.getBlock(x, y, z); }

  showBanner(text: string, seconds = 3.5): void {
    this.banner.textContent = text;
    this.banner.style.opacity = '1';
    this.bannerTimer = seconds;
  }

  private say(msg: string, color = '#ffaaff'): void { this.d.chat.addMessage(msg, color); }

  // ───────────────────────── Nether portal ─────────────────────────

  private isInterior(x: number, y: number, z: number): boolean {
    const b = this.get(x, y, z);
    return b === BlockType.AIR || b === BlockType.FIRE || b === BlockType.TALL_GRASS || b === BlockType.FERN;
  }

  /**
   * Try to light a nether portal from an empty cell touching the frame.
   * Works for any rectangle 2..21 wide and 3..21 tall made of obsidian.
   */
  tryLightPortal(px: number, py: number, pz: number): boolean {
    for (const axis of [0, 1]) {
      const dx = axis === 0 ? 1 : 0, dz = axis === 0 ? 0 : 1;
      if (!this.isInterior(px, py, pz)) continue;
      let by = py;
      for (let i = 0; i < 22 && this.isInterior(px, by - 1, pz); i++) by--;
      if (this.get(px, by - 1, pz) !== BlockType.OBSIDIAN) continue;
      let lx = px, lz = pz;
      for (let i = 0; i < 22 && this.isInterior(lx - dx, by, lz - dz); i++) { lx -= dx; lz -= dz; }
      if (this.get(lx - dx, by, lz - dz) !== BlockType.OBSIDIAN) continue;
      let wd = 0;
      while (wd < 22 && this.isInterior(lx + dx * wd, by, lz + dz * wd)) wd++;
      if (wd < 2 || this.get(lx + dx * wd, by, lz + dz * wd) !== BlockType.OBSIDIAN) continue;
      let ht = 0;
      while (ht < 22 && this.isInterior(lx, by + ht, lz)) ht++;
      if (ht < 3 || this.get(lx, by + ht, lz) !== BlockType.OBSIDIAN) continue;
      let ok = true;
      for (let i = 0; i < wd && ok; i++) {
        if (this.get(lx + dx * i, by - 1, lz + dz * i) !== BlockType.OBSIDIAN) ok = false;
        if (this.get(lx + dx * i, by + ht, lz + dz * i) !== BlockType.OBSIDIAN) ok = false;
        for (let j = 0; j < ht && ok; j++) if (!this.isInterior(lx + dx * i, by + j, lz + dz * i)) ok = false;
      }
      for (let j = 0; j < ht && ok; j++) {
        if (this.get(lx - dx, by + j, lz - dz) !== BlockType.OBSIDIAN) ok = false;
        if (this.get(lx + dx * wd, by + j, lz + dz * wd) !== BlockType.OBSIDIAN) ok = false;
      }
      if (!ok) continue;
      for (let i = 0; i < wd; i++) for (let j = 0; j < ht; j++) this.w.setBlock(lx + dx * i, by + j, lz + dz * i, BlockType.NETHER_PORTAL);
      this.d.sound.play('explosion', 0.25);
      this.showBanner('Portal ouvert', 2);
      return true;
    }
    return false;
  }

  /** Remove every portal block connected to this position (frame was broken) */
  collapsePortal(x: number, y: number, z: number): void {
    const stack: [number, number, number][] = [];
    for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0, 0, 0]]) {
      if (this.get(x + ax, y + ay, z + az) === BlockType.NETHER_PORTAL) stack.push([x + ax, y + ay, z + az]);
    }
    let n = 0;
    while (stack.length && n++ < 1200) {
      const [cx, cy, cz] = stack.pop()!;
      if (this.get(cx, cy, cz) !== BlockType.NETHER_PORTAL) continue;
      this.w.setBlock(cx, cy, cz, BlockType.AIR);
      for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        if (this.get(cx + ax, cy + ay, cz + az) === BlockType.NETHER_PORTAL) stack.push([cx + ax, cy + ay, cz + az]);
      }
    }
  }

  // ───────────────────────── End portal ─────────────────────────

  /** Right click with an eye of ender on a frame. Returns true when used. */
  tryInsertEye(x: number, y: number, z: number): boolean {
    if (this.get(x, y, z) !== BlockType.END_PORTAL_FRAME) return false;
    this.w.setBlock(x, y, z, BlockType.END_PORTAL_FRAME_EYE);
    this.d.sound.play('xp_pickup', 0.6);
    // Is a ring complete around some centre?
    for (let cx = x - 2; cx <= x + 2; cx++) for (let cz = z - 2; cz <= z + 2; cz++) {
      let all = true;
      for (const [ox, oz] of END_FRAME_OFFSETS) {
        if (this.get(cx + ox, y, cz + oz) !== BlockType.END_PORTAL_FRAME_EYE) { all = false; break; }
      }
      if (!all) continue;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) this.w.setBlock(cx + i, y, cz + j, BlockType.END_PORTAL);
      this.d.sound.play('explosion', 0.35);
      this.showBanner('Le portail de l\'End s\'ouvre...', 3);
      return true;
    }
    return true;
  }

  // ───────────────────────── Travel ─────────────────────────

  private fade(on: boolean, text = ''): void {
    this.loading.style.display = on ? 'flex' : 'none';
    this.loadingText.textContent = text;
  }

  /** Teleport to another dimension. `portalAt` decides how the arrival point is found. */
  travel(target: Dimension, how: 'portal' | 'spawn' | 'command' = 'portal'): void {
    const p = this.d.player;
    const from = this.current;
    if (target === from) return;
    this.fade(true, `Entrée dans ${DIMENSION_NAMES[target]}...`);
    // Let the loading screen paint before the heavy work happens
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.doTravel(from, target, how, p);
      this.fade(false);
    }));
  }

  private doTravel(from: Dimension, target: Dimension, how: string, p: Player): void {
    const w = this.w;
    let tx = p.x, tz = p.z;
    if (target === Dimension.NETHER) { tx = p.x / 8; tz = p.z / 8; }
    else if (from === Dimension.NETHER && target === Dimension.OVERWORLD) { tx = p.x * 8; tz = p.z * 8; }
    else if (target === Dimension.END) { tx = 0; tz = 0; }
    else if (from === Dimension.END && target === Dimension.OVERWORLD) {
      const s = this.d.getSpawn(); tx = s.x; tz = s.z;
    }

    // leave old dimension
    this.clearEndFightVisuals();
    this.d.mobManager.clearAll();
    this.d.torchLights.clearTorches();
    w.setDimension(target);
    this.current = target;
    this.d.sky.setMode(target === Dimension.OVERWORLD ? 0 : target === Dimension.NETHER ? 1 : 2);
    this.d.mobManager.setDimension(target);

    w.preloadAround(tx, tz, 3);
    let pos: { x: number; y: number; z: number };
    if (target === Dimension.NETHER) pos = this.arriveNether(tx, tz, how === 'portal');
    else if (target === Dimension.END) pos = this.arriveEnd();
    else pos = this.arriveOverworld(tx, tz, how === 'portal' && from === Dimension.NETHER);

    p.x = pos.x; p.y = pos.y; p.z = pos.z;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.extinguish();
    this.mustLeavePortal = true;
    this.portalTimer = 0;
    w.forceLoadAll(p.x, p.z);
    this.say(`Vous êtes dans ${DIMENSION_NAMES[target]}`, target === Dimension.NETHER ? '#ff7755' : target === Dimension.END ? '#cc88ff' : '#55ff55');
    if (target === Dimension.END) this.startEndFight();
    if (this.onDimensionChanged) this.onDimensionChanged(target);
  }

  private findPortalNear(cx: number, cz: number, r: number, yMin: number, yMax: number): { x: number; y: number; z: number } | null {
    let best: { x: number; y: number; z: number } | null = null;
    let bestD = Infinity;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz;
      for (let y = yMin; y <= yMax; y++) {
        if (this.get(x, y, z) !== BlockType.NETHER_PORTAL) continue;
        if (this.get(x, y - 1, z) === BlockType.NETHER_PORTAL) continue; // bottom cells only
        const d = dx * dx + dz * dz + (y - 64) * (y - 64) * 0.01;
        if (d < bestD) { bestD = d; best = { x, y, z }; }
      }
    }
    return best;
  }

  /** Build a fresh 4x5 obsidian portal with a platform around it */
  private buildPortal(x: number, y: number, z: number): { x: number; y: number; z: number } {
    const w = this.w;
    for (let dx = -2; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 1; dy <= 6; dy++) w.setBlock(x + dx, y + dy - 1 + 0, z + dz, BlockType.AIR);
      // platform one below
      if (dz >= -1 && dz <= 1 && dx >= -1 && dx <= 2) w.setBlock(x + dx, y - 1, z + dz, BlockType.OBSIDIAN);
    }
    for (let i = 0; i < 4; i++) {
      w.setBlock(x + i - 1, y, z, BlockType.OBSIDIAN);
      w.setBlock(x + i - 1, y + 4, z, BlockType.OBSIDIAN);
    }
    for (let j = 1; j <= 3; j++) { w.setBlock(x - 1, y + j, z, BlockType.OBSIDIAN); w.setBlock(x + 2, y + j, z, BlockType.OBSIDIAN); }
    for (let i = 0; i < 2; i++) for (let j = 1; j <= 3; j++) w.setBlock(x + i, y + j, z, BlockType.NETHER_PORTAL);
    return { x, y: y + 1, z };
  }

  private groundBelow(x: number, z: number, from: number, to: number): number {
    for (let y = from; y > to; y--) {
      const b = this.get(x, y, z);
      if (isBlockSolid(b) && b !== BlockType.LEAVES && b !== BlockType.BIRCH_LEAVES && b !== BlockType.SPRUCE_LEAVES &&
          b !== BlockType.JUNGLE_LEAVES && b !== BlockType.ACACIA_LEAVES && b !== BlockType.ICE) return y;
    }
    return -1;
  }

  private arriveNether(tx: number, tz: number, viaPortal: boolean): { x: number; y: number; z: number } {
    if (viaPortal) {
      const found = this.findPortalNear(tx, tz, 20, 4, 120);
      if (found) return { x: found.x + 0.5, y: found.y, z: found.z + 0.5 };
    }
    // choose a floor above the lava sea near the target
    let bx = Math.floor(tx), bz = Math.floor(tz), by = -1;
    outer:
    for (let r = 0; r < 40; r += 2) {
      for (let a = 0; a < 8; a++) {
        const x = Math.floor(tx + Math.cos(a * 0.785) * r), z = Math.floor(tz + Math.sin(a * 0.785) * r);
        for (let y = 100; y > 33; y--) {
          if (isBlockSolid(this.get(x, y, z)) && this.get(x, y + 1, z) === BlockType.AIR && this.get(x, y + 2, z) === BlockType.AIR) {
            bx = x; bz = z; by = y; break outer;
          }
        }
      }
    }
    if (by < 0) by = 64;
    const pos = this.buildPortal(bx, by + 1, bz);
    return { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 };
  }

  private arriveOverworld(tx: number, tz: number, viaPortal: boolean): { x: number; y: number; z: number } {
    if (!viaPortal) {
      const s = this.d.getSpawn();
      if (Math.hypot(tx - s.x, tz - s.z) < 2) return { x: s.x, y: s.y, z: s.z };
    }
    if (viaPortal) {
      const found = this.findPortalNear(tx, tz, 24, 1, 126);
      if (found) return { x: found.x + 0.5, y: found.y, z: found.z + 0.5 };
      const gx = Math.floor(tx), gz = Math.floor(tz);
      const gy = Math.max(this.groundBelow(gx, gz, 120, 1), 34);
      const pos = this.buildPortal(gx, gy + 1, gz);
      return { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 };
    }
    const gy = this.groundBelow(Math.floor(tx), Math.floor(tz), 120, 1);
    return { x: tx + 0.5, y: Math.max(gy + 1, 36), z: tz + 0.5 };
  }

  private arriveEnd(): { x: number; y: number; z: number } {
    // Spawn on the island edge between two pillars
    const x = 50, z = 16;
    let y = this.groundBelow(x, z, 90, 30);
    if (y < 0) y = 62;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      this.w.setBlock(x + dx, y, z + dz, BlockType.OBSIDIAN);
      for (let dy = 1; dy <= 3; dy++) this.w.setBlock(x + dx, y + dy, z + dz, BlockType.AIR);
    }
    return { x: x + 0.5, y: y + 1, z: z + 0.5 };
  }

  /** After the player died: return to the overworld spawn */
  respawnInOverworld(): void {
    if (this.current === Dimension.OVERWORLD) return;
    this.clearEndFightVisuals();
    this.d.mobManager.clearAll();
    this.d.torchLights.clearTorches();
    this.w.setDimension(Dimension.OVERWORLD);
    this.current = Dimension.OVERWORLD;
    this.d.sky.setMode(0);
    this.d.mobManager.setDimension(Dimension.OVERWORLD);
    this.fightStarted = false;
    this.bossBar.style.display = 'none';
    this.w.forceLoadAll(this.d.getSpawn().x, this.d.getSpawn().z);
    if (this.onDimensionChanged) this.onDimensionChanged(Dimension.OVERWORLD);
  }

  // ───────────────────────── The End fight ─────────────────────────

  private startEndFight(): void {
    if (this.fightStarted) return;
    this.fightStarted = true;
    this.deathHandled = false;
    this.d.mobManager.clearAll();
    this.pillars.forEach((pl, i) => {
      if (this.crystalDestroyed[i]) return;
      const c = this.d.mobManager.spawnMob(MobType.END_CRYSTAL, pl.x + 0.5, pl.height + 2, pl.z + 0.5) as EndCrystal;
      this.crystals[i] = c;
    });
    if (!this.dragonDefeated) {
      this.d.mobManager.spawnMob(MobType.ENDER_DRAGON, 0, 90, 55);
      this.showBanner('Ender Dragon', 3);
    }
  }

  private clearEndFightVisuals(): void {
    for (const b of this.beams) this.d.scene.remove(b);
    this.beams = [];
    for (const br of this.breaths) this.d.scene.remove(br.mesh);
    this.breaths = [];
    this.crystals = new Array(10).fill(null);
    this.fightStarted = false;
    this.bossBar.style.display = 'none';
  }

  /** Spawn a crystal again (used by /summon) */
  private getDragon(): EnderDragon | null {
    for (const m of this.d.mobManager.getMobs()) if (m instanceof EnderDragon) return m;
    return null;
  }

  private spawnBreath(x: number, y: number, z: number): void {
    const geo = new THREE.CircleGeometry(3, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xc040ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.15, z);
    this.d.scene.add(mesh);
    this.breaths.push({ mesh, x, y, z, t: 0, dmg: 0 });
  }

  private updateEndFight(dt: number): void {
    const dragon = this.getDragon();
    const p = this.d.player;

    // crystals
    const alive: EndCrystal[] = [];
    for (let i = 0; i < 10; i++) {
      const c = this.crystals[i];
      if (!c) continue;
      if (c.explodeRequested) {
        c.explodeRequested = false;
        this.crystalDestroyed[i] = true;
        this.crystals[i] = null;
        this.explode(c.x, c.y + 1, c.z, 4.5, 8);
        if (dragon && !dragon.isDead) {
          const dd = Math.hypot(dragon.x - c.x, dragon.y - c.y, dragon.z - c.z);
          if (dd < 14) dragon.takeDamage(20, 0, 0);
        }
        this.say('Un cristal de l\'End a été détruit !', '#ff88ff');
      } else if (!c.isDead) alive.push(c);
    }
    if (dragon) dragon.healBeamTargets = alive;

    // heal beams
    while (this.beams.length < 10) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff60ff }));
      line.frustumCulled = false;
      line.visible = false;
      this.d.scene.add(line);
      this.beams.push(line);
    }
    this.beams.forEach((line, i) => {
      const c = this.crystals[i];
      if (!dragon || dragon.isDead || !c || c.isDead) { line.visible = false; return; }
      line.visible = true;
      const a = line.geometry.attributes.position as THREE.BufferAttribute;
      a.setXYZ(0, c.x, c.y + 1.2, c.z);
      a.setXYZ(1, dragon.x, dragon.y + 1.4, dragon.z);
      a.needsUpdate = true;
    });

    // dragon requests
    if (dragon && !dragon.isDead) {
      if (dragon.fireballRequest) {
        const r = dragon.fireballRequest;
        dragon.fireballRequest = null;
        this.d.mobManager.projectiles.shoot('dragon', r.x, r.y, r.z, r.tx, r.ty, r.tz, 11);
      }
      if (dragon.breathRequest) {
        const r = dragon.breathRequest;
        dragon.breathRequest = null;
        this.spawnBreath(r.x, r.y, r.z);
      }
    }

    // breath clouds
    for (let i = this.breaths.length - 1; i >= 0; i--) {
      const b = this.breaths[i];
      b.t += dt;
      b.dmg -= dt;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(b.t * 6) * 0.12;
      if (!p.isCreative && Math.hypot(p.x - b.x, p.z - b.z) < 3.1 && Math.abs(p.y - b.y) < 2.5 && b.dmg <= 0) {
        b.dmg = 0.5;
        p.hurtInvincibility = 0;
        p.takeDamage(2, 0, 0);
      }
      if (b.t > 6) { this.d.scene.remove(b.mesh); this.breaths.splice(i, 1); }
    }

    // boss bar
    if (dragon && !dragon.isDead) {
      this.bossBar.style.display = 'block';
      this.bossFill.style.width = `${Math.max(0, (dragon.health / dragon.maxHealth) * 100)}%`;
    } else {
      this.bossBar.style.display = 'none';
    }

    // death
    if (dragon && dragon.isDead && !this.deathHandled) {
      this.deathHandled = true;
      this.dragonDefeated = true;
      this.showBanner('Ender Dragon vaincu !', 6);
      this.say('L\'Ender Dragon est vaincu !', '#ffdd55');
      this.d.xp.addXP(2500);
      this.d.sound.play('explosion', 0.6);
      this.exitPortalOpened = false;
    }
    if (this.dragonDefeated && !this.exitPortalOpened && !dragon) {
      this.openExitPortal();
    }
  }

  private openExitPortal(): void {
    this.exitPortalOpened = true;
    const y = END_FOUNTAIN_Y;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (Math.hypot(dx, dz) < 2.6) this.w.setBlock(dx, y, dz, BlockType.END_PORTAL);
    }
    this.w.setBlock(0, y + 5, 0, BlockType.DRAGON_EGG);
    this.d.xp.addXP(9500);
    this.say('Le portail de sortie est ouvert.', '#cc88ff');
  }

  // ───────────────────────── Explosions ─────────────────────────

  explode(x: number, y: number, z: number, radius: number, playerDamage: number): void {
    const r = Math.ceil(radius);
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
      const b = this.get(bx + dx, by + dy, bz + dz);
      if (b === BlockType.AIR || b === BlockType.BEDROCK || b === BlockType.WATER || b === BlockType.OBSIDIAN ||
          b === BlockType.END_PORTAL_FRAME || b === BlockType.END_PORTAL_FRAME_EYE || b === BlockType.END_PORTAL ||
          b === BlockType.NETHER_PORTAL) continue;
      this.w.setBlock(bx + dx, by + dy, bz + dz, BlockType.AIR);
    }
    this.d.sound.play('explosion', 0.5);
    if (playerDamage > 0 && !this.d.player.isCreative) {
      const p = this.d.player;
      const dist = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
      const reach = radius * 1.8;
      if (dist < reach) {
        p.hurtInvincibility = 0;
        p.takeDamage(Math.max(1, Math.round(playerDamage * (1 - dist / reach))), p.x - x, p.z - z);
      }
    }
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt: number): void {
    const p = this.d.player;

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.style.opacity = '0';
    }
    this.fireOverlay.style.opacity = p.burnTimer > 0 ? String(0.7 + Math.sin(performance.now() / 90) * 0.15) : '0';

    // Standing in a portal?
    const fx = Math.floor(p.x), fz = Math.floor(p.z);
    const feet = this.get(fx, Math.floor(p.y + 0.3), fz);
    const body = this.get(fx, Math.floor(p.y + 1.2), fz);
    const inNether = feet === BlockType.NETHER_PORTAL || body === BlockType.NETHER_PORTAL;
    const inEnd = feet === BlockType.END_PORTAL || this.get(fx, Math.floor(p.y - 0.2), fz) === BlockType.END_PORTAL;

    if (!inNether && !inEnd) this.mustLeavePortal = false;

    if (inNether && !this.mustLeavePortal) {
      this.portalTimer += dt;
      this.vignette.style.opacity = String(Math.min(1, this.portalTimer / PORTAL_TIME));
      if (this.portalTimer >= PORTAL_TIME) {
        this.portalTimer = 0;
        this.vignette.style.opacity = '0';
        this.travel(this.current === Dimension.NETHER ? Dimension.OVERWORLD : Dimension.NETHER, 'portal');
        return;
      }
    } else {
      this.portalTimer = Math.max(0, this.portalTimer - dt * 2);
      this.vignette.style.opacity = String(Math.min(1, this.portalTimer / PORTAL_TIME));
    }

    if (inEnd && !this.mustLeavePortal) {
      if (this.current === Dimension.OVERWORLD) {
        this.travel(Dimension.END, 'portal');
        return;
      }
      if (this.current === Dimension.END && this.creditsTimer < 0) {
        this.creditsTimer = 4;
        this.showBanner('Vous avez conquis l\'End', 4);
      }
    }
    if (this.creditsTimer >= 0) {
      this.creditsTimer -= dt;
      if (this.creditsTimer < 0) {
        this.creditsTimer = -1;
        this.travel(Dimension.OVERWORLD, 'spawn');
        return;
      }
    }

    if (this.current === Dimension.END) this.updateEndFight(dt);
  }

  /** Slash command helpers */
  summonDragon(): void {
    if (this.current !== Dimension.END) { this.say('Le dragon ne vit que dans l\'End (/dimension end)', '#ff5555'); return; }
    if (this.getDragon()) return;
    this.dragonDefeated = false;
    this.exitPortalOpened = false;
    this.deathHandled = false;
    this.d.mobManager.spawnMob(MobType.ENDER_DRAGON, 0, 92, 50);
    this.showBanner('Ender Dragon', 3);
  }

  isEnd(): boolean { return this.current === Dimension.END; }
}

