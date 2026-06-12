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

/** FEEL: sweeps. A furled ship is rowed at a crawl instead of parking dead —
 *  speed scales with the hands left to pull the oars. */
const ROW_SPEED = 11;

/**
 * Advance heading, speed and position for a live ship. Committed turning:
 * turn authority scales with speed; sail health caps drive. Ported from the
 * slice's updateShip core.
 * FEEL (2026-06-12 playtest): accel/decel rates raised 0.55→0.7 and 1.1→1.4
 * ("make fast and slow a little faster"), and the rowing floor added.
 */
export function stepShipPhysics(s: Ship, windDir: number, dt: number): void {
  const spdFac = clamp(s.speed / s.maxSpd, 0, 1);
  s.heading = normAng(s.heading + s.rudder * s.turn * rudderFac(s) * (0.35 + 0.65 * spdFac) * dt);
  // The Drowned ignore the point-of-sail curve. This is the rule-break the
  // whole run trains you to feel in your stomach.
  const eff = s.ghost ? Math.max(windEff(s.heading, windDir), 0.85) : windEff(s.heading, windDir);
  let tgt = s.maxSpd * SAILS[s.sailIdx] * eff * (0.3 + 0.7 * s.sailHP / 100);
  if (s.sailIdx === 0 && !s.ghost) {
    tgt = Math.max(tgt, ROW_SPEED * (0.3 + 0.7 * (s.crew / s.maxCrew)));
  }
  const rate = tgt > s.speed ? 0.7 : 1.4;
  s.speed += (tgt - s.speed) * clamp(dt * rate, 0, 1);
  s.x += Math.cos(s.heading) * s.speed * dt;
  s.y += Math.sin(s.heading) * s.speed * dt;
}
