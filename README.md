# High Ground

A mobile-first multiplayer Decentraland scene — a punch-machine championship on a
sky island, built for the Decentraland Friendzone Mobile Buildathon.

Play it: **[HIGHGROUND.dcl.eth](https://decentraland.org/play/?realm=HIGHGROUND.dcl.eth)**

This repository is the scene exactly as deployed — byte-for-byte what the
Decentraland Explorer loads when you visit that World, not a rebuild of it.

Deployed entity: `bafkreiffyvyoywvqt3ybyn5kxtlizhhysuijtnes5w7unnxz7juk7huc6m`

## What it is

Step up to the machine, charge a punch, and time the release. Everyone in the
World shares one queue and one arena screen, so a turn is a performance: the
crowd can boost or jinx the player who is up, a streak ladder escalates the show,
and the scores land on a board that outlives the session.

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

MIT
