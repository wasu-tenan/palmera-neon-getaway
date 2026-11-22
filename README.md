# Palmera City: Neon Getaway

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/wasu-tenan/palmera-neon-getaway/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/wasu-tenan/palmera-neon-getaway/reward.svg)](https://make.fun/bounty/gta6-01)

An original top-down open-world crime game for the [**Make GTA 6**](https://make.fun/bounty/gta6-01) bounty on [make.fun](https://make.fun/bounty/gta6-01). Marco Vale arrives in the sun-soaked harbour city of Palmera with $120, a borrowed pair of shoes and a fixer named Delia Cruz who pays cash for quiet work. Explore the whole city on foot and by car, run her four-job story, steal anything with wheels, and stay ahead of the Policía Interceptors.

Everything — the city, the names, the story, the art, the synthesized sound — is original to this entry and built with vanilla JavaScript and Canvas: zero dependencies, zero network requests, no build step.

## Play it

```sh
node serve.ts          # serves game/ on http://localhost:8080
# or hand it in / verify it:
node main.ts           # copies game/ + screenshots/ to /output with dossier.json
```

Open the page in a desktop browser and press **New Game**. The game also runs from any static file server pointed at `game/`.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Walk or drive |
| Shift | Sprint |
| Mouse | Aim |
| Click / hold | Punch, or shoot with the pistol |
| E | Enter or steal a car, carjack, talk, use a shop |
| Space (in car) | Handbrake |
| 1 / 2 | Fists / pistol |
| Esc or P | Pause |
| M | Mute |

## What's in the city

- **A whole city**: nine avenues and seven streets of pastel rooftops and neon signs, a palm-lined promenade, harbour piers, parks and car parks — some ninety buildings, all solid, all lit at night.
- **On foot and by car**: sprint, mouse-aimed fists and a purchasable pistol; every car can be entered, stolen or carjacked, with arcade physics, handbrake drift, damage, smoke and wrecks.
- **Living streets**: sixteen traffic cars that drive the grid, brake and turn; thirty-six pedestrians who stroll the pavements and flee from trouble.
- **The law**: crimes seen by witnesses raise your heat through five stars; Interceptors hunt, ram and box you in, and a filled bust meter ends the run. Break their sight to cool down, or pay Taller Rosa $150 for a respray and a clear name.
- **A story**: four missions for Delia Cruz with dialogue — a harbour pickup, a courier run against the clock, a repo job on a guarded lot, and a harbour escape under three stars — then free roam with taxi fares for whoever flags you down.
- **The furniture of the genre**: HUD with money, clock and day, wanted stars, health, weapon and ammo, speedometer and car health; a circular minimap with roads, the harbour, home, objective and police blips; shops (Armería Brisa sells the pistol and rounds); a safehouse at Casa Vale that heals and saves; localStorage saves with Continue on the title screen.
- **Polish**: a full day/night cycle with lit windows, street lamps and headlight cones; particles and floating text; busted/wasted cards with fines; and a fully synthesized WebAudio soundtrack — engine, sirens, shots, jingles and a bass groove. No audio files.

## Layout

- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes the dossier with the vendored library.
- `serve.ts` — a tiny static server for local play.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `game/` — the playable game: `index.html` plus ES modules under `game/src/` (`config`, `random`, `world`, `entities`, `missions`, `audio`, `input`, `render`, `shots`, `main`).
- `screenshots/` — four real renders of this build: title, on foot, driving, and a night police chase.

## License

MIT — see `LICENSE`.
