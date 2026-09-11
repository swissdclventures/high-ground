# High Ground

A mobile-first multiplayer Decentraland scene — a punch-machine championship on a
sky island, built for the Decentraland Friendzone Mobile Buildathon.

Play it: **[HIGHGROUND.dcl.eth](https://decentraland.org/play/?realm=HIGHGROUND.dcl.eth)**

You spawn on the punch island (World spawn `0,7`). Walk to the cabinet. The same
World also has a dance island immediately to the east; this repository is the
punch championship.

Third-party asset credits are in [`CREDITS.md`](CREDITS.md).

**Judges: start at [`JUDGE.md`](JUDGE.md)** — a 90-second path and where each
criterion lives. [`GAME.md`](GAME.md) is the rulebook. [`ARCHITECTURE.md`](ARCHITECTURE.md)
covers how the room stays one game (coordinator + HTTPS live wire), the
persistent board's failure contract, and the mobile layout rules.
[`docs/process/`](docs/process/) covers how it was built and tested.

## What it is

Step up to the machine, join the queue, hold the gold glove, and time the
release. Everyone in the World shares one queue and one arena screen, so a turn
is a performance. A punch of 900+ extends your turn and steps a multiplier
ladder. If a last-chance punch falls short, the room can **push the score over
900** — a three-second ask, then ten seconds of holding the green on the same
meter the game already taught. The people who did the work are named. Scores
land on a board that outlives the session. Full rules in [`GAME.md`](GAME.md).

It is designed for Decentraland Mobile first — the controls, the readable text
sizes and the thumb clearance are all built around a phone held in landscape,
rather than a desktop layout shrunk down.

## Run it locally

```bash
npm install
npm run build
npm start
```

High Ground ships with the TypeScript required to build the submitted
Decentraland scene. `npm run build` compiles `src/` (and `shared/`) into
`bin/index.js` using the public `@dcl/sdk`. No access to The Build editor or
any private monorepo is required.

`npm start` boots the compiled scene in the Decentraland preview. The SDK
preview may temporarily write `authoritativeMultiplayer` into `scene.json`;
`npm run build` strips that flag so a deploy matches the live World (desktop
and mobile in one round).

The scene was composed with **The Build**, a separate proprietary editor. That
tool is not part of this repository and is not needed to build, modify, or
run the game.

## Deploy it to a World you own

```bash
npx sdk-commands deploy --target-content https://worlds-content-server.decentraland.org
```

Set your own destination in `scene.json` first. Deploying signs with your wallet.

## What is in here

| Path | What it is |
|---|---|
| `src/` | High Ground scene source (punch game, HUD, coordinator, island boot) |
| `shared/` | contracts and pure game logic the scene imports |
| `data/asset-metadata.json` | grid/material metadata imported by shared types |
| `scene.json` | the scene manifest — title, parcels, spawn points |
| `bin/index.js` | compiled scene runtime (`npm run build` regenerates this) |
| `main.crdt` | the authored entities the runtime loads at start |
| `assets/editor-recipe.json` | the recipe the scene was composed from |
| `models/`, `images/`, `sounds/`, `videos/`, `emotes/` | the media the scene references |

`scene.json` still carries the display title *"Punch Machine Championship"*, the
name this scene shipped under before it became High Ground.

## About the source

This repository is the open-source High Ground scene. Fork it, change scoring
or THE PUSH in `shared/` / `src/plugins/`, and run `npm run build`.

The Build editor (Swissverse's scene builder) is a separate product and is not
included here.

Built with **The Build** by [Swissverse](https://swissverse.org).

## License

MIT — see [`LICENSE`](LICENSE).
