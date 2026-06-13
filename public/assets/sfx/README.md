# Combat SFX override slot

Drop CC0 (public-domain-equivalent) audio here and the game layers it over the
built-in synthesis automatically — no code change. Missing files are ignored;
the procedural synth in src/audio.ts is always the floor.

Recognized filenames (mp3):
- `cannon.mp3` — the gun report (layers over the synth boom)
- `hit.mp3`    — a ball striking timber
- `splash.mp3` — a ball finding only sea

Only add files that are genuinely CC0 / public-domain and log each one (source
URL + license) in ASSETS.md. Good sources: Kenney audio packs (CC0),
freesound.org (filter to CC0), OpenGameArt (CC0).
