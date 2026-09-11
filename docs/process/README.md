# How this was built

Notes on process rather than architecture. For the systems themselves, see
[`ARCHITECTURE.md`](../../ARCHITECTURE.md).

---

## Where the code lives

The High Ground scene source is in this repository: `src/` for the SDK7 scene
and `shared/` for the contracts and scoring/coordinator logic it imports.

```bash
npm install
npm run build
npm start
```

The island was composed with The Build, a separate proprietary editor. That
editor is not required to build or change this game. The reasoning behind the
systems is in `ARCHITECTURE.md`.

---

## Testing

The scene's systems were covered by a vitest suite during development. The files
specific to this game include:

```
punch-arc-quake              punch-multiplayer
punch-arena-no-video         punch-queue-and-blast
punch-arena-screen-tiers     punch-queue-rotation
punch-arena-verdict          punch-scoreboard-panel
punch-crowd-boost            punch-show-wiring
punch-deck-and-reveal        punch-streak-rescue
punch-focus-signals          punch-thumb-controls
punch-hot-reload             punch-turn-clock-and-crowd
punch-house-bot-performer    punch-score-spread (shared)
punch-karma-ring             punch-lamp-bond-and-reveal
punch-push                   punch-push-runtime
```

### The multiplayer harness

The interesting one is `punch-multiplayer`. The coordinator has **exactly one
dependency on the Explorer** — the `MessageBus` import — because everything else
comes from a shared pure contract module. That made the whole thing testable for
three optional arguments (`bus`, `now`, `random`, all defaulting to the real
thing) plus a vitest alias pointing `@dcl/sdk/message-bus` at a stub.

THE PUSH (the live last-chance save) is covered the same way in `punch-push` and
`punch-push-runtime`: the coordinator replays every helper's pulse list from
scratch, an empty yes still grades, and quality is walked to *elapsed* time so a
live bar can die when someone leaves the green.

The result is a synthetic island: N clients, a known clock, replayable dice. Eight
of the ten multiplayer scenarios we wanted to check now run in 86 ms. The other
two need hands — a real phone and a real deploy.

Two rules that harness has to obey, learned the hard way:

- **A scene bus does not echo to its sender.** Every send handles its own message
  locally and *then* emits. A fake hub that delivered back to the sender would
  double-apply every join and every punch, and the suite would go green while
  proving the opposite. One test exists purely to hold the harness to this.
- **The stub throws when touched rather than no-op'ing.** A test that forgets to
  inject a bus fails on the line that made the mistake, instead of silently
  testing one lonely client.

The tests were mutation-checked rather than trusted: making `electCoordinator`
return `me` unconditionally turns three of them red — which is exactly the
failure mode they exist to catch (late joiners forking the game state).

---

## Balance work

Scoring was tuned against measurement, not feel. The scoring function was probed
directly through its shared implementation across a grid of charge / marker / aim
values, and the house bot — which runs the identical scoring path — was used as
a 20,000-turn simulator to check the shape of the distribution rather than a
handful of anecdotes.

That is how the score compression got caught: three visibly different punches
were landing on 933 / 577 / 395, which is far too flat at the top. The fix was a
squared quality curve, and `punch-score-spread` now pins the result so nobody
"fixes" the deliberate plateau back out.

---

## Mobile verification

Everything measurable about the mobile layout is unit-tested — the breakpoint,
the frame arithmetic, the thumb clearance, the trimmed control cluster
(`punch-thumb-controls`).

What is **not** verifiable from a development machine: the local preview server
emits a desktop-client link only. Real-device checking happens through the
Creator Hub's mobile preview QR on an actual phone, and that is a manual step
before every deploy. Measuring on a real device is the only thing that settles a
mobile question — a simulated narrow viewport is not a phone.

The single most expensive bug of the project came from ignoring exactly that: the
compact breakpoint sat at 768 px for weeks while Decentraland Mobile runs
landscape-only and reports a phone's long edge (844–926 px). Every mobile
affordance in the HUD was silently taking the desktop branch on the phones the
scene is built for.

---

## Decisions that are pinned

A few things in the codebase look like bugs and are not. They carry tests so
they survive a future reader's good intentions.

| Looks wrong | Why it is right |
|---|---|
| The charge curve plateaus near the top | Power and timing are two clocks one release instant cannot satisfy at once. Bounded by a hard cap at 2× ideal, so the grace window is 850 ms |
| Score channels are added, not gated | A `min()` gate drags every attempt to its weakest channel and caps real play near 550 |
| The ranked list is not on the 16 m arena arc | Big text on a half cylinder turns away from the crowd at both ends |
| The board's client swallows every error | An unhandled rejection in a scene system is far worse than a missing leaderboard |
| The board's write key is public | A deployed scene is a downloadable bundle. The protection is the missing DELETE grant, not secrecy |
| Peer clock offset starts `undefined`, not `0` | A peer never heard from has no estimate; zero would be a guess dressed as a fact |
