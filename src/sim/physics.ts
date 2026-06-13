// Shared sailing physics — THE feel of the game, used identically by the
// battle arena and the sea map. Formulas ported verbatim from the slice.

import { SAILS } from './constants';
import { clamp, lerp, normAng } from './math';
import type { Ship } from './types';

/** Point-of-sail efficiency curve. angle-off-downwind → efficiency. */
export function windEff(heading: number, windDir: number): number {
  const off = Math.abs(normAng(heading - windDir));
  const pts: [number, number][] = [
    [0, 0.80], [Math.PI * 0.25, 0.95], [Math.PI * 0.5, 1.0],
    [Math.PI * 0.75, 0.45], [2.95, 0.08], [Math.PI, 0.05],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    if (off <= pts[i + 1][0]) {
      const t = (off - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return lerp(pts[i][1], pts[i + 1][1], t);
    }
  }
  return 0.05;
}

export function rudderFac(s: Ship): number {
  return s.rudderHP <= 0 ? 0.3 : s.rudderHP < 50 ? 0.7 : 1;
}

/** FEEL: sweeps. A furled ship is rowed by hand — class-relative so it reads
 *  as a *slight* edge over sailing dead into the wind (whose efficiency floor
 *  is ~0.05). ROW_EFF 0.075 ≈ 1.5× the in-irons crawl at full crew, and well
 *  below any real point of sail, so you only furl-and-row when truly head to
 *  wind. Scales with the hands left to pull the sweeps. (2026-06-13) */
const ROW_EFF = 0.075;

/** FEEL: global pace amp (2026-06-12 human directive: "amp up speed overall,
 *  tighter turning"). Applies to EVERY ship equally — relative balance and
 *  the locked class ratios are preserved; the whole dance just moves faster. */
const SPEED_AMP = 1.15;
const TURN_AMP = 1.2;

/**
 * Advance heading, speed and position for a live ship. Committed turning:
 * turn authority scales with speed; sail health caps drive. Ported from the
 * slice's updateShip core.
 * FEEL (2026-06-12 playtest): accel/decel rates raised 0.55→0.7 and 1.1→1.4
 * ("make fast and slow a little faster"), and the rowing floor added.
 */
export function stepShipPhysics(s: Ship, windDir: number, dt: number): void {
  const spdFac = clamp(s.speed / (s.maxSpd * SPEED_AMP), 0, 1);
  s.heading = normAng(s.heading + s.rudder * s.turn * TURN_AMP * rudderFac(s) * (0.35 + 0.65 * spdFac) * dt);
  // The Drowned ignore the point-of-sail curve. This is the rule-break the
  // whole run trains you to feel in your stomach.
  const eff = s.ghost ? Math.max(windEff(s.heading, windDir), 0.85) : windEff(s.heading, windDir);
  let tgt = s.maxSpd * SPEED_AMP * SAILS[s.sailIdx] * eff * (0.3 + 0.7 * s.sailHP / 100);
  if (s.sailIdx === 0 && !s.ghost) {
    // furled: row at a class-relative crawl, scaled by surviving crew
    tgt = s.maxSpd * SPEED_AMP * ROW_EFF * (0.3 + 0.7 * (s.crew / s.maxCrew));
  }
  const rate = tgt > s.speed ? 0.7 : 1.4;
  s.speed += (tgt - s.speed) * clamp(dt * rate, 0, 1);
  s.x += Math.cos(s.heading) * s.speed * dt;
  s.y += Math.sin(s.heading) * s.speed * dt;
}
