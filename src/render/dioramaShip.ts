// "The diorama come to life" — a fully procedural carved-wood pirate ship,
// ported from the Broadside Ship 3D design (Claude Design, 2026-06-23). It is a
// single-masted topsail sloop: lofted hard-chine hull, planked deck, gaff
// mainsail + square topsail + headsails, and a deckful of miniature furniture.
//
// This module is PURE GEOMETRY. It owns no scene, camera, lights, controls, or
// animation — SceneShell already provides all of that. It returns a Group plus
// the material handles ShipView needs to drive damage/sail wear. Built around a
// y=0 waterline with the keel below it (hidden by the sea plane), bow at +Z.
//
// Adapted to ESM Three 0.170: the design's manual convertSRGBToLinear() calls
// are dropped — ColorManagement (on by default in r170) handles sRGB→linear, so
// these materials match the hand-authored hex colours elsewhere in the renderer.

import * as THREE from 'three';

export interface DioramaShip {
  root: THREE.Group;
  /** structural wood/paint materials — darken with hull damage */
  hullMats: THREE.MeshStandardMaterial[];
  /** canvas materials — yellow, thin and tatter with sail damage */
  sailMats: THREE.MeshStandardMaterial[];
  /** sail groups — hidden when the ship furls */
  sails: THREE.Object3D[];
}

