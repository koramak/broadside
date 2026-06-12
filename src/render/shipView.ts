// Ship visuals: Kenney Pirate Kit hulls with articulated sails/flags,
// damage-driven material wear, sinking animation, strike flag, helm ring.
// Falls back to simple placeholder geometry if a model is missing.

import * as THREE from 'three';
import type { Ship } from '../sim/types';
import { SAILS } from '../sim/constants';
import { clamp } from '../sim/math';
import { ModelLibrary, shipModelName } from './models';

const TEAM_TRIM = { p: 0xd9a441, e: 0xc4583a } as const;

export class ShipView {
  group = new THREE.Group();
  private sails: THREE.Mesh[] = [];
  private hullMats: THREE.MeshStandardMaterial[] = [];
  private sailMats: THREE.MeshStandardMaterial[] = [];
  private baseHullColors: THREE.Color[] = [];
  private baseSailColors: THREE.Color[] = [];
  private strikeFlag: THREE.Mesh;
  private selRing: THREE.Mesh;
  private listDir: number;

  constructor(public ship: Ship, lib: ModelLibrary, modelOverride?: string) {
    const name = modelOverride ?? (ship.ghost ? 'ship-ghost' : shipModelName(ship.cls, ship.team, ship.faction));
    const model = lib.instantiateShip(name, ship.len * 1.06);
    this.group.add(model.root);

    if (ship.ghost) {
      // pale, half-there, lit from somewhere that isn't the sun
      model.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = o.material as THREE.MeshStandardMaterial;
          m.transparent = true;
          m.opacity = 0.78;
          if (m.emissive) m.emissive.setHex(0x1d3a35);
        }
      });
    }

    for (const m of model.hullMeshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      this.hullMats.push(mat);
      this.baseHullColors.push(mat.color.clone());
    }
    for (const m of model.sails) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.side = THREE.DoubleSide;
      this.sailMats.push(mat);
      this.baseSailColors.push(mat.color.clone());
      this.sails.push(m);
    }

    // strike flag (white) above the deck when she surrenders
    this.strikeFlag = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 7),
      new THREE.MeshBasicMaterial({ color: 0xe9dcbe, side: THREE.DoubleSide }),
    );
    this.strikeFlag.position.set(0, ship.len * 0.72, 0);
    this.strikeFlag.visible = false;
    this.group.add(this.strikeFlag);

    // ring under the ship you steer (gold) / subtle rust ring for enemies
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(ship.len * 0.62, ship.len * 0.62 + 3, 36),
      new THREE.MeshBasicMaterial({
        color: TEAM_TRIM[ship.team],
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      }),
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.position.y = 2.5;
    this.group.add(this.selRing);

    // ships list to a consistent random-looking side while sinking
    this.listDir = (ship.x * 7 + ship.y * 13) % 2 === 0 ? 1 : -1;
  }

  update(controlled: boolean, time: number): void {
    const s = this.ship;
    this.group.position.set(s.x, 0, s.y);
    this.group.rotation.set(0, -s.heading, 0);

    // gentle bob/roll so the miniatures feel afloat
    if (s.sinking === 0 && !s.dead) {
      const ph = s.x * 0.13 + s.y * 0.17;
      this.group.position.y = Math.sin(time * 1.3 + ph) * 1.1;
      this.group.rotation.z = Math.sin(time * 0.9 + ph) * 0.022;
      this.group.rotation.x = Math.cos(time * 1.1 + ph) * 0.014;
    }

    // sinking: settle, list, slip under
    if (s.sinking > 0) {
      const k = clamp(s.sinking / 3.5, 0, 1);
      this.group.position.y = -k * k * 30;
      this.group.rotation.z = k * 0.55 * this.listDir;
      this.group.rotation.x = k * 0.18;
    }
    this.group.visible = !s.dead;

    // sail setting: furled hides canvas, half scales it down toward the yards
    const set = SAILS[s.sailIdx];
    const shp = s.sailHP / 100;
    for (const sail of this.sails) {
      sail.visible = set > 0;
      const squash = 0.45 + 0.55 * set;
      sail.scale.set(1, squash, 1);
    }
    for (let i = 0; i < this.sailMats.length; i++) {
      const m = this.sailMats[i];
      // canvas yellows, thins, and tatters as it takes chain shot
      m.opacity = 0.62 + 0.38 * shp;
      const base = this.baseSailColors[i];
      const wear = 0.55 + 0.45 * shp;
      m.color.setRGB(base.r * (0.85 + 0.15 * wear), base.g * wear, base.b * (wear * 0.92 + 0.08));
    }

    // hull chips and darkens with damage — paint scraped off the miniature
    // (ghosts skip this; they are already as ruined as they intend to be)
    if (!s.ghost) {
      const hullK = 0.45 + 0.55 * (s.hull / s.maxHull);
      for (let i = 0; i < this.hullMats.length; i++) {
        const base = this.baseHullColors[i];
        this.hullMats[i].color.setRGB(base.r * hullK, base.g * hullK, base.b * hullK);
      }
    }

    this.strikeFlag.visible = s.struck && !s.dead;
    if (this.strikeFlag.visible) this.strikeFlag.rotation.y = time * 0.7;
    this.selRing.visible = (controlled || s.team === 'e') && s.sinking === 0 && !s.struck;
    (this.selRing.material as THREE.MeshBasicMaterial).opacity = controlled ? 0.5 : 0.16;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // geometries of kit models are shared with the template — leave them;
        // materials were cloned per instance, so free those
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => m.dispose());
      }
    });
    this.strikeFlag.geometry.dispose();
    this.selRing.geometry.dispose();
  }
}
