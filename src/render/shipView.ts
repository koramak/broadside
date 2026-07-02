// Ship visuals: Kenney Pirate Kit hulls with articulated sails/flags,
// damage-driven material wear, sinking animation, strike flag, helm ring.
// Falls back to simple placeholder geometry if a model is missing.

import * as THREE from 'three';
import type { Ship } from '../sim/types';
import { SAILS } from '../sim/constants';
import { clamp } from '../sim/math';
import { ModelLibrary, shipModelName } from './models';
import { buildDioramaShip } from './dioramaShip';

const TEAM_TRIM = { p: 0xd9a441, e: 0xc4583a } as const;

/** FEEL (2026-06-12): miniatures read too small from the oblique camera —
 *  all ship visuals are drawn at twice sim scale. Sim lengths are untouched;
 *  gameplay distances, arcs and collisions are exactly as before. */
export const SHIP_VISUAL_SCALE = 2;

export class ShipView {
  group = new THREE.Group();
  private isDiorama = false;
  private sails: THREE.Object3D[] = [];
  private hullMats: THREE.MeshStandardMaterial[] = [];
  private sailMats: THREE.MeshStandardMaterial[] = [];
  private baseHullColors: THREE.Color[] = [];
  private baseSailColors: THREE.Color[] = [];
  private strikeFlag: THREE.Mesh;
  private selRing: THREE.Mesh;
  private listDir: number;

  constructor(public ship: Ship, lib: ModelLibrary, modelOverride?: string) {
    // Sloops wear the hand-carved diorama hull (the Broadside Ship 3D design);
    // brigs, frigates, ghosts and wrecks still sail the Kenney kit for now.
    if (!modelOverride && !ship.ghost && ship.cls === 'sloop') {
      this.isDiorama = true;
      this.buildDiorama();
    } else {
      const name = modelOverride ?? (ship.ghost ? 'ship-ghost' : shipModelName(ship.cls, ship.team, ship.faction));
      const model = lib.instantiateShip(name, ship.len * 1.06 * SHIP_VISUAL_SCALE);
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

      // the edge-of-map horrors are built of the wrong materials — the locked
      // art language made literal: whale ivory, bottle glass, black pearl
      const MONSTER_SKIN: Record<string, { color: number; emissive: number; opacity: number }> = {
        scrimshander: { color: 0xe9e6da, emissive: 0x2c2a22, opacity: 1 },
        greenglass: { color: 0x8fbf9f, emissive: 0x123528, opacity: 0.55 },
        nacre: { color: 0x342d45, emissive: 0x32204a, opacity: 1 },
      };
      const skin = ship.monster ? MONSTER_SKIN[ship.monster] : undefined;
      if (skin) {
        const tint = new THREE.Color(skin.color);
        model.root.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            const m = o.material as THREE.MeshStandardMaterial;
            m.color.lerp(tint, 0.92);
            if (m.emissive) m.emissive.setHex(skin.emissive);
            if (skin.opacity < 1) {
              m.transparent = true;
              m.opacity = skin.opacity;
            }
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
    }

    // strike flag (white) above the deck when she surrenders
    this.strikeFlag = new THREE.Mesh(
      new THREE.PlaneGeometry(11 * SHIP_VISUAL_SCALE, 7 * SHIP_VISUAL_SCALE),
      new THREE.MeshBasicMaterial({ color: 0xe9dcbe, side: THREE.DoubleSide }),
    );
    this.strikeFlag.position.set(0, ship.len * 0.72 * SHIP_VISUAL_SCALE, 0);
    this.strikeFlag.visible = false;
    this.group.add(this.strikeFlag);

    // allegiance ring — the one color language of the whole game:
    // GOLD ring = yours (bright when you hold her helm), RUST ring = enemy
    const ringR = ship.len * 0.62 * SHIP_VISUAL_SCALE;
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(ringR, ringR + 6, 40),
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

  /** Build the procedural carved-wood sloop and fit it to this ship's scale. */
  private buildDiorama(): void {
    const ship = this.ship;
    const d = buildDioramaShip();
    const inner = d.root;
    inner.rotation.y = Math.PI / 2;            // design bow is +Z; the sim wants the bow at +X
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // FEEL: the long bowsprit + boom overhang inflate the bounding box, so
    // normalizing by it shrinks the hull vs the Kenney kit — and the carved ship
    // is meant to read as the hero. Draw her 1.5× the kit's target length.
    const DIORAMA_SCALE = 1.5;
    const target = ship.len * 1.06 * SHIP_VISUAL_SCALE * DIORAMA_SCALE;
    inner.position.x = -c.x;                    // centre fore-aft and athwartships...
    inner.position.z = -c.z;
    // ...but KEEP the authored waterline (y=0) at sea level so the keel stays
    // below the surface, hidden by the sea plane, instead of floating on top.
    const wrapper = new THREE.Group();
    wrapper.add(inner);
    wrapper.scale.setScalar(target / Math.max(size.x, size.z));
    this.group.add(wrapper);

    for (const mat of d.hullMats) {
      this.hullMats.push(mat);
      this.baseHullColors.push(mat.color.clone());
    }
    for (const mat of d.sailMats) {
      mat.transparent = true;
      mat.side = THREE.DoubleSide;
      this.sailMats.push(mat);
      this.baseSailColors.push(mat.color.clone());
    }
    this.sails.push(...d.sails);
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
      // Kenney sails squash toward the yards when reefed; the diorama's carved
      // sails are built in place, so we just raise or furl them whole.
      if (!this.isDiorama) sail.scale.set(1, 0.45 + 0.55 * set, 1);
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
    // rings are for telling OTHER ships apart: dim gold = your consorts, rust =
    // enemy. The ship you're steering wears none — it's the one under the
    // camera, you always know which it is.
    this.selRing.visible = !controlled && s.sinking === 0 && !s.struck;
    (this.selRing.material as THREE.MeshBasicMaterial).opacity = s.team === 'p' ? 0.4 : 0.55;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // kit geometries are shared with the template — leave them; the diorama
        // builds unique geometry per ship, so free that too. Materials are
        // per-instance in both paths.
        if (this.isDiorama) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => m.dispose());
      }
    });
    this.strikeFlag.geometry.dispose();
    this.selRing.geometry.dispose();
  }
}
