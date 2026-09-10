# DoraHacks form — paste this

Ready to paste. Voice matches the live island.

## Project name

**High Ground**

## Tagline

A punch-machine championship on a sky island, where the crowd can save the run.

## Links

| Field | Value |
|---|---|
| Project website | `https://swissverse.org/highground/` |
| Live experience | `https://decentraland.org/play/?realm=HIGHGROUND.dcl.eth` |
| GitHub | `https://github.com/swissdclventures/high-ground` |
| World | `HIGHGROUND.dcl.eth` |

## Project description

High Ground is a persistent multiplayer arcade on a floating island in
Decentraland, built for phones first.

There is one punch machine. Everyone in the World shares one queue and one
arena screen, so a turn is a performance. You hold the gold glove, the bag
swings, a marker sweeps a band, and you let go. Power, timing and aim are
scored together. The number lands on a 16-metre curved screen, then on a board
that outlives the session.

Break 900 and your turn extends, and a multiplier ladder steps up. On a
last-chance punch that falls short, anybody who is not punching can tap HELP
and hold the green — they shove that score over 900, and they are named for
it.

There is no host, no lobby and no start time. A house bot takes a turn when
the room is empty. Under the island, clouds bounce you higher the better you
time your landings. Three secrets are hidden in the scene, one per input
channel, meant to be found by a room.

## How it was designed for mobile

The core loop is one held thumb. Charge and release. HELP for the save sits in
the same slot as PUNCH. There is no typing and no keyboard verb in the loop
that decides your score.

The HUD is one frame, taken from the Explorer's own interactable area plus the
notch inset, so nothing sits under the joystick or the jump cluster.

Decentraland Mobile is landscape-only, so a phone reports its long edge. The
compact cut-off is 940 px (not 768). A non-zero screen inset wins over width.

Copy has its own minimum size, independent of box scale. Unused on-screen
buttons and the duplicate crosshair are removed.

Desktop and mobile share one round. The score board never blocks play: if it
is slow or down, the game carries on.

## How it encourages social interaction

- One queue, one screen. Your punch is public.
- The crowd can save a run. HELP, hold the green, get named. A late hand still
  counts. The puncher cannot play their own save.
- Secrets are room-sized. Three hidden techniques, one per channel.
- A house bot plays when the room is empty, so arriving alone is still a show.

## Why people come back

- The board outlives the session. Arrive alone at 3am and you are still
  playing against everyone who was here before.
- 900 is hard (rebalanced against 20,000 simulated turns) and a casual punch
  still gets a reaction.
- Streaks and the multiplier ladder give a run a shape.
- The best things in the game need other people.
- The cloud climb is visible from above.

## Notes for judges

`JUDGE.md` is a 90-second path and a map of the seven criteria. `GAME.md` is
the rulebook. `ARCHITECTURE.md` is how the room stays one game, and how the
board is allowed to fail.

Best on a phone in landscape with sound on.
