# KICKOFF PROMPT — paste this into Claude Code as your first message

Read CLAUDE.md fully, then skim every file in /reference (these are working HTML prototypes; broadside-slice.html is the most complete and contains the sim logic and tuning values you'll be porting).

We're building the real project. Work milestone by milestone, and stop for my review at the end of each one with the game running.

MILESTONE 1 — Scaffold and port the sim.
Set up Vite + TypeScript + Three.js. Create the sim/render split described in CLAUDE.md: a deterministic fixed-timestep simulation module (ships, wind, gunnery, damage, AI, the 6-battle run meta-layer) ported faithfully from broadside-slice.html with identical tuning constants, and a render layer that reads sim state. For this milestone, render with primitive placeholder meshes (boxes/cones for hulls, planes for sails) on a simple animated water plane, with the camera at the oblique Pirates! angle (about 55 degrees from horizontal, smoothed follow on the player ship). Port the HTML UI overlay (status panels, fire buttons, ammo, fleet chips, harbor screen, feed) largely as-is from the prototype. Keyboard and touch input both working. Set up GitHub Pages deploy via Actions. Definition of done: I can play a full 6-battle run in the browser at the deployed URL, in 3D at the oblique angle, with feel identical to the prototype.

MILESTONE 2 — Diorama assets.
Download the Kenney Pirate Kit (CC0, kenney.nl/assets/pirate-kit) into public/assets, create ASSETS.md logging the source and license, and replace placeholder meshes with kit models: ship hulls per class (pick three kit ships that read as small/medium/large), sails, and scatter props (rocks, debris) for the arena. Add the diorama touches that are cheap in 3D: cotton-ball smoke puffs (soft white spheres), wake foam, painted-swell water (low-poly displaced plane, ridged), and a subtle tilt-shift depth-of-field pass if performance allows. Damage states: darken/chip hull material by hull %, sag and tatter sail meshes by sail %, snap a mast at the mast-down stage. Definition of done: a battle looks like miniatures on a model sea, runs at 60fps on a mid-range laptop and acceptably on a phone.

MILESTONE 3 — The sea map.
Add a map layer between harbor and battle: a small region of the diorama sea (think a tabletop map) where the player sails their flagship in real time between points of interest — the next escalation battle as an enemy ship/fleet marker to intercept, plus 1–2 optional encounters per leg (a weaker prize, a supply cache) so routing is a choice. Same wind system governs map sailing. Entering contact range transitions into the battle arena. Keep it minimal: this milestone is about proving the map→battle→harbor→map loop feels good, not about content volume.

MILESTONE 4 — Polish pass on the loop.
Battle intro/outro transitions (sail-in, colors-struck moment), harbor screen restyled to match the diorama UI language, sound pass (Kenney audio packs are CC0), and a settings panel exposing the playtest dials from CLAUDE.md (ball speed, reload, rake) so testers can keep A/B-ing in the real build.

Constraints and reminders:
- Do not change tuning constants or input behavior without flagging FEEL: in the commit and telling me.
- The boarding minigame stays as the placeholder auto-resolve until I pick a winner from the two prototype directions.
- Ask me before adding any dependency beyond Three.js and dev tooling.
- main stays playable at all times.

Start with Milestone 1. Show me your planned project structure before writing code.
