// Renders the sea map: islands built from kit rocks/palms, ports with docks
// and towers, the story marker, contact ships, salvage crates, and the Mist.

import * as THREE from 'three';
import type { World } from '../sim/world';
import { ISLANDS, PORTS, WORLD } from '../sim/worldgen';
import { currentObjective, objectivePos } from '../sim/objectives';
import type { RunState } from '../sim/types';
import { ShipView } from './shipView';
import { ModelLibrary } from './models';
import { TAU } from '../sim/math';

export class WorldView {
  group = new THREE.Group();
  private contactViews = new Map<number, ShipView>();
  private crateMeshes = new Map<number, THREE.Group>();
  private marker: THREE.Group;
  private markerRing: THREE.Mesh;
  private mist: THREE.Mesh;
  private mistMat: THREE.MeshBasicMaterial;

  constructor(private scene: THREE.Scene, private lib: ModelLibrary) {
    scene.add(this.group);

    // islands: sand footprint + rocks + palms
    const sandMat = new THREE.MeshLambertMaterial({ color: 0xc9b380 });
    const rockNames = ['rocks-a', 'rocks-b', 'rocks-c'];
    ISLANDS.forEach((isl, idx) => {
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r * 1.18, 16, 22), sandMat);
      sand.position.set(isl.x, 2, isl.y);
      this.group.add(sand);
      // deterministic scatter from the island index
      const h = (n: number) => {
        const x = Math.sin(idx * 37.7 + n * 91.3) * 43758.5453;
        return x - Math.floor(x);
      };
      const nRocks = 3 + Math.floor(h(1) * 3);
      for (let i = 0; i < nRocks; i++) {
        const a = h(i + 2) * TAU;
        const rr = isl.r * (0.15 + 0.55 * h(i + 9));
        const rock = lib.instantiateProp(rockNames[(idx + i) % 3], isl.r * (0.16 + h(i + 20) * 0.1));
        rock.position.set(isl.x + Math.cos(a) * rr, 8, isl.y + Math.sin(a) * rr);
        rock.rotation.y = h(i + 30) * TAU;
        this.group.add(rock);
      }
      if (isl.palms) {
        const nPalms = 2 + Math.floor(h(40) * 3);
        for (let i = 0; i < nPalms; i++) {
          const a = h(i + 50) * TAU;
          const rr = isl.r * (0.2 + 0.5 * h(i + 60));
          const palm = lib.instantiateProp(h(i + 70) > 0.5 ? 'palm-bend' : 'palm-straight', 22);
          palm.position.set(isl.x + Math.cos(a) * rr, 10, isl.y + Math.sin(a) * rr);
          palm.rotation.y = h(i + 80) * TAU;
          this.group.add(palm);
        }
      }
    });

    // ports: dock + tower + a crate or two
    for (const port of PORTS) {
      const dock = lib.instantiateProp('structure-platform-dock', 30);
      dock.position.set(port.x, 4, port.y);
      dock.rotation.y = Math.atan2(port.y - ISLANDS[port.islandIdx].y, port.x - ISLANDS[port.islandIdx].x);
      this.group.add(dock);
      const tower = lib.instantiateProp('tower-complete-small', 26);
      tower.position.set(port.x * 0.97 + ISLANDS[port.islandIdx].x * 0.03, 10, port.y * 0.97 + ISLANDS[port.islandIdx].y * 0.03);
      this.group.add(tower);
      const crate = lib.instantiateProp('crate', 14);
      crate.position.set(port.x + 40, 6, port.y + 26);
      this.group.add(crate);
    }

    // story marker: gold ring + pennant
    this.marker = new THREE.Group();
    this.markerRing = new THREE.Mesh(
      new THREE.RingGeometry(120, 132, 48),
      new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    this.markerRing.rotation.x = -Math.PI / 2;
    this.markerRing.position.y = 6;
    this.marker.add(this.markerRing);
    const pennant = lib.instantiateProp('flag-high-pennant', 30);
    pennant.position.y = 4;
    this.marker.add(pennant);
    this.group.add(this.marker);

    // the Mist: a tall pale wall along x = mistX
    this.mistMat = new THREE.MeshBasicMaterial({
      color: 0xb8c8c8,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mist = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.height * 1.4, 900), this.mistMat);
    this.mist.rotation.y = Math.PI / 2;
    this.mist.position.set(WORLD.mistX + 420, 360, 0);
    this.group.add(this.mist);
  }

  update(world: World, run: RunState, time: number): void {
    // gold marker follows the current objective — a fight mark or a port call
    const obj = currentObjective(run);
    if (obj) {
      const m = objectivePos(obj);
      this.marker.visible = true;
      this.marker.position.set(m.x, 0, m.y);
      const pulse = 1 + Math.sin(time * 2.4) * 0.06;
      this.markerRing.scale.setScalar(pulse);
      (this.markerRing.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(time * 2.4);
    } else {
      this.marker.visible = false;
    }

    // once the Plate Ship falls, the wall thins to a suggestion
    const mistOpen = run.battle > 6;
    this.mistMat.opacity = mistOpen
      ? 0.08 + 0.03 * Math.sin(time * 0.7)
      : 0.26 + 0.08 * Math.sin(time * 0.7);

    // contacts
    const seen = new Set<number>();
    for (const c of world.contacts) {
      if (c.gone) continue;
      seen.add(c.id);
      let v = this.contactViews.get(c.id);
      if (!v) {
        v = new ShipView(c.ship, this.lib);
        this.scene.add(v.group);
        this.contactViews.set(c.id, v);
      }
      v.update(false, time);
    }
    for (const [id, v] of this.contactViews) {
      if (!seen.has(id)) {
        v.dispose(this.scene);
        this.contactViews.delete(id);
      }
    }

    // crates bob on the swell
    const seenCrates = new Set<number>();
    for (const cr of world.crates) {
      if (cr.taken) continue;
      seenCrates.add(cr.id);
      let m = this.crateMeshes.get(cr.id);
      if (!m) {
        m = this.lib.instantiateProp('crate', 9);
        this.scene.add(m);
        this.crateMeshes.set(cr.id, m);
      }
      m.position.set(cr.x, 1 + Math.sin(time * 1.7 + cr.id) * 1.6, cr.y);
      m.rotation.y = time * 0.3 + cr.id;
    }
    for (const [id, m] of this.crateMeshes) {
      if (!seenCrates.has(id)) {
        this.scene.remove(m);
        this.crateMeshes.delete(id);
      }
    }

  }

  setVisible(v: boolean): void {
    this.group.visible = v;
    for (const [, view] of this.contactViews) view.group.visible = v;
    for (const [, m] of this.crateMeshes) m.visible = v;
  }

  /** Drop all dynamic views (battle handoff keeps the static world). */
  clearDynamic(): void {
    for (const [, v] of this.contactViews) v.dispose(this.scene);
    this.contactViews.clear();
    for (const [, m] of this.crateMeshes) this.scene.remove(m);
    this.crateMeshes.clear();
  }
}
