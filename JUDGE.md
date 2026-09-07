# For judges — High Ground

**Play it now:** <https://decentraland.org/play/?realm=HIGHGROUND.dcl.eth>

A persistent World. No scheduled host, no lobby, no start time — the machine is
standing there whenever you arrive, and the house bot takes a turn if nobody
else is in the room, so a solo visit is still a show.

This repository is a snapshot of that deployment. The World is redeployed as the
scene changes, so the authoritative scene id is always the one the content
server reports — see **Verifying it is really live** at the bottom.

---

## The 90-second path

On a phone, held in landscape. That is the device this was built for.

1. **Open the link.** You spawn on the sky island, facing the cabinet. There is
   no menu to clear and no tutorial to skip.
2. **Walk to the machine and press E** (the on-screen E button). You are in the
   queue. If the line is empty, you are up immediately.
3. **Hold the gold glove** — bottom right, under your thumb. The bag swings and
   a marker sweeps a band. Power builds while you hold.
4. **Let go on the band.** Three channels are scored: power, timing, aim.
   Your score lands on the arena screen with a verdict card, then on the board.
5. **Watch someone else's turn.** Stay in the queue and work the meter with E:
   you bank Focus for your OWN next punch, and if a punch of yours later falls
   short of 900 with a streak alive, Focus lifts it back to the threshold. If a
   rival's streak breaks, a four-second window opens and anyone NOT in the queue
   can reach for the catch and be named for it.

If you have 30 seconds more: jump on the clouds under the island, pressing jump
again on the way down. The bounce compounds. It is how you climb back up.

Three secrets are hidden in the scene, one per input channel. They are meant to
be found by a room, not by one player — [`GAME.md`](GAME.md) keeps them behind a
spoiler fold, and carries the full rules besides.

---

## Where the seven criteria live

| Criterion | Where to look | What was actually built |
|---|---|---|
| **Mobile-First Experience** | The glove, first 10 seconds | Charge-and-release is one held thumb. No typing, no precise aim, no keyboard verb anywhere in the core loop. `ARCHITECTURE.md` § Mobile-first |
| **Mobile UX** | Bottom edge of the screen | One HUD frame derived from the Explorer's own `interactableArea` plus the device notch inset, so nothing sits under the joystick or jump cluster. Unused gamepad buttons and the duplicate crosshair are removed via `TouchScreenControls`. Both thumb controls land on one line |
| **Social Value** | A turn with two or more people in the room | A turn is a performance, not a solo score. Spectators are mechanically load-bearing: a broken streak can be caught by somebody who is NOT competing, inside a fair, clock-corrected window, and they are named for it on the screen and the board. Waiting is its own game — the Focus meter banks a rescue for your own next turn. See `GAME.md` |
| **Performance** | Anywhere | Peer-to-peer over the scene message bus, no server in the hot path. The all-time board is on a strict never-block contract — see `ARCHITECTURE.md` § The board is never a dependency |
| **Creativity** | The arena arc and the cloud climb | A 16 m curved screen that never carries body text (it turns away from the crowd at both ends), a compounding jump-rhythm climb, and a scoring curve rebalanced against 20k simulated turns |
| **Retention** | The board, and coming back tomorrow | Scores outlive the session and the room. The board is the async layer: you arrive alone and are still playing against everyone who was here before you |
| **Overall Execution** | This repo | Deployed, persistent, MIT, documented. `ARCHITECTURE.md` for the systems, `docs/process/` for how it was built and tested |

---

## About the source

`bin/index.js` is prebuilt and does not rebuild in isolation. It was compiled
from a larger private monorepo — a scene builder — and imports shared modules
from it. What is in this repository is the artifact that actually runs on
`HIGHGROUND.dcl.eth`, byte for byte.

We would rather be straight about that than ship a repository that does not
build. So instead of a partial source dump, `ARCHITECTURE.md` documents the
systems a judge would want to evaluate — the multiplayer coordinator and its
election, the clock-offset correction, the failure contract on the persistent
board, and the mobile control and layout decisions — at the level of the actual
constants and the actual rules, with the reasoning for each.

`docs/process/` covers how it was developed and how it is tested, including the
synthetic multiplayer harness that runs a whole island of clients without a
second headset.

---

## Verifying it is really live

```bash
curl -s "https://worlds-content-server.decentraland.org/world/highground.dcl.eth/about" | head -40
```

That returns the World's realm description and the current scene id, which you
can then read directly:

```bash
curl -s "https://worlds-content-server.decentraland.org/contents/<scene-id>" | head -c 400
```

The entity lists every file in the live deployment with its hash. This
repository is a snapshot of one such deployment; where the live World has been
redeployed since, the delta is media added to the island, not a different game.
