// FEEL: testing-phase easing. One switch, every lever documented.
// The human's 2026-06-12 playtest directive: "everything 20% easier during
// this testing phase — we want them to learn and succeed pretty quickly."
// Flip `on` to false to restore the locked prototype economy and damage.

export const EASY = {
  on: true,

  /** player-fleet ships take 20% less hull/sail/crew damage from shot */
  dmgToPlayer: 0.8,

  /** player crew falls 20% slower in boarding melees */
  boardLossToPlayer: 0.8,

  /** prize crews: hands needed to crew a captured ship (was 1.0×) */
  crewCostMul: 0.66,

  /** fraction of a struck crew pressed into your pool (was 0.25) */
  pressedFrac: 0.45,

  /** harbor hull repair: amount restored and price (was +0.35 for 12) */
  repairAmt: 0.5,
  repairCost: 8,

  /** opening purse (was 20) */
  startingStores: 30,

  /** the carpenter's crew: free at-sea hull patching, up to this fraction */
  carpenterCap: 0.35,
  /** hull fraction restored per second of map sailing */
  carpenterRate: 0.005,
};
