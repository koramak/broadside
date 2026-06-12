// Placeholder ship meshes (Milestone 1): carved-wood-toned hull, dowel masts,
// cloth-plane sails. Swapped for Kenney Pirate Kit models in Milestone 2.

import * as THREE from 'three';
import type { Ship } from '../sim/types';
import { SAILS } from '../sim/constants';
import { clamp } from '../sim/math';

const TEAM_HULL = { p: 0x6b5238, e: 0x52403d } as const;
const TEAM_TRIM = { p: 0xd9a441, e: 0xc4583a } as const;

function hullGeometry(len: number, beam: number): THREE.BufferGeometry {
  // Pointed bow, squared stern — the prototype outline, extruded upward.
  const shape = new THREE.Shape();
  shape.moveTo(len * 0.5, 0);
  shape.quadraticCurveTo(len * 0.18, -beam * 0.55, -len * 0.42, -beam * 0.45);
  shape.lineTo(-len * 0.5, 0);
  shape.lineTo(-len * 0.42, beam * 0.45);
  shape.quadraticCurveTo(len * 0.18, beam * 0.55, len * 0.5, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 1.5, bevelSegments: 1 });
  // shape was drawn in XY; stand it flat on the water (XZ), deck up.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 12, 0);
  return geo;
}

export class ShipView {
  group = new THREE.Group();
  private hullMat: THREE.MeshLambertMaterial;
  private sailMats: THREE.MeshLambertMaterial[] = [];
  private sails: THREE.Mesh[] = [];
  private masts: THREE.Group[] = [];
  private strikeFlag: THREE.Mesh;
  private selRing: THREE.Mesh;
  private mastSnapApplied = 0;

  constructor(public ship: Ship) {
    const { len, beam } = ship;
    this.hullMat = new THREE.MeshLambertMaterial({ color: TEAM_HULL[ship.team] });
    const hull = new THREE.Mesh(hullGeometry(len, beam), this.hullMat);
    this.group.add(hull);

    // stern trim band (team color, like the prototype's stern block)
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(4, 5, beam * 0.8),
      new THREE.MeshLambertMaterial({ color: TEAM_TRIM[ship.team] }),
    );
    trim.position.set(-len * 0.5 + 1, 14, 0);
    this.group.add(trim);

    // masts + sails — frigates carry three, others two (prototype layout)
    const mastXs = ship.gunsMax >= 9 ? [len * 0.26, 0, -len * 0.26] : [len * 0.22, -len * 0.2];
    const mastH = len * 0.78;
    for (const mx of mastXs) {
      const mg = new THREE.Group();
      mg.position.set(mx, 12, 0);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.8, mastH, 6),
        new THREE.MeshLambertMaterial({ color: 0x3a2c1e }),
      );
      pole.position.y = mastH / 2;
      mg.add(pole);

      const sailMat = new THREE.MeshLambertMaterial({
        color: 0xe9dcbe,
        side: THREE.DoubleSide,
        transparent: true,
      });
      this.sailMats.push(sailMat);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sailMat);
      // sail plane faces fore-aft, with the prototype's slight brace angle so
      // it never goes perfectly edge-on to the camera
      sail.rotation.y = Math.PI / 2 + 0.34;
      sail.position.y = mastH * 0.55;
      mg.add(sail);
      this.sails.push(sail);
      this.masts.push(mg);
      this.group.add(mg);
    }

    // strike flag (white) — shown when she surrenders
    this.strikeFlag = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 7),
      new THREE.MeshBasicMaterial({ color: 0xe9dcbe, side: THREE.DoubleSide }),
    );
    this.strikeFlag.position.set(mastXs[0], 12 + mastH + 6, 0);
    this.strikeFlag.visible = false;
    this.group.add(this.strikeFlag);

    // gold ring under the ship you steer
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(len * 0.62, len * 0.62 + 3, 36),
      new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.position.y = 2;
    this.group.add(this.selRing);
  }

  update(controlled: boolean): void {
    const s = this.ship;
    this.group.position.set(s.x, 0, s.y);
    this.group.rotation.y = -s.heading;

    // sinking: settle, list, slip under
    if (s.sinking > 0) {
      const k = clamp(s.sinking / 3.5, 0, 1);
      this.group.position.y = -k * 26;
      this.group.rotation.z = k * 0.5;
      this.group.rotation.x = k * 0.16;
    }
    this.group.visible = !s.dead;

    // sail setting + health drive sail size and tone
    const set = SAILS[s.sailIdx];
    const shp = s.sailHP / 100;
    const w = s.beam * 1.9 * (0.25 + 0.75 * set);
    const h = s.len * 0.5 * (0.35 + 0.65 * set);
    for (let i = 0; i < this.sails.length; i++) {
      const sail = this.sails[i];
      sail.scale.set(Math.max(w, 0.01), Math.max(h * (0.6 + 0.4 * shp), 0.01), 1);
      sail.visible = set > 0 && s.sinking === 0;
      const m = this.sailMats[i];
      m.opacity = 0.55 + 0.4 * shp;
      const tone = 0.62 + 0.38 * shp;
      m.color.setRGB(0.91 * tone, 0.86 * tone, 0.75 * tone);
    }

    // mast damage: stage 1 shortens topmasts, stage 2 snaps the foremast over
    if (s.mastStage !== this.mastSnapApplied) {
      this.mastSnapApplied = s.mastStage;
      if (s.mastStage >= 1) for (const mg of this.masts) mg.scale.y = 0.82;
      if (s.mastStage >= 2 && this.masts[0]) {
        this.masts[0].rotation.z = 1.15;
        this.masts[0].scale.y = 0.6;
      }
    }

    this.strikeFlag.visible = s.struck && !s.dead;
    this.hullMat.opacity = 1;
    this.hullMat.transparent = false;
    if (s.struck) {
      this.hullMat.transparent = true;
      this.hullMat.opacity = 0.7;
    }
    this.selRing.visible = controlled && s.sinking === 0;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }
}
