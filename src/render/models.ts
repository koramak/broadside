// Loads Kenney Pirate Kit GLBs once, then stamps out per-ship instances with
// cloned materials (so each hull can chip and darken independently).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const KIT = 'assets/pirate-kit/';

export interface ShipModel {
  root: THREE.Group;
  /** length of the model along its bow axis after normalization, pre-scale */
  length: number;
  sails: THREE.Mesh[];
  flags: THREE.Mesh[];
  hullMeshes: THREE.Mesh[];
}

export class ModelLibrary {
  private templates = new Map<string, THREE.Group>();

  async preload(names: string[]): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      names.map(
        (n) =>
          new Promise<void>((resolve, reject) => {
            loader.load(
              KIT + n + '.glb',
              (gltf) => {
                this.templates.set(n, gltf.scene);
                resolve();
              },
              undefined,
              (err) => reject(new Error('failed to load ' + n + ': ' + err)),
            );
          }),
      ),
    );
  }

  has(name: string): boolean {
    return this.templates.has(name);
  }

  /**
   * Clone a ship template, rotate it so the bow points +X (sim convention),
   * scale it so its length matches `targetLen`, and collect named parts.
   */
  instantiateShip(name: string, targetLen: number): ShipModel {
    const tpl = this.templates.get(name);
    if (!tpl) throw new Error('model not loaded: ' + name);
    const root = tpl.clone(true);

    // Kenney ships are modeled along Z; spin the bow onto +X.
    const pre = new THREE.Box3().setFromObject(root);
    const size = pre.getSize(new THREE.Vector3());
    if (size.z > size.x) root.rotation.y = Math.PI / 2;

    // normalize: feet on y=0, centered on x/z
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const length = Math.max(sz.x, sz.z);
    const s = targetLen / length;
    const wrapper = new THREE.Group();
    root.position.set(-c.x, -box.min.y, -c.z);
    wrapper.add(root);
    wrapper.scale.setScalar(s);

    const sails: THREE.Mesh[] = [];
    const flags: THREE.Mesh[] = [];
    const hullMeshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.material = (o.material as THREE.Material).clone();
      const n = o.name.toLowerCase();
      if (n.startsWith('sail')) sails.push(o);
      else if (n.startsWith('flag')) flags.push(o);
      else hullMeshes.push(o);
    });

    const g = new THREE.Group();
    g.add(wrapper);
    return { root: g, length, sails, flags, hullMeshes };
  }

  /** Clone a prop (rock, palm, …) scaled uniformly. */
  instantiateProp(name: string, scale: number): THREE.Group {
    const tpl = this.templates.get(name);
    if (!tpl) throw new Error('model not loaded: ' + name);
    const root = tpl.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    root.position.y = -box.min.y;
    const g = new THREE.Group();
    g.add(root);
    g.scale.setScalar(scale);
    return g;
  }
}

export const SHIP_MODEL_NAMES = [
  'ship-small', 'ship-medium', 'ship-large',
  'ship-pirate-small', 'ship-pirate-medium', 'ship-pirate-large',
  'ship-ghost', 'ship-wreck',
];

export const PROP_MODEL_NAMES = [
  'rocks-a', 'rocks-b', 'rocks-c', 'palm-bend', 'palm-straight',
  'tower-complete-small', 'structure-platform-dock', 'barrel', 'crate', 'chest',
];

/** sim class + team → kit model. Player sails the black flags. */
export function shipModelName(cls: string, team: string): string {
  const size = cls === 'sloop' ? 'small' : cls === 'brig' ? 'medium' : 'large';
  return team === 'p' ? `ship-pirate-${size}` : `ship-${size}`;
}
