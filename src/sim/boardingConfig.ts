// BOARDING — every tuning constant for the tap-timing station game, in one
// place per the locked design. Mechanics source of truth:
// reference/broadside-boarding-test-4d-tapping.html (constants mirrored from
// the 2026-06-12 final spec; fidelity-check against the file when it lands).
// All values are mutable at runtime — pause-menu dials scale the big levers,
// and window.__broadside exposes the whole object for surgical FEEL tests.
// Changes here are FEEL: commits.

export const BOARD_CFG = {
  /* the background fight (the clock) */
  K: 0.055, // melee attrition constant
  // FEEL deviation from spec: spec lists FRONT_K 0.045, but that forces a ~22s
  // skilled-play floor (1/0.045), incompatible with the spec's own 45–90s
  // target. Target length wins. 0.024 puts optimal play near the low end of
  // the band and ordinary play across it. Dial, verified in the matrix.
  FRONT_K: 0.024, // front drift rate at total dominance (per second)
  attritionScale: 0.1,
  loseCrewFrac: 0.12, // a side breaks below 12% of its starting hands
  woundedFrac: 0.35, // share of YOUR losses that hit the surgeon's queue alive
  woundedMax: 4, // table + rail space

  /* stations: prime/load, gold window, foul dead-time (seconds).
   * kill amounts trimmed from the spec's raw 5–8 / 3–5 so a lone sloop isn't
   * gutted in two volleys — calibrated to the 45–90s target. Dials, not dogma. */
  swivel: { prime: 3.2, window: 1.6, foul: 5, killMin: 3, killMax: 5, halveT: 3 },
  pistols: { load: 2.4, window: 1.8, foul: 4, killMin: 2, killMax: 3, frontPush: 0.035, boost: 0.2, boostDecay: 0.045 },
  lines: {
    frayRate: 0.009, // health per second, per line
    axeFrayMul: 7,
    heave: 1.2,
    heaveWindow: 0.9,
    slipPenalty: 0.22, // missed heave: the line slips this much extra
    heaveFoul: 1.5,
    rerig: 3.5, // a PARTED line is the long recipe
    rerigWindow: 1.2,
    rerigFoul: 4,
    rerigHealth: 0.65, // a re-rigged line is serviceable, not new
  },
  surgeon: { bleedOut: 10, surgery: 2.8, window: 1.5, foul: 2.5 },
  surgeonsMate: { surgery: 2.1, window: 1.9 }, // future crew-quality refit hook
  reserve: { arm: 1.2, window: 1.5, foul: 3, frac: 0.25, frontShove: 0.1 },
  helm: { arm: 2.0, window: 1.5, foul: 3, regrappleCd: 15 },

  /* enemy demands */
  surge: { patience: 4.5, pushT: 3, pushRate: 0.055 }, // unfed surge: hard front push
  axe: { duration: 5 },
  eventGapMin: 8,
  eventGapMax: 13,
  surgeChance: 0.6, // else axe

  /* naval-state hooks */
  skeletonFrac: 0.1, // sailing crew that never boards
  rakeWindowS: 20, // raked them this recently before grappling →
  rakeCadenceMul: 1.3, //   their event gaps stretch 30%
  gaugeWindowMul: 1.2, // weather gauge at grapple → gold windows 20% wider
  timbersFrayMul: 0.6, // TIMBERS refit: lines fray slower
  strandedLossFrac: 0.5, // all lines parted: half the boarders don't make it back

  /* global FEEL dials (pause menu) */
  windowScale: 1, // FORGIVING 1.25 / CANON 1 / CRUEL 0.8
  paceScale: 1, // CALM 0.85 / CANON 1 / FRENZY 1.2 — scales timers + melee
  earlyTapFouls: true, // tap during the white fill (before the gold window) and the station FOULS — patience is the skill
};