export function buildDioramaShip(opts: { hullColor?: string; sailColor?: string } = {}): DioramaShip {
  const ship = new THREE.Group();

  const col = (c: string) => new THREE.Color(c);
  const std = (c: string, r: number, o?: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial(Object.assign({ color: col(c), roughness: r, metalness: 0 }, o || {}));
  const M = {
    hull: new THREE.MeshStandardMaterial({ color: col(opts.hullColor || '#15140f'), roughness: 0.84, metalness: 0, flatShading: true }),
    bottom: new THREE.MeshStandardMaterial({ color: col('#1f3d2c'), roughness: 0.8, metalness: 0, flatShading: true, side: THREE.DoubleSide }),
    hullLo: std('#14110b', 0.86),
    wale: std('#0e0b07', 0.6, { flatShading: true }),
    gilt: new THREE.MeshStandardMaterial({ color: col('#c49a44'), roughness: 0.5, metalness: 0.45 }),
    deck: std('#946c39', 0.84),
    deckDk: std('#5a3c20', 0.86),
    spar: std('#ab7c3a', 0.6),
    rope: std('#2a2118', 0.86),
    manila: std('#b09863', 0.9),
    // canvas carries a soft self-lit term so the cloth still reads as pale
    // canvas on its shadow side under the game's high-contrast battle lighting
    // (the design relied on ACES tone-mapping + a fill light we don't share).
    canvas: new THREE.MeshStandardMaterial({ color: col(opts.sailColor || '#f0e6cc'), roughness: 0.97, side: THREE.DoubleSide, flatShading: true, vertexColors: true, emissive: col('#d3c6a2'), emissiveIntensity: 0.5 }),
    canvas2: new THREE.MeshStandardMaterial({ color: col(opts.sailColor || '#e7dcbe'), roughness: 0.97, side: THREE.DoubleSide, flatShading: true, vertexColors: true, emissive: col('#c9bc99'), emissiveIntensity: 0.5 }),
    seam: new THREE.MeshStandardMaterial({ color: col('#c9bb95'), roughness: 0.95, side: THREE.DoubleSide }),
    boltrope: std('#8a7551', 0.92),
    brass: new THREE.MeshStandardMaterial({ color: col('#b98c3e'), roughness: 0.56, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: col('#142b29'), roughness: 0.2, metalness: 0.1, emissive: col('#1d4a44'), emissiveIntensity: 0.16 }),
    red: std('#8a2c1c', 0.85, { side: THREE.DoubleSide }),
    iron: std('#171511', 0.62, { metalness: 0.34 }),
    green: std('#244738', 0.74),
    white: std('#dad4c2', 0.84),
    brick: std('#9c4a36', 0.92),
  };

  // Hand-painted "drybrush" edge catch — a faint warm rim that lightens raised and grazing
  // edges, the way a modeller drybrushes highlights onto a scale model. View-dependent and
  // normal-based, so it needs no UVs and works on the carved hull too.
  const drybrush = (mat: THREE.MeshStandardMaterial, amt = 0.16, pow = 2.6, tint = '#f3ead2') => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.dbColor = { value: new THREE.Color(tint) };
      sh.uniforms.dbAmt = { value: amt };
      sh.uniforms.dbPow = { value: pow };
      sh.fragmentShader = 'uniform vec3 dbColor; uniform float dbAmt; uniform float dbPow;\n' + sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float dbF = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), dbPow);\n  totalEmissiveRadiance += dbColor * dbF * dbAmt;'
      );
    };
    mat.needsUpdate = true; return mat;
  };
  [M.hull, M.bottom, M.hullLo, M.wale, M.deck, M.deckDk, M.spar, M.manila, M.iron, M.green, M.white, M.brick, M.red].forEach((m) => drybrush(m));
  drybrush(M.gilt, 0.3, 2.1, '#ffe7a4');    // painted gilt catches more along its edges
  drybrush(M.brass, 0.24, 2.3, '#ffe7a4');

  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast?: boolean) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (cast !== false) m.castShadow = true; m.receiveShadow = true; ship.add(m); return m;
  };
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, rad?: number) => {
    const d = new THREE.Vector3().subVectors(b, a); const L = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, rad || 6), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); m.castShadow = true; ship.add(m); return m;
  };

  const hw = 0.84, len = 3.4;

  // ========================================================================
  // HULL — a lofted hard-chine carved wooden hull. Built from cross-section
  // ribs; the waterline (y=0) cuts at the chine so nothing below ever bulges
  // into view. Bow=+z, stern=-z.
  // ========================================================================
  M.hull.side = THREE.DoubleSide; M.wale.side = THREE.DoubleSide; M.gilt.side = THREE.DoubleSide;
  const deckY = 0.22;
  const NS = 46, RINGN = 17;
  const zBow = len * 1.02, zStern = -len * 0.98;
  const CPlerp = (cps: number[][], t: number) => { let i = 0; while (i < cps.length - 2 && t > cps[i + 1][0]) i++; const [t0, v0] = cps[i], [t1, v1] = cps[i + 1]; let k = (t - t0) / ((t1 - t0) || 1); k = Math.max(0, Math.min(1, k)); k = k * k * (3 - 2 * k); return v0 + (v1 - v0) * k; };
  const beamCP = [[0, 0.44], [0.12, 0.62], [0.4, 0.74], [0.62, 0.72], [0.82, 0.54], [0.93, 0.30], [1, 0.05]]; // half-beam
  const depthCP = [[0, 0.32], [0.16, 0.42], [0.5, 0.47], [0.78, 0.43], [0.92, 0.32], [1, 0.18]];            // keel depth below water
  const freeCP = [[0, 0.46], [0.22, 0.32], [0.5, 0.30], [0.74, 0.34], [1, 0.50]];                            // gunwale height above water (sheer)
  // section template (positive-x side, top->keelside): [acrossFactor, y]
  const secT = (B: number, D: number, F: number) => ([
    [1.00 * B, F],         // 0 gunwale
    [0.99 * B, F - 0.05],  // 1 gilt top
    [0.985 * B, F - 0.10], // 2 gilt bottom
    [0.975 * B, F - 0.18], // 3 upper plank
    [0.965 * B, 0.075],    // 4 wale top
    [0.95 * B, -0.01],     // 5 wale bottom (~waterline)
    [0.78 * B, -D * 0.5],  // 6 chine
    [0.18 * B, -D * 0.92], // 7 keel side
  ]);
  const hullPos: number[] = [], railP: THREE.Vector3[] = [], railS: THREE.Vector3[] = [];
  for (let s = 0; s <= NS; s++) {
    const t = s / NS, z = zStern + (zBow - zStern) * t;
    const B = CPlerp(beamCP, t), D = CPlerp(depthCP, t), F = CPlerp(freeCP, t);
    const sec = secT(B, D, F);
    for (let j = 0; j < sec.length; j++) hullPos.push(-sec[j][0], sec[j][1], z); // port top->keelside (k 0..7)
    hullPos.push(0, -D, z);                                                       // keel center (k 8)
    for (let j = sec.length - 1; j >= 0; j--) hullPos.push(sec[j][0], sec[j][1], z); // stbd keelside->top (k 9..16)
    railP.push(new THREE.Vector3(-sec[0][0], sec[0][1], z));
    railS.push(new THREE.Vector3(sec[0][0], sec[0][1], z));
  }
  const idxHull: number[] = [], idxWale: number[] = [], idxGilt: number[] = [], idxBottom: number[] = [];
  const vid = (s: number, k: number) => s * RINGN + k;
  const pickGrp = (k: number) => (k === 1 || k === 14) ? idxGilt : (k === 4 || k === 11) ? idxWale : (k >= 5 && k <= 10) ? idxBottom : idxHull;
  for (let s = 0; s < NS; s++) {
    for (let k = 0; k < RINGN - 1; k++) {
      const a = vid(s, k), b = vid(s + 1, k), c = vid(s + 1, k + 1), d = vid(s, k + 1);
      pickGrp(k).push(a, b, c, a, c, d);
    }
  }
  for (let k = 0; k < RINGN - 1; k++) ((k >= 5 && k <= 10) ? idxBottom : idxHull).push(vid(0, 8), vid(0, k + 1), vid(0, k));   // stern transom cap
  for (let k = 0; k < RINGN - 1; k++) ((k >= 5 && k <= 10) ? idxBottom : idxHull).push(vid(NS, 8), vid(NS, k), vid(NS, k + 1)); // bow cap
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(hullPos, 3));
  hg.setIndex([...idxHull, ...idxWale, ...idxGilt, ...idxBottom]);
  hg.addGroup(0, idxHull.length, 0);
  hg.addGroup(idxHull.length, idxWale.length, 1);
  hg.addGroup(idxHull.length + idxWale.length, idxGilt.length, 2);
  hg.addGroup(idxHull.length + idxWale.length + idxGilt.length, idxBottom.length, 3);
  hg.computeVertexNormals();
  const hullMesh = new THREE.Mesh(hg, [M.hull, M.wale, M.gilt, M.bottom]);
  hullMesh.castShadow = true; hullMesh.receiveShadow = true; ship.add(hullMesh);

  // cap rail + open stanchion rail above the bulwark
  for (const pts of [railP, railS]) {
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), NS, 0.028, 6, false);
    const rm = new THREE.Mesh(tg, M.deckDk); rm.castShadow = true; ship.add(rm);
    const topPts = pts.map((p) => new THREE.Vector3(p.x, p.y + 0.135, p.z));
    const tg2 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topPts), NS, 0.015, 6, false);
    const rm2 = new THREE.Mesh(tg2, M.deckDk); rm2.castShadow = true; ship.add(rm2);
    for (let i = 3; i < pts.length - 3; i += 2) { const p = pts[i]; add(new THREE.BoxGeometry(0.02, 0.135, 0.02), M.deckDk, p.x, p.y + 0.067, p.z, true); }
  }

  // ===== PLANKED DECK (generated from the exact hull plan so it always matches the sides) =====
  M.deck.side = THREE.DoubleSide;
  const hbeam = (z: number) => { const t = (z - zStern) / (zBow - zStern); return CPlerp(beamCP, Math.max(0, Math.min(1, t))); };
  (function () {
    const zN = 48, inset = 0.05, dp: number[] = [], di: number[] = [];
    for (let s = 0; s <= zN; s++) { const z = zStern + (zBow - zStern) * (s / zN); const b = Math.max(0.004, hbeam(z) - inset); dp.push(-b, deckY, z, b, deckY, z); }
    for (let s = 0; s < zN; s++) { const a = 2 * s; di.push(a, a + 3, a + 2, a, a + 1, a + 3); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setIndex(di); dg.computeVertexNormals();
    const deck = new THREE.Mesh(dg, M.deck); deck.receiveShadow = true; ship.add(deck);
  })();
  // caulked planking — seams run the full deck, butt joints staggered, framed by a margin plank
  (function () {
    const cl = std('#46301c', 0.9), pw = 0.072, halfN = 7, edge = 0.045;
    for (let k = -halfN; k <= halfN; k++) {
      const x = k * pw; let z0: number | null = null, z1 = 0;
      for (let s = 0; s <= 90; s++) { const z = zStern + (zBow - zStern) * (s / 90); if (Math.abs(x) < hbeam(z) - edge) { if (z0 === null) z0 = z; z1 = z; } }
      if (z0 === null) continue;
      add(new THREE.BoxGeometry(0.005, 0.012, z1 - z0), cl, x, deckY + 0.009, (z0 + z1) / 2, false);
    }
    for (let k = -halfN; k < halfN; k++) {
      const xc = (k + 0.5) * pw, stag = (((k % 4) + 4) % 4) * 0.225;
      for (let z = zStern + 0.2 + stag; z < zBow - 0.2; z += 0.9) { if (Math.abs(xc) < hbeam(z) - edge - 0.01) add(new THREE.BoxGeometry(pw, 0.013, 0.007), cl, xc, deckY + 0.009, z, false); }
    }
    for (const sgn of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 60; s++) { const z = zStern + (zBow - zStern) * (s / 60); const w = hbeam(z) - 0.1; if (w > 0.02) pts.push(new THREE.Vector3(sgn * w, deckY + 0.009, z)); }
      if (pts.length > 2) { const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.005, 4, false); ship.add(new THREE.Mesh(tg, cl)); }
    }
  })();

  // ===== TRANSOM (stern) — gilt frame + stern windows =====
  const tz = zStern - 0.01;
  add(new THREE.BoxGeometry(hw * 1.0, 0.42, 0.07), M.hull, 0, deckY - 0.04, tz).rotation.x = -0.3;
  add(new THREE.BoxGeometry(hw * 1.04, 0.05, 0.05), M.gilt, 0, deckY + 0.14, tz - 0.03).rotation.x = -0.3;
  add(new THREE.BoxGeometry(hw * 1.04, 0.05, 0.05), M.gilt, 0, deckY - 0.2, tz + 0.02).rotation.x = -0.3;
  for (const wx of [-0.22, 0, 0.22]) add(new THREE.BoxGeometry(0.16, 0.2, 0.04), M.glass, wx, deckY - 0.03, tz - 0.02).rotation.x = -0.3;
  add(new THREE.BoxGeometry(0.06, 0.5, 0.28), M.hullLo, 0, -0.18, tz - 0.04); // rudder

  // ===== BEAKHEAD + FIGUREHEAD (bow) =====
  add(new THREE.CylinderGeometry(0.04, 0.09, 0.6, 8), M.hull, 0, deckY - 0.06, zBow - 0.06).rotation.x = 1.2;
  const fig = add(new THREE.SphereGeometry(0.09, 10, 8), M.gilt, 0, deckY - 0.02, zBow + 0.05); fig.scale.set(0.7, 1.3, 1.5);

  // ===== DECK FURNITURE =====
  const fy = deckY;
  const grating = (z: number, w: number, l: number) => { const g = new THREE.Group(); for (let a = -2; a <= 2; a++) { const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.04, l), M.deckDk); b1.position.set(a * (w / 5), 0, 0); g.add(b1); const b2 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.018), M.deckDk); b2.position.set(0, 0.006, a * (l / 5)); g.add(b2); } g.position.set(0, fy + 0.03, z); g.traverse(o => { o.castShadow = true; }); ship.add(g); };
  // cargo hatch: white sill + green coaming + dark planked cover
  const hatch = (z: number, w: number, l: number, h?: number) => { h = h || 0.07; const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.02, l + 0.06), M.white)); const co = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h, l + 0.03), M.green); co.position.y = h / 2; g.add(co); const cov = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, l), M.deckDk); cov.position.y = h + 0.006; g.add(cov); const np = Math.max(3, Math.round(w / 0.06)); for (let i = 0; i < np; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.026, l), M.spar); s.position.set(-w / 2 + (i + 0.5) * (w / np), h + 0.007, 0); g.add(s); } g.traverse((o) => { o.castShadow = true; }); g.position.set(0, fy, z); ship.add(g); return g; };
  hatch(0.05, 0.42, 0.52); grating(-1.5, 0.4, 0.5);
  // capstan
  add(new THREE.CylinderGeometry(0.1, 0.14, 0.26, 12), M.spar, 0, fy + 0.13, -0.75);
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), M.deckDk, 0, fy + 0.27, -0.75, false);
  // ship's wheel — disc on the forward end of a short hub running back to a pedestal
  const wheelZ = -2.0, wheelY = fy + 0.2;
  add(new THREE.BoxGeometry(0.12, 0.18, 0.12), M.deckDk, 0, fy + 0.09, wheelZ - 0.2);                                   // pedestal stand
  add(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 10), M.spar, 0, wheelY, wheelZ - 0.09).rotation.x = Math.PI / 2;   // hub barrel, behind the rim only
  add(new THREE.TorusGeometry(0.155, 0.016, 8, 24), M.spar, 0, wheelY, wheelZ);                                          // rim (athwartships plane)
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.045, 10), M.spar, 0, wheelY, wheelZ).rotation.x = Math.PI / 2;           // hub boss at rim centre
  for (let a = 0; a < 8; a++) { const sp2 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.37, 6), M.spar); sp2.position.set(0, wheelY, wheelZ); sp2.rotation.z = a * Math.PI / 4; sp2.castShadow = true; ship.add(sp2); }
  add(new THREE.BoxGeometry(0.16, 0.22, 0.14), M.deckDk, 0, fy + 0.11, -2.42);                                     // binnacle box
  add(new THREE.CylinderGeometry(0.052, 0.058, 0.05, 12), M.brass, 0, fy + 0.24, -2.42);                           // compass bowl
  add(new THREE.SphereGeometry(0.045, 12, 8), M.glass, 0, fy + 0.265, -2.42, false);                               // compass glass
  // bitts
  for (const bz of [1.4, -1.05]) for (const bx of [-0.12, 0.12]) add(new THREE.BoxGeometry(0.05, 0.22, 0.05), M.spar, bx, fy + 0.11, bz);
  // barrels (staved, with iron hoops)
  const barrel = (x: number, z: number, rad: number, h: number) => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.9, rad * 0.9, h, 14), M.spar)); g.add(new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h * 0.55, 14), M.spar)); for (const hy of [h * 0.42, -h * 0.42]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.93, 0.009, 6, 16), M.iron); hoop.rotation.x = Math.PI / 2; hoop.position.y = hy; g.add(hoop); } const top = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.82, rad * 0.82, 0.012, 14), M.deckDk); top.position.y = h / 2; g.add(top); g.traverse(o => { o.castShadow = true; }); g.position.set(x, fy + h / 2, z); ship.add(g); return g; };
  barrel(-0.16, -1.8, 0.1, 0.26); barrel(0.16, -1.62, 0.1, 0.26); barrel(-0.02, -1.74, 0.105, 0.28);
  // --- flaked rope coils (a real spiral, not a ring) ---
  const ropeCoil = (x: number, z: number, r0: number, turns: number) => {
    const N = Math.round(turns * 26), pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) { const a = i / N, ang = a * turns * Math.PI * 2, rad = r0 * (1 - a * 0.5); pts.push(new THREE.Vector3(x + Math.cos(ang) * rad, fy + 0.014 + a * 0.018, z + Math.sin(ang) * rad)); }
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.015, 6, false);
    const m = new THREE.Mesh(tg, M.manila); m.castShadow = true; m.receiveShadow = true; ship.add(m); return m;
  };
  ropeCoil(0.42, 1.15, 0.085, 3.2); ropeCoil(-0.42, -0.3, 0.075, 3); ropeCoil(-0.34, 1.55, 0.1, 3.4);
  // shot garland — a rack of cannonballs
  (function () { const sx = 0.34, sz = -0.62; add(new THREE.BoxGeometry(0.05, 0.026, 0.3), M.deckDk, sx, fy + 0.014, sz, true); for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.027, 12, 10), M.iron, sx, fy + 0.04, sz - 0.09 + i * 0.06, true); })();
  // wooden bucket with hoops + bail handle
  (function () { const bxp = -0.3, bzp = -0.95, h = 0.085, r = 0.046; const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, h, 14), M.spar)); for (const hy of [h * 0.4, -h * 0.2]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95 - (hy < 0 ? 0.006 : 0), 0.006, 6, 16), M.iron); hoop.rotation.x = Math.PI / 2; hoop.position.y = hy; g.add(hoop); } const bail = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.005, 6, 16, Math.PI), M.iron); bail.position.y = h * 0.5; g.add(bail); g.traverse(o => { o.castShadow = true; }); g.position.set(bxp, fy + h / 2, bzp); ship.add(g); })();
  // crate with plank framing
  (function () { const cx = 0.28, cz = 1.78, s = 0.16, fr = 0.015, h = s * 0.82; const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(s, h, s), M.spar)); for (const ix of [-1, 1]) for (const iz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(fr, h + 0.002, fr), M.deckDk); p.position.set(ix * s / 2, 0, iz * s / 2); g.add(p); } for (const iy of [1, -1]) { for (const iz of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(s, fr, fr), M.deckDk); b.position.set(0, iy * h / 2, iz * s / 2); g.add(b); } for (const ix of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(fr, fr, s), M.deckDk); b.position.set(ix * s / 2, iy * h / 2, 0); g.add(b); } } g.traverse(o => { o.castShadow = true; }); g.position.set(cx, fy + h / 2, cz); ship.add(g); })();
  // brick galley chimney
  (function () { const cx = 0.17, cz = -0.45; const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.1), M.brick); b.position.y = 0.1; g.add(b); const cap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.12), M.iron); cap.position.y = 0.21; g.add(cap); const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 8), M.iron); pipe.position.y = 0.27; g.add(pipe); g.traverse(o => { o.castShadow = true; }); g.position.set(cx, fy, cz); ship.add(g); })();
  // deck lantern (black frame, glazed)
  (function () { const lx = -0.2, lz = 0.55; const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.06), M.iron); base.position.y = 0.01; g.add(base); const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.05), M.glass); body.position.y = 0.055; g.add(body); for (const e of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.075, 0.008), M.iron); post.position.set(e[0] * 0.025, 0.055, e[1] * 0.025); g.add(post); } const top = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.03, 4), M.iron); top.position.y = 0.105; top.rotation.y = Math.PI / 4; g.add(top); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, 6, 10), M.iron); ring.position.y = 0.125; ring.rotation.x = Math.PI / 2; g.add(ring); g.traverse(o => { o.castShadow = true; }); g.position.set(lx, fy, lz); ship.add(g); })();
  // green water cask lying on its side
  (function () { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 14), M.green); body.rotation.z = Math.PI / 2; g.add(body); for (const hx of [0.065, -0.065]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.061, 0.006, 6, 16), M.iron); hoop.position.x = hx; hoop.rotation.y = Math.PI / 2; g.add(hoop); } g.traverse(o => { o.castShadow = true; }); g.position.set(0, fy + 0.135, 0.05); ship.add(g); })();

  // ===== RIG =====
  const railX = (z: number) => hbeam(z);   // rail/gunwale sits exactly on the hull beam
  // thin tube following a path of points (for seams, ropes, reef ties)
  const sailLine = (grp: THREE.Group, pts: THREE.Vector3[], r: number, mat: THREE.Material) => { const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(2, pts.length), r, 4, false); const me = new THREE.Mesh(tg, mat); me.castShadow = false; grp.add(me); };
  // overlay cloth seams + reef bands + bolt-rope + reef points onto a billowed sail
  const sailDetail = (grp: THREE.Group, w: number, h: number, zAt: (x: number, y: number) => number) => {
    const surf = (x: number, y: number) => new THREE.Vector3(x, y, zAt(x, y) + 0.009);
    const nc = Math.max(4, Math.round(w / 0.26));
    for (let c = 1; c < nc; c++) { const x = -w / 2 + c * (w / nc); const pts: THREE.Vector3[] = []; for (let s = 0; s <= 9; s++) pts.push(surf(x, -h / 2 + s * (h / 9))); sailLine(grp, pts, 0.0034, M.seam); }
    for (const by of [h * 0.24, h * -0.04, h * -0.30]) { const pts: THREE.Vector3[] = []; for (let s = 0; s <= 11; s++) pts.push(surf(-w / 2 + s * (w / 11), by)); sailLine(grp, pts, 0.0058, M.seam); }
    const N = 11, peri: THREE.Vector3[] = [];
    for (let s = 0; s <= N; s++) peri.push(surf(-w / 2 + s * (w / N), h / 2));
    for (let s = 1; s <= N; s++) peri.push(surf(w / 2, h / 2 - s * (h / N)));
    for (let s = 1; s <= N; s++) peri.push(surf(w / 2 - s * (w / N), -h / 2));
    for (let s = 1; s <= N; s++) peri.push(surf(-w / 2, -h / 2 + s * (h / N)));
    sailLine(grp, peri, 0.011, M.boltrope);
    for (let c = 1; c < nc; c++) { const x = -w / 2 + c * (w / nc); const t = surf(x, h * 0.24); sailLine(grp, [t, t.clone().add(new THREE.Vector3(0, -0.085, 0.012))], 0.0034, M.rope); }
  };
  // subtle, intentional sail weathering baked as vertex colours (no UVs needed)
  const weatherSail = (geo: THREE.BufferGeometry) => {
    const pos = geo.attributes.position, n = pos.count, c = new Float32Array(n * 3);
    geo.computeBoundingBox(); const bb = geo.boundingBox!, y0 = bb.min.y, hh = Math.max(0.001, bb.max.y - bb.min.y);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), v = (y - y0) / hh;
      let s = 1 - (1 - v) * 0.2;                                                       // grimier toward the foot
      s *= 0.92 + 0.08 * Math.sin(x * 7.3 + z * 5.1) * Math.sin(y * 4.1 + z * 2.3);     // mottle
      s *= 1 - 0.05 * Math.max(0, Math.sin(v * 8.0 + x * 1.5));                         // faint stain bands
      c[i * 3] = s; c[i * 3 + 1] = s * 0.985; c[i * 3 + 2] = s * 0.95;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  };
  const makeSquareSail = (w: number, h: number, bulge: number, mat: THREE.Material, detail = true) => {
    const zAt = (x: number, y: number) => { const nx = x / (w / 2), ny = (y + h / 2) / h; const vfac = 0.5 + 0.5 * ny; const fold = Math.abs(((nx + 1) * 2.5) % 1 - 0.5) - 0.25; return bulge * (1 - nx * nx) * vfac * 0.62 + fold * 0.055 * (1 - Math.abs(nx)); };
    const g = new THREE.PlaneGeometry(w, h, 16, 10); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, zAt(p.getX(i), p.getY(i)));
    g.computeVertexNormals(); weatherSail(g);
    const grp = new THREE.Group(); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; grp.add(m);
    if (detail) sailDetail(grp, w, h, zAt);
    return grp;
  };

  // four-cornered fore-and-aft sail (the gaff main). corners: [tack, clew, peak, throat]
  const makeFourSail = (corners: THREE.Vector3[], bulge: number, mat: THREE.Material, detail = true) => {
    const [A, B, C, D] = corners;
    const NX = 12, NY = 8;
    const P = (u: number, v: number) => {
      const bot = A.clone().lerp(B, u);
      const top = D.clone().lerp(C, u);
      const p = bot.lerp(top, v);
      const fold = Math.abs((u * 5) % 1 - 0.5) - 0.25;
      const camber = bulge * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * (0.5 + 0.5 * v) * 0.58 + fold * 0.05 * Math.sin(Math.PI * u);
      p.x += camber;
      return p;
    };
    const pos: number[] = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const q = P(i / NX, j / NY); pos.push(q.x, q.y, q.z); }
    const idx: number[] = [], vidx = (i: number, j: number) => j * (NX + 1) + i;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = vidx(i, j), b = vidx(i + 1, j), c = vidx(i + 1, j + 1), d = vidx(i, j + 1); idx.push(a, b, c, a, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals(); weatherSail(g);
    const grp = new THREE.Group();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; grp.add(m);
    if (detail) {
      const surf = (u: number, v: number) => { const q = P(u, v); q.x += 0.006; return q; };
      for (let c = 1; c < 6; c++) { const u = c / 6; const pts: THREE.Vector3[] = []; for (let s = 0; s <= 9; s++) pts.push(surf(u, s / 9)); sailLine(grp, pts, 0.0034, M.seam); }
      for (const vb of [0.66, 0.4]) { const pts: THREE.Vector3[] = []; for (let s = 0; s <= 11; s++) pts.push(surf(s / 11, vb)); sailLine(grp, pts, 0.0055, M.seam); }
      const peri: THREE.Vector3[] = [];
      for (let s = 0; s <= 12; s++) peri.push(surf(s / 12, 0));
      for (let s = 0; s <= 12; s++) peri.push(surf(1, s / 12));
      for (let s = 0; s <= 12; s++) peri.push(surf(1 - s / 12, 1));
      for (let s = 0; s <= 12; s++) peri.push(surf(0, 1 - s / 12));
      sailLine(grp, peri, 0.01, M.boltrope);
    }
    ship.add(grp);
    return grp;
  };
  // triangular headsail (straight bolt-rope edges — rope doesn't bend)
  const makeJib = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, mat: THREE.Material) => { const grp = new THREE.Group(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3)); g.computeVertexNormals(); weatherSail(g); const m = new THREE.Mesh(g, mat); m.castShadow = true; grp.add(m); const seg = (p: THREE.Vector3, q: THREE.Vector3, r: number) => { const d = new THREE.Vector3().subVectors(q, p), L = d.length(); const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 5), M.boltrope); t.position.copy(p).add(q).multiplyScalar(0.5); t.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); t.castShadow = true; grp.add(t); }; seg(a, b, 0.009); seg(b, c, 0.009); seg(c, a, 0.009); ship.add(grp); return grp; };

  // ======================================================================
  // RIG — single-masted TOPSAIL SLOOP: one raked mast, big gaff mainsail,
  // a square topsail aloft, long bowsprit carrying two headsails.
  // ======================================================================
  const mz = 0.45;                       // mast stepped a touch forward of amidships
  const mBase = 0.16;
  const lowerH = 3.0;
  const topH = 1.8;
  const lowerTopY = mBase + lowerH;      // hounds / crosstrees
  const mastHeadY = lowerTopY + topH;    // truck

  // lower mast + topmast
  tube(V(0, mBase, mz), V(0, lowerTopY, mz), 0.078, M.spar, 12);
  const plat = add(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 12), M.deckDk, 0, lowerTopY, mz, true); plat.scale.z = 1.1;
  add(new THREE.BoxGeometry(0.5, 0.026, 0.032), M.spar, 0, lowerTopY + 0.02, mz, false);  // crosstrees
  tube(V(0, lowerTopY - 0.12, mz), V(0, mastHeadY, mz), 0.05, M.spar, 10);
  add(new THREE.SphereGeometry(0.05, 8, 6), M.spar, 0, mastHeadY, mz, false);             // truck

  // ---- GAFF MAINSAIL — the big fore-and-aft driver ----
  const boomY = mBase + 0.4;
  const luffZ = mz - 0.08;                // sail + spars set on the mast's after side, touching it
  const boomClewZ = -len * 1.06;          // boom overhangs the taffrail
  const throatY = mBase + lowerH * 0.42;  // gaff jaws on the mast
  const peakY = lowerTopY - 0.05;
  const peakZ = -len * 0.5;
  tube(V(0, boomY, luffZ), V(0, boomY + 0.07, boomClewZ), 0.034, M.spar, 8);          // boom
  tube(V(0, throatY, luffZ), V(0, peakY, peakZ), 0.03, M.spar, 8);                    // gaff
  const mainSail = makeFourSail([
    V(0, boomY + 0.05, luffZ),
    V(0, boomY + 0.09, boomClewZ - 0.02),
    V(0, peakY - 0.03, peakZ),
    V(0, throatY + 0.03, luffZ),
  ], 0.5, M.canvas, true);

  // ---- mast hoops binding the mainsail luff to the mast ----
  for (let i = 0; i < 9; i++) { const hy = boomY + 0.06 + i * 0.12; const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.011, 6, 18), M.spar); hoop.position.set(0, hy, mz - 0.015); hoop.rotation.x = Math.PI / 2; hoop.castShadow = true; ship.add(hoop); }

  // ---- square topsail aloft (the "topsail sloop") ----
  const topYardY = lowerTopY + topH * 0.5;
  const topW = 1.7, topHt = 1.05;
  tube(V(-(topW + 0.34) / 2, topYardY, mz), V((topW + 0.34) / 2, topYardY, mz), 0.03, M.spar, 8);
  const topsail = makeSquareSail(topW, topHt, 0.6, M.canvas2);
  topsail.position.set(0, topYardY - topHt / 2, mz + 0.06); ship.add(topsail);

  const mast = { z: mz, lowerTop: lowerTopY, mastHead: mastHeadY, base: mBase };

  // ---- shrouds + ratlines (one mast, both sides) ----
  for (const sgn of [-1, 1]) {
    const head = V(sgn * 0.12, lowerTopY + 0.02, mz);
    const chx = railX(mz) + 0.05;
    const anchors: THREE.Vector3[] = [];
    for (let s = 0; s < 4; s++) {
      const az = mz + (s - 1.5) * 0.18;
      const aBase = V(sgn * chx, 0.36, az);
      tube(aBase, head, 0.008, M.rope, 4);
      anchors.push(aBase);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8), M.spar, sgn * chx, 0.34, az, false);
    }
    for (let rL = 1; rL <= 7; rL++) { const f = rL / 8; tube(anchors[0].clone().lerp(head, f), anchors[3].clone().lerp(head, f), 0.005, M.rope, 4); }
  }

  // ---- standing stays ----
  tube(V(0, mastHeadY, mz), V(0, 0.64, len + 1.25), 0.01, M.rope, 4);                 // topmast stay -> jibboom tip
  tube(V(0, lowerTopY, mz), V(0, 0.4, len * 0.94), 0.011, M.rope, 4);                 // forestay -> stem head
  for (const sgn of [-1, 1]) tube(V(sgn * 0.12, mastHeadY, mz), V(sgn * hbeam(-2.4) * 0.98, 0.4, -2.4), 0.008, M.rope, 4); // backstays

  // ===== BOWSPRIT + JIBBOOM + HEADSAILS =====
  tube(V(0, 0.32, len * 0.9), V(0, 0.66, len + 1.3), 0.05, M.spar, 8);                // one long bowsprit + jibboom
  add(new THREE.SphereGeometry(0.035, 8, 6), M.spar, 0, 0.66, len + 1.3, false);
  const jibOuter = makeJib(V(0, 0.64, len + 1.25), V(0, mastHeadY - 0.15, mz), V(0.2, 0.5, len + 0.35), M.canvas);   // outer jib
  const jibFore = makeJib(V(0, 0.42, len * 0.92), V(0, lowerTopY - 0.1, mz), V(0.18, 0.42, len * 0.5), M.canvas2);  // fore-staysail
  tube(V(0, 0.66, len + 1.3), V(0, -0.05, len * 0.96), 0.006, M.rope, 4);             // bobstay
  for (const sgn of [-1, 1]) tube(V(0, 0.66, len + 1.3), V(sgn * 0.16, 0.36, len * 0.9), 0.005, M.rope, 4); // bowsprit shrouds

  // ===== FLAGS =====
  // ensign bent to a short staff at the gaff peak
  tube(V(0, peakY, peakZ), V(0, peakY + 0.46, peakZ - 0.04), 0.01, M.spar, 6);
  const ensign = makeSquareSail(0.46, 0.3, 0.12, M.red, false); ensign.rotation.y = Math.PI / 2; ensign.position.set(0, peakY + 0.25, peakZ - 0.27); ship.add(ensign);
  // long pennant streaming aft from the masthead truck
  add(new THREE.BoxGeometry(0.012, 0.05, 0.6), M.red, 0, mastHeadY + 0.04, mz - 0.32, false);

  // ========================== DETAIL PASS ==========================
  // --- gunports with run-out cannon (both broadsides) ---
  for (const gz of [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0]) {
    const bx = hbeam(gz);
    for (const sgn of [-1, 1]) {
      add(new THREE.BoxGeometry(0.05, 0.13, 0.13), M.wale, sgn * (bx * 0.95), 0.13, gz);          // dark port recess
      add(new THREE.BoxGeometry(0.03, 0.12, 0.12), M.red, sgn * (bx * 0.95 + 0.015), 0.255, gz, false).rotation.z = sgn * -0.5; // open lid (red liner)
      const cb = add(new THREE.CylinderGeometry(0.028, 0.036, 0.2, 10), M.iron, sgn * (bx * 0.95 + 0.07), 0.13, gz); cb.rotation.z = Math.PI / 2; // barrel
      add(new THREE.SphereGeometry(0.018, 6, 6), M.iron, sgn * (bx * 0.95 + 0.02), 0.13, gz, false); // cascabel
    }
  }

  // --- channels + chainplate boards where the shrouds meet the hull ---
  {
    const bx = hbeam(mast.z);
    for (const sgn of [-1, 1]) {
      add(new THREE.BoxGeometry(0.06, 0.024, 0.46), M.deckDk, sgn * (bx + 0.04), 0.305, mast.z);
      for (const dz of [-0.18, -0.06, 0.06, 0.18]) add(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6), M.spar, sgn * (bx + 0.055), 0.30, mast.z + dz, false);
    }
  }

  // --- swivel guns mounted on the rail: a pair forward, a pair aft ---
  const swivelGun = (sgn: number, z: number) => {
    const bx = hbeam(z);
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.18, 8), M.iron); post.position.y = 0.05; g.add(post);
    const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 6), M.iron); yoke.position.set(0.015, 0.16, 0); yoke.rotation.x = Math.PI / 2; g.add(yoke);
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.019, 0.26, 10), M.iron); barrel2.position.set(0.1, 0.19, 0); barrel2.rotation.z = -Math.PI / 2 + 0.26; g.add(barrel2);
    const cascabel = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), M.iron); cascabel.position.set(-0.015, 0.165, 0); g.add(cascabel);
    const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, 6), M.iron); tiller.position.set(-0.06, 0.13, 0); tiller.rotation.z = 0.8; g.add(tiller);
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(sgn * (bx + 0.01), 0.3, z);
    if (sgn < 0) g.rotation.y = Math.PI;
    ship.add(g);
  };
  for (const z of [1.0, -1.7]) { swivelGun(1, z); swivelGun(-1, z); }

  // --- catheads + a stock anchor on the bow ---
  for (const sgn of [-1, 1]) {
    const cz = len * 0.78, bx = hbeam(cz);
    const cat = add(new THREE.BoxGeometry(0.05, 0.05, 0.32), M.deckDk, sgn * (bx + 0.02), 0.30, cz + 0.06); cat.rotation.y = sgn * 0.5;
  }
  (function () {
    const az = len * 0.72, ax = hbeam(az) + 0.06, ay = 0.18, g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.5, 8), M.iron));                                  // shank
    const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.34, 6), M.spar); stock.rotation.z = Math.PI / 2; stock.position.y = 0.21; g.add(stock);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 6), M.iron); arm.rotation.z = s * 0.95; arm.position.set(s * 0.075, -0.22, 0); g.add(arm);
      const flk = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 4), M.iron); flk.rotation.z = s * 0.95 + Math.PI; flk.position.set(s * 0.15, -0.29, 0); g.add(flk);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.009, 6, 12), M.iron); ring.position.y = 0.27; g.add(ring);
    g.traverse(o => { o.castShadow = true; });
    g.position.set(ax, ay, az); g.rotation.y = Math.PI / 2; g.rotation.z = 0.15; ship.add(g);
  })();

  // --- fife rails (belaying-pin rails) at the mast foot, with coiled lines ---
  {
    add(new THREE.BoxGeometry(0.46, 0.03, 0.06), M.deckDk, 0, deckY + 0.12, mast.z + 0.24);
    for (const px of [-0.18, -0.06, 0.06, 0.18]) add(new THREE.CylinderGeometry(0.009, 0.009, 0.12, 6), M.spar, px, deckY + 0.13, mast.z + 0.24, false);
    for (const px of [-0.18, 0.06]) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.009, 6, 12), M.manila); c.position.set(px, deckY + 0.055, mast.z + 0.27); c.castShadow = true; ship.add(c); }
  }

  // --- companion hood — green sides, white trim, dark sliding hatch ---
  add(new THREE.BoxGeometry(0.34, 0.02, 0.28), M.white, 0, deckY + 0.01, -1.35, false);          // white sill
  add(new THREE.BoxGeometry(0.3, 0.13, 0.24), M.green, 0, deckY + 0.075, -1.35);                 // green coaming
  add(new THREE.BoxGeometry(0.26, 0.03, 0.18), M.deckDk, 0, deckY + 0.15, -1.35, false);         // dark sliding cover
  add(new THREE.BoxGeometry(0.22, 0.012, 0.08), M.glass, 0, deckY + 0.17, -1.41, false);         // small skylight pane
  for (let st = 0; st < 3; st++) add(new THREE.BoxGeometry(0.22, 0.02, 0.05), M.deckDk, 0, deckY + 0.02 + st * 0.03, -1.62 - st * 0.05, false);

  // --- light bow rails sweeping to the stem ---
  for (const sgn of [-1, 1]) {
    const bz = len * 0.86;
    tube(V(sgn * hbeam(bz) * 0.7, deckY + 0.05, bz - 0.05), V(sgn * 0.05, deckY + 0.02, len * 1.02), 0.012, M.deckDk, 5);
  }

  // --- gilt quarter-badges at the stern ---
  for (const sgn of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.13, 0.09), M.gilt, sgn * hbeam(-len * 0.9) * 0.95, 0.27, -len * 0.9);

  // --- running rigging: lifts, braces, halyards ---
  const blk = (x: number, y: number, z: number) => add(new THREE.BoxGeometry(0.028, 0.042, 0.02), M.rope, x, y, z, false);
  {
    for (const sgn of [-1, 1]) {
      const tip = V(sgn * (topW + 0.34) / 2, topYardY, mz);
      tube(tip, V(sgn * 0.04, mastHeadY - 0.1, mz), 0.005, M.manila, 4);                             // lift
      tube(tip, V(sgn * railX(-len * 0.7) * 0.9, deckY + 0.2, -len * 0.7), 0.005, M.manila, 4);       // brace aft
      blk(tip.x, tip.y - 0.03, tip.z);
    }
    tube(V(0, boomY + 0.07, boomClewZ), V(0, deckY + 0.04, -len * 0.92), 0.006, M.manila, 4);         // main sheet -> taffrail
    tube(V(-0.06, peakY - 0.03, peakZ), V(-0.06, mastHeadY - 0.2, mz), 0.005, M.manila, 4);            // peak halyard
    tube(V(-0.05, throatY, mz - 0.04), V(-0.05, lowerTopY - 0.1, mz), 0.005, M.manila, 4);            // throat halyard
    tube(V(-0.12, boomY + 0.07, boomClewZ), V(-0.12, lowerTopY - 0.15, mz), 0.005, M.manila, 4);       // topping lift
  }

  // ship's bell on a gallows just forward of the mast
  { const bz = mast.z + 0.6; for (const ux of [-0.08, 0.08]) add(new THREE.BoxGeometry(0.018, 0.16, 0.018), M.deckDk, ux, deckY + 0.08, bz); add(new THREE.BoxGeometry(0.21, 0.018, 0.018), M.deckDk, 0, deckY + 0.16, bz); add(new THREE.CylinderGeometry(0.03, 0.05, 0.07, 10), M.brass, 0, deckY + 0.11, bz); }

  return {
    root: ship,
    // structural wood/paint dims with hull damage; gilt/brass/glass keep their lustre
    hullMats: [M.hull, M.bottom, M.hullLo, M.wale, M.deck, M.deckDk, M.spar, M.rope, M.manila, M.red, M.iron, M.green, M.white, M.brick],
    sailMats: [M.canvas, M.canvas2],
    sails: [mainSail, topsail, jibOuter, jibFore],
  };
}
