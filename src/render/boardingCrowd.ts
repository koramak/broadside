// The boarding melee crowd: a shoving front of miniature crewmen at the rail
// seam between the two lashed hulls — gold sashes (yours) against rust (theirs).
// Reads the boarding sim (front drift + hand counts) and the two ship poses;
// purely presentation, so per-figure jitter may use Math.random (render only).

import * as THREE from 'three';
import type { Ship } from '../sim/types';
import type { BoardingState } from '../sim/boarding';
import { SHIP_VISUAL_SCALE } from './shipView';

const CAP = 32; // figures per side
const TEAM_GOLD = 0xd9a441;
const TEAM_RUST = 0xc4583a;

/** Stable per-figure offsets so the crowd jostles in place instead of teleporting. */
interface Jitter {
  along: number; // -1..1 fraction along the rail
  cross: number; // 0..1 fraction across its side of the front
  phase: number; // bob phase
  spin: number; // facing
}

export class BoardingCrowd {
  private gold: THREE.InstancedMesh;
  private rust: THREE.InstancedMesh;
  private goldJit: Jitter[] = [];
  private rustJit: Jitter[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    // a little carved-wood pawn: a tapered peg (a head would cost a merge import)
    const geo = new THREE.CylinderGeometry(1.4, 2.4, 12, 6);
    geo.translate(0, 6, 0); // base at y=0
    const mk = (color: number): THREE.InstancedMesh => {
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.8, metalness: 0.05, emissive: color, emissiveIntensity: 0.22,
      });
      const im = new THREE.InstancedMesh(geo, mat, CAP);
      im.frustumCulled = false;
      im.visible = false;
      im.count = 0;
      scene.add(im);
      return im;
    };
    this.gold = mk(TEAM_GOLD);
    this.rust = mk(TEAM_RUST);
    for (let i = 0; i < CAP; i++) {
      this.goldJit.push(this.mkJit());
      this.rustJit.push(this.mkJit());
    }
  }

  private mkJit(): Jitter {
    return {
      along: Math.random() * 2 - 1,
      cross: Math.random(),
      phase: Math.random() * Math.PI * 2,
      spin: Math.random() * Math.PI * 2,
    };
  }

  hide(): void {
    this.gold.visible = false;
    this.rust.visible = false;
    this.gold.count = 0;
    this.rust.count = 0;
  }

  /** Place the two crowds along the seam, split by the front. */
  update(me: Ship, foe: Ship, board: BoardingState, time: number): void {
    this.gold.visible = true;
    this.rust.visible = true;

    const h = me.heading;
    const ax = Math.cos(h);
    const az = Math.sin(h);
    const px = Math.cos(h + Math.PI / 2);
    const pz = Math.sin(h + Math.PI / 2);
    // midline between the lashed hulls
    const mx = (me.x + foe.x) / 2;
    const mz = (me.y + foe.y) / 2;
    // engaged rail length, and the contested band across it
    const halfLen = Math.min(me.len, foe.len) * SHIP_VISUAL_SCALE * 0.42;
    const crossHalf = (me.beam + foe.beam) * 0.5 * SHIP_VISUAL_SCALE * 0.5;
    // the front: -1 your deck, +1 theirs → the gold/rust boundary slides across
    const boundary = Math.max(-0.85, Math.min(0.85, board.front)) * crossHalf;

    const nGold = Math.max(4, Math.min(CAP, Math.round(board.myHands / 5)));
    const nRust = Math.max(4, Math.min(CAP, Math.round(board.theirHands / 5)));

    this.fill(this.gold, this.goldJit, nGold, mx, mz, ax, az, px, pz, halfLen, -crossHalf, boundary, time);
    this.fill(this.rust, this.rustJit, nRust, mx, mz, ax, az, px, pz, halfLen, boundary, crossHalf, time);
  }

  private fill(
    im: THREE.InstancedMesh, jit: Jitter[], n: number,
    mx: number, mz: number, ax: number, az: number, px: number, pz: number,
    halfLen: number, crossA: number, crossB: number, time: number,
  ): void {
    im.count = n;
    for (let i = 0; i < n; i++) {
      const j = jit[i];
      const along = j.along * halfLen + Math.sin(time * 2 + j.phase) * 2.2;
      // figures crowd toward the front (the boundary side of their band)
      const cross = crossA + (crossB - crossA) * (0.25 + 0.7 * j.cross);
      const bob = Math.sin(time * 6 + j.phase) * 0.9;
      this.pos.set(
        mx + ax * along + px * cross,
        11 + bob, // standing on the deck, clear of the bulwarks
        mz + az * along + pz * cross,
      );
      this.q.setFromAxisAngle(this.up, j.spin + Math.sin(time * 3 + j.phase) * 0.3);
      this.scl.setScalar(0.9 + 0.2 * Math.sin(j.phase));
      this.m.compose(this.pos, this.q, this.scl);
      im.setMatrixAt(i, this.m);
    }
    im.instanceMatrix.needsUpdate = true;
  }
}
