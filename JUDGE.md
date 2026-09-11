# For judges — High Ground

**Play it now:** <https://decentraland.org/play/?realm=HIGHGROUND.dcl.eth>

A persistent World. No scheduled host, no lobby, no start time — the machine is
standing there whenever you arrive, and the house bot takes a turn if nobody
else is in the room, so a solo visit is still a show.

You spawn on the **punch island** (World spawn `0,7`). Walk to the gold cabinet.
The same World has a dance island immediately to the east; this entry is the
punch championship.

---

## The 90-second path

On a phone, held in landscape. That is the device this was built for.

1. **Open the link.** You spawn on the sky island, facing the cabinet. There is
   no menu to clear and no tutorial to skip.
2. **Walk to the machine and tap JOIN THE QUEUE.** If the line is empty, you
   are up immediately. (There is no E-to-join.)
3. **Hold the gold glove** — bottom right, under your thumb. The bag swings and
   a marker sweeps a band. Power builds while you hold.
4. **Let go on the band.** Three channels are scored: power, timing, aim.
   Your score lands on the arena screen with a verdict card, then on the board.
5. **Watch someone else's last chance.** If a punch falls short of 900 on a
   last-chance swing, a three-second **HELP THEM?** ask opens, then ten seconds
   of holding the green. Tap the **HELP** disc (same slot as PUNCH). The object
   is their score climbing toward 900. You are named if the room gets them
   there.

If you have 30 seconds more: jump on the clouds under the island, pressing jump
again on the way down. The bounce compounds. It is how you climb back up.

Three secrets are hidden in the scene, one per input channel. They are meant to
be found by a room, not by one player — [`GAME.md`](GAME.md) keeps them behind a
spoiler fold, and carries the full rules besides.

---

## Where the seven criteria live

| Criterion | Where to look | What was actually built |
|---|---|---|
| **Mobile-First Experience** | The glove, first 10 seconds | Charge-and-release is one held thumb. No typing, no precise aim, no keyboard verb anywhere in the core loop. HELP for the save sits in the same slot. `ARCHITECTURE.md` § Mobile-first |
| **Mobile UX** | Bottom edge of the screen | One HUD frame derived from the Explorer's own `interactableArea` plus the device notch inset, so nothing sits under the joystick or jump cluster. Unused gamepad buttons and the duplicate crosshair are removed via `TouchScreenControls`. Both thumb controls land on one line |
| **Social Value** | A last-chance punch with two or more people in the room | A turn is a performance, not a solo score. Spectators are mechanically load-bearing: THE PUSH lets people who are NOT punching shove a failing score over 900, and they are named for it. See `GAME.md` |
| **Performance** | Anywhere | The hot path does not wait on a network. Desktop and mobile share one round over an HTTPS live wire because DCL's scene room does not cross those two clients — see `ARCHITECTURE.md` § Multiplayer. The all-time board is on a strict never-block contract |
| **Creativity** | The arena arc, the cloud climb, THE PUSH | A 16 m curved screen that never carries body text (it turns away from the crowd at both ends), a compounding jump-rhythm climb, a scoring curve rebalanced against 20k simulated turns, and a save whose object is the score already on screen |
| **Retention** | The board, and coming back tomorrow | Scores outlive the session and the room. The board is the async layer: you arrive alone and are still playing against everyone who was here before you |
| **Overall Execution** | This repo | Deployed, persistent, MIT, documented. `ARCHITECTURE.md` for the systems, `docs/process/` for how it was built and tested |

---

## About the source

The scene source is in this repository (`src/` and `shared/`). Clone it, run
`npm install` and `npm run build`, and you get `bin/index.js` from the TypeScript
that implements the game. No private builder access is required.

The proprietary editor used to compose the island (The Build) is a separate
product and is not part of this submission.

`ARCHITECTURE.md` explains the systems. `docs/process/` covers how it was
developed and tested, including the synthetic multiplayer harness.

---

## Snapshot

This repository's source matches The Build commit `16143f9e` (2026-09-11
21:52 UTC): HELP rings show on both screens, and a second Explorer on the
same wallet follows the punching device so house NPCs stay put.

Play it on `HIGHGROUND.dcl.eth`. Explorer runs whatever the last Builder
publish uploaded. If GitHub and the live World disagree, **the live World is
what you play**; this repo is what you clone and rebuild.

---

## Verifying it is really live

```bash
curl -s "https://worlds-content-server.decentraland.org/world/HIGHGROUND.dcl.eth/about"
```

That returns the World's realm description and spawn (`0,7`). Punch Machine
Championship is the scene whose pointers include `0,7` (base `-3,4`). Read the
entity directly:

```bash
curl -s "https://worlds-content-server.decentraland.org/contents/<scene-id>" | head -c 400
```

The entity lists every file in the live deployment with its hash.
