// Three.js scene shell: renderer, oblique Pirates!-style camera with smoothed
// follow, low-poly "sculpted resin" sea, arena boundary, wind streaks.
// This layer only READS sim state.

import * as THREE from 'three';
import { ARENA_R } from '../sim/constants';
import { TAU } from '../sim/math';

// Camera: ~55° from horizontal, slight perspective, gentle follow.
const CAM_ELEV = (55 * Math.PI) / 180;
const CAM_DIST = 1150;
const CAM_FOV = 42;

const SEA_SIZE = 4600;
const SEA_SEGS = 92;

export class SceneShell {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private camTarget = new THREE.Vector3();
  private seaGeo: THREE.PlaneGeometry;
  private sea: THREE.Mesh;
  private seaTime = { value: 0 };
  private seaCenter = { value: new THREE.Vector2() };
  private streakGeo: THREE.BufferGeometry;
  private streaks: { x: number; y: number; p: number }[] = [];
  private streakPos: Float32Array;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c2530);
    this.scene.fog = new THREE.Fog(0x0c2530, CAM_DIST * 1.1, CAM_DIST * 3.4);

    this.camera = new THREE.PerspectiveCamera(CAM_FOV, innerWidth / innerHeight, 10, CAM_DIST * 5);

    // Lighting: warm lamp-over-the-diorama sun + cool sea bounce.
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
    sun.position.set(-600, 900, -400);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd8d2, 0x12333d, 0.85));

    // Sea: low-poly plane displaced in the vertex shader (GPU — no CPU cost),
    // flat shaded so the swells read as carved facets. Follows the camera.
    this.seaGeo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGS, SEA_SEGS);
    this.seaGeo.rotateX(-Math.PI / 2);
    const seaMat = new THREE.MeshPhongMaterial({
      color: 0x14424e,
      emissive: 0x06181f,
      specular: 0x2c5a60,
      shininess: 42,
      flatShading: true,
    });
    seaMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.seaTime;
      shader.uniforms.uCenter = this.seaCenter;
      shader.vertexShader =
        'uniform float uTime;\nuniform vec2 uCenter;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float wx = transformed.x + uCenter.x;
            float wz = transformed.z + uCenter.y;
            float t = uTime * 0.6;
            float a = sin(wx * 0.011 + t) + sin(wz * 0.013 + t * 0.83);
            float b = sin((wx + wz) * 0.0061 + t * 0.52);
            transformed.y += (abs(a) - 1.0) * 5.2 + b * 3.4;
          }`,
        );
    };
    this.sea = new THREE.Mesh(this.seaGeo, seaMat);
    this.scene.add(this.sea);

    // Arena boundary: dashed rust circle floating just above the water.
    const ringPts: THREE.Vector3[] = [];
    const SEGS = 180;
    for (let i = 0; i <= SEGS; i++) {
      const a = (i / SEGS) * TAU;
      ringPts.push(new THREE.Vector3(Math.cos(a) * ARENA_R, 14, Math.sin(a) * ARENA_R));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    const ring = new THREE.Line(
      ringGeo,
      new THREE.LineDashedMaterial({ color: 0xc4583a, dashSize: 42, gapSize: 54, transparent: true, opacity: 0.55 }),
    );
    ring.computeLineDistances();
    this.scene.add(ring);

    // Wind streaks: drifting line segments that show the wind at a glance.
    for (let i = 0; i < 70; i++) {
      this.streaks.push({
        x: (Math.random() * 2 - 1) * ARENA_R,
        y: (Math.random() * 2 - 1) * ARENA_R,
        p: Math.random(),
      });
    }
    this.streakPos = new Float32Array(70 * 2 * 3);
    this.streakGeo = new THREE.BufferGeometry();
    this.streakGeo.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    const streakMat = new THREE.LineBasicMaterial({ color: 0xe9dcbe, transparent: true, opacity: 0.28 });
    this.scene.add(new THREE.LineSegments(this.streakGeo, streakMat));

    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  /** Smoothly follow a sim-space point (sim x,y → world x,z). */
  follow(x: number, y: number, dt: number): void {
    const k = 1 - Math.exp(-dt * 3.2);
    this.camTarget.x += (x - this.camTarget.x) * k;
    this.camTarget.z += (y - this.camTarget.z) * k;
    const back = CAM_DIST * Math.cos(CAM_ELEV);
    const up = CAM_DIST * Math.sin(CAM_ELEV);
    this.camera.position.set(this.camTarget.x, up, this.camTarget.z + back);
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z);
  }

  /** Animate swells + drift wind streaks. */
  updateEnvironment(time: number, windDir: number, paused: boolean): void {
    // Snap the sea to a grid so vertices don't swim as it follows the camera.
    const cell = SEA_SIZE / SEA_SEGS;
    const cx = Math.round(this.camTarget.x / cell) * cell;
    const cz = Math.round(this.camTarget.z / cell) * cell;
    this.sea.position.set(cx, 0, cz);
    this.seaCenter.value.set(cx, cz);
    this.seaTime.value = time;

    // Streaks
    const wdx = Math.cos(windDir);
    const wdy = Math.sin(windDir);
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      if (!paused) {
        s.x += wdx * 0.6;
        s.y += wdy * 0.6;
        s.p += 0.004;
        if (s.p > 1) s.p = 0;
      }
      // keep streaks near the camera target
      const range = 1400;
      if (s.x < this.camTarget.x - range) s.x += range * 2;
      if (s.x > this.camTarget.x + range) s.x -= range * 2;
      if (s.y < this.camTarget.z - range) s.y += range * 2;
      if (s.y > this.camTarget.z + range) s.y -= range * 2;
      const len = 22 * Math.sin(s.p * Math.PI);
      const o = i * 6;
      this.streakPos[o] = s.x;
      this.streakPos[o + 1] = 6;
      this.streakPos[o + 2] = s.y;
      this.streakPos[o + 3] = s.x + wdx * len;
      this.streakPos[o + 4] = 6;
      this.streakPos[o + 5] = s.y + wdy * len;
    }
    this.streakGeo.attributes.position.needsUpdate = true;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
