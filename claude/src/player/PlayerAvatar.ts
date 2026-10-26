import * as THREE from 'three';

function px(seed: number, x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function tex(draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noisy(c: CanvasRenderingContext2D, rgb: [number, number, number], seed: number, amp = 14): void {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = (px(seed, x, y) - 0.5) * amp;
    c.fillStyle = `rgb(${rgb[0] + n | 0},${rgb[1] + n | 0},${rgb[2] + n | 0})`;
    c.fillRect(x, y, 1, 1);
  }
}

/** Simple Steve-like model shown in third-person camera modes. */
export class PlayerAvatar {
  readonly group = new THREE.Group();
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly head: THREE.Mesh;
  private phase = 0;

  constructor() {
    const mat = (t: THREE.Texture): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ map: t });
    const skin = tex(c => noisy(c, [198, 146, 112], 1));
    const hair = tex(c => noisy(c, [70, 44, 26], 2, 18));
    const face = tex(c => {
      noisy(c, [198, 146, 112], 3);
      c.fillStyle = '#46280f'; c.fillRect(0, 0, 16, 4);
      c.fillStyle = '#ffffff'; c.fillRect(3, 7, 4, 2); c.fillRect(9, 7, 4, 2);
      c.fillStyle = '#4a3aa0'; c.fillRect(5, 7, 2, 2); c.fillRect(9, 7, 2, 2);
      c.fillStyle = '#8a5a40'; c.fillRect(6, 11, 4, 1);
    });
    const shirt = tex(c => noisy(c, [60, 170, 190], 4));
    const pants = tex(c => noisy(c, [52, 56, 150], 5));
    const shoe = tex(c => noisy(c, [64, 64, 70], 6));

    const headMats = [mat(hair), mat(hair), mat(hair), mat(skin), mat(face), mat(hair)];
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMats);
    this.head.position.y = 1.55;
    this.group.add(this.head);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), mat(shirt));
    body.position.y = 1.0;
    this.group.add(body);

    const limb = (w: number, m: THREE.Texture, x: number, y: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(x, y, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.75, 0.25), mat(m));
      mesh.position.y = -0.375;
      g.add(mesh);
      this.group.add(g);
      return g;
    };
    this.armL = limb(0.25, skin, -0.375, 1.375);
    this.armR = limb(0.25, skin, 0.375, 1.375);
    this.legL = limb(0.25, pants, -0.125, 0.75);
    this.legR = limb(0.25, pants, 0.125, 0.75);
    for (const leg of [this.legL, this.legR]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.27), mat(shoe));
      foot.position.y = -0.69;
      leg.add(foot);
    }
    this.group.visible = false;
  }

  update(dt: number, x: number, y: number, z: number, yaw: number, pitch: number, speed: number, visible: boolean): void {
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw + Math.PI;
    this.head.rotation.x = -pitch * 0.8;
    if (speed > 0.1) this.phase += dt * Math.min(12, speed * 2.4);
    const amp = Math.min(1, speed / 3) * 0.9;
    const s = Math.sin(this.phase) * amp;
    this.armL.rotation.x = s; this.armR.rotation.x = -s;
    this.legL.rotation.x = -s; this.legR.rotation.x = s;
  }
}
