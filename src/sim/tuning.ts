// Playtest dials. Defaults are the LOCKED slice values — changing them at
// runtime is an explicit tester action (pause menu), never a code default.
// The open combat questions from CLAUDE.md: ball speed 220/270/360,
// reload 4.5/5.5/7, rake full/reduced.

export const TUNING = {
  ballSpd: 270,
  reloadBase: 5.5,
  rakeStern: 2.2,
  rakeBow: 1.7,
};

export function setRake(mode: 'full' | 'reduced'): void {
  if (mode === 'full') {
    TUNING.rakeStern = 2.2;
    TUNING.rakeBow = 1.7;
  } else {
    TUNING.rakeStern = 1.6;
    TUNING.rakeBow = 1.35;
  }
}
