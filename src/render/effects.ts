// Battle effects: cannonballs in flight, fall-of-shot telegraph rings,
// cotton-wool smoke, splashes, wakes. Pooled, sim-event driven.

import * as THREE from 'three';
import type { Ball } from '../sim/types';
import { clamp, lerp } from '../sim/math';

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  vx: number;
  vz: number;
  baseScale: number;
}

interface RingFx {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  grow: number;
  baseR: number;
  color: THREE.Color;
}

interface Splinter {
  mesh: THREE.Mesh;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  rz: number;
}

function smokeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(225,220,210,0.85)');
  grad.addColorStop(0.6, 'rgba(215,210,200,0.4)');
  grad.addColorStop(1, 'rgba(210,205,195,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export class Effects {
  private scene: THREE.Scene;
  private smokeTex = smokeTexture();
  private puffs: Puff[] = [];
  private rings: RingFx[] = [];

  // splinters: the model chips like a model — bare timber + flecks of paint
  private splinterGeo = new THREE.BoxGeometry(3.4, 1.2, 1.2);
  private splinterMats = [
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
    new THREE.MeshLambertMaterial({ color: 0x8a6a43 }),
    new THREE.MeshLambertMaterial({ color: 0xcdbb90 }),
  ];
  private splinters: Splinter[] = [];

  // cannonballs
  private ballGeo = new THREE.SphereGeometry(2.4, 8, 6);
  private ballMatP = new THREE.MeshLambertMaterial({ color: 0x241d15 });
  private ballMeshes: THREE.Mesh[] = [];
  private shadowGeo = new THREE.CircleGeometry(2.6, 8);
  private shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
  private shadowMeshes: THREE.Mesh[] = [];
  // landing telegraph rings
  private landGeo = new THREE.RingGeometry(4, 5.4, 24);
  private landMatP = new THREE.MeshBasicMaterial({ color: 0xe9dcbe, transparent: true, side: THREE.DoubleSide });
  private landMatE = new THREE.MeshBasicMaterial({ color: 0xc4583a, transparent: true, side: THREE.DoubleSide });
  private landMeshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  smoke(x: number, y: number, dir: number, big = false): void {
    const mat = new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    const baseScale = big ? 26 : 14 + Math.random() * 8;
    sprite.position.set(x, 16, y);
    sprite.scale.setScalar(baseScale);
    this.scene.add(sprite);
    this.puffs.push({
      sprite,
      life: 0.9,
      max: 0.9,
      vx: Math.cos(dir) * 22,
      vz: Math.sin(dir) * 22,
      baseScale,
    });
  }

  private ring(x: number, y: number, color: number, life: number, baseR: number, grow: number): void {
    const geo = new THREE.RingGeometry(baseR, baseR + 2, 26);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 5, y);
    this.scene.add(mesh);
    this.rings.push({ mesh, life, max: life, grow, baseR, color: new THREE.Color(color) });
  }

  splash(x: number, y: number): void {
    this.ring(x, y, 0xb4d2d7, 0.7, 3, 13);
  }

  wake(x: number, y: number): void {
    this.ring(x, y, 0xe9dcbe, 1.6, 3, 10);
  }

  impact(x: number, y: number): void {
    this.smoke(x, y, Math.random() * Math.PI * 2, false);
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        this.splinterGeo,
        this.splinterMats[Math.floor(Math.random() * this.splinterMats.length)],
      );
      mesh.position.set(x, 16, y);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 60;
      this.splinters.push({
        mesh, life: 0.9,
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 50 + Math.random() * 70,
        rx: (Math.random() - 0.5) * 14, rz: (Math.random() - 0.5) * 14,
      });
    }
  }

  /** A hull goes under: a wide wash ring + a roil of spray over the spot. */
  sinkBurst(x: number, y: number): void {
    this.ring(x, y, 0xb4d2d7, 1.6, 10, 52);
    for (let i = 0; i < 6; i++) {
      this.smoke(
        x + (Math.random() - 0.5) * 30,
        y + (Math.random() - 0.5) * 30,
        Math.random() * Math.PI * 2,
        true,
      );
    }
  }

  /** Sync cannonballs + landing telegraphs to sim state (called every frame). */
  syncBalls(balls: Ball[], time: number): void {
    while (this.ballMeshes.length < balls.length) {
      const b = new THREE.Mesh(this.ballGeo, this.ballMatP);
      const sh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
      sh.rotation.x = -Math.PI / 2;
      const land = new THREE.Mesh(this.landGeo, this.landMatP);
      land.rotation.x = -Math.PI / 2;
      this.scene.add(b, sh, land);
      this.ballMeshes.push(b);
      this.shadowMeshes.push(sh);
      this.landMeshes.push(land);
    }
    for (let i = 0; i < this.ballMeshes.length; i++) {
      const bm = this.ballMeshes[i];
      const sm = this.shadowMeshes[i];
      const lm = this.landMeshes[i];
      const b = balls[i];
      const active = !!b;
      bm.visible = sm.visible = lm.visible = active;
      if (!active) continue;
      // the Greenglass's rule-break: her shot telegraphs nothing
      if (b.noTele) lm.visible = false;
      const t = clamp(b.t / b.T, 0, 1);
      const x = lerp(b.sx, b.lx, t);
      const z = lerp(b.sy, b.ly, t);
      const h = Math.sin(Math.PI * t);
      bm.position.set(x, 14 + h * 52, z);
      sm.position.set(x, 4.5, z);
      // fall-of-shot ring pulses where this ball will land
      const pulse = 0.5 + 0.5 * Math.sin(time * 9);
      lm.position.set(b.lx, 4.5, b.ly);
      const mat = b.team === 'p' ? this.landMatP : this.landMatE;
      lm.material = mat;
      mat.opacity = b.team === 'p' ? 0.22 * pulse + 0.08 : 0.3 * pulse + 0.12;
    }
  }

  update(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.position.y += 6 * dt;
      p.sprite.scale.setScalar(p.baseScale * (1 + (1 - k) * 1.6));
      p.sprite.material.opacity = 0.6 * k;
    }
    for (let i = this.splinters.length - 1; i >= 0; i--) {
      const s = this.splinters[i];
      s.life -= dt;
      if (s.life <= 0 || s.mesh.position.y < 2) {
        this.scene.remove(s.mesh); // geo/mats are shared — never disposed
        this.splinters.splice(i, 1);
        continue;
      }
      s.vy -= 220 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += s.rx * dt;
      s.mesh.rotation.z += s.rz * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const k = r.life / r.max;
      const scale = 1 + ((1 - k) * r.grow) / r.baseR;
      r.mesh.scale.setScalar(scale);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.4 * k;
    }
  }

  clearTransient(): void {
    for (const p of this.puffs) {
      this.scene.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.puffs = [];
    for (const r of this.rings) {
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
    this.rings = [];
    for (const s of this.splinters) this.scene.remove(s.mesh);
    this.splinters = [];
    for (const m of [...this.ballMeshes, ...this.shadowMeshes, ...this.landMeshes]) {
      this.scene.remove(m);
    }
    this.ballMeshes = [];
    this.shadowMeshes = [];
    this.landMeshes = [];
  }
}
