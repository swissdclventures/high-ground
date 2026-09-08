# High Ground

A mobile-first multiplayer Decentraland scene — a punch-machine championship on a
sky island, built for the Decentraland Friendzone Mobile Buildathon.

Play it: **[HIGHGROUND.dcl.eth](https://decentraland.org/play/?realm=HIGHGROUND.dcl.eth)**

This repository is a snapshot of the scene as deployed — the files the
Decentraland Explorer actually loads when you visit that World, not a rebuild of
them. Snapshot taken 2026-09-09, from the deployment of 2026-09-08 21:21 UTC.
The World is redeployed as the scene changes, and the content server always
holds the authoritative copy.

Third-party asset credits are in [`CREDITS.md`](CREDITS.md).

**Judges: start at [`JUDGE.md`](JUDGE.md)** — a 90-second path and where each
criterion lives. [`GAME.md`](GAME.md) is the rulebook — every number on the
screen, the side games and what 900 means. [`ARCHITECTURE.md`](ARCHITECTURE.md)
covers the multiplayer coordinator, the persistent board's failure contract and
the mobile layout rules. [`docs/process/`](docs/process/) covers how it was built
and tested.

## What it is

Step up to the machine, charge a punch, and time the release. Everyone in the
World shares one queue and one arena screen, so a turn is a performance: a punch
of 900+ extends your turn and steps a multiplier ladder, the crowd can catch a
broken streak inside a four-second window, and the scores land on a board that
outlives the session. Full rules in [`GAME.md`](GAME.md).

It is designed for Decentraland Mobile first — the controls, the readable text
sizes and the thumb clearance are all built around a phone held in landscape,
rather than a desktop layout shrunk down.

## Run it locally

```bash
npm install
npm start
```

## Deploy it to a World you own

```bash
npx sdk-commands deploy --target-content https://worlds-content-server.decentraland.org
```

Set your own destination in `scene.json` first. Deploying signs with your wallet.

## What is in here

| Path | What it is |
|---|---|
| `scene.json` | the scene manifest — title, parcels, spawn points |
| `bin/index.js` | the scene runtime, prebuilt |
| `main.crdt` | the authored entities the runtime loads at start |
| `assets/editor-recipe.json` | the Builder recipe this scene was composed from |
| `models/`, `images/`, `sounds/`, `videos/`, `emotes/` | the media the scene references |

`scene.json` still carries the display title *"Punch Machine Championship"*, the
name this scene shipped under before it became High Ground.

## About the runtime

`bin/index.js` is prebuilt. It was compiled from a larger monorepo and imports
shared modules from it, so it does not rebuild in isolation — what is here is the
artifact that actually runs, which is the thing worth sharing and inspecting.

Built with **The Build** by [Swissverse](https://swissverse.org).

## License

MIT — see [`LICENSE`](LICENSE).
