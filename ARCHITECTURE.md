# Architecture

High Ground is a Decentraland SDK7 scene deployed as a persistent World at
`HIGHGROUND.dcl.eth`. This document covers the systems a reader would want to
evaluate: how the room stays one game across desktop and mobile, how the
persistent board is wired so it can never take the game down with it, and what
"mobile-first" actually meant in code.

`bin/index.js` is prebuilt from a private monorepo, so this document is the
readable form of the parts that matter. Every constant and rule below is the one
that **ships in the live World** unless marked as snapshot-only.

---

## The shape of it

Live punch island (content server, 2026-09-10 15:26 UTC):

| Layer | What it is |
|---|---|
| `scene.json` | **49 parcels**, base **`-3,4`**, default spawn on the sky island at about `(56, 80.25, 60.4)`. World name `HIGHGROUND.dcl.eth` |
| `main.crdt` | the authored entities — island, cabinet, arena arc, clouds — serialised from the Builder that composed the scene |
| `bin/index.js` | the runtime: the punch machine, the coordinator, the HUD, the show |
| `assets/editor-recipe.json` | the Builder recipe the scene was composed from |
| `models/` `images/` `sounds/` `videos/` `emotes/` | the media |

The World spawn coordinate is **`0,7`**, which sits on this punch plot. A second
scene, Cloud Dance Floor, was published the same afternoon on the adjacent plot
(`4,4`, 49 parcels). This repository is the punch championship.

Requested permissions on the **live punch** scene are three, and each is
load-bearing: `ALLOW_TO_MOVE_PLAYER_INSIDE_SCENE` (the return-to-island escape
hatch), `USE_FETCH` (the all-time board **and** the HTTPS live wire),
`ALLOW_TO_TRIGGER_AVATAR_EMOTE` (the show).

`voiceChat` is enabled — the crowd is the point. `portableExperiences` is set to
`hideUi`, so a visitor's own wearable UI cannot cover the punch controls.

`authoritativeMultiplayer` is **not** set. That flag is what split desktop and
mobile onto two different DCL scene rooms. The live island does not ask DCL's
Multiplayer Server to host the round.

---

## Multiplayer: one round, two wires, no DCL game server

There is no Decentraland Multiplayer Server in the loop. Every client still
runs the same simulation. One of them is authoritative at a time.

### Election

`electCoordinator()` sorts every known peer by **session start time**, tie-broken
by user id, and takes the first. Two properties fall out of that ordering, and
both are deliberate:

- **A late joiner can never take over.** Whoever has been in the room longest
  holds the role, so arriving mid-turn cannot fork the game state.
- **It is a pure function of replicated data**, so every client independently
  elects the same peer without a negotiation round trip.

When the coordinator leaves, the next-oldest peer elects itself on the next
tick. This is why the round's mutable state — the streak count, the attempt
ceiling, the push window — lives in the *replicated snapshot* rather than in the
coordinator's local closure. Handover happens every time somebody logs off, so
anything held privately would be lost at the worst possible moment.

### The Explorer bus

Six channels on the Explorer's scene `MessageBus`: `HELLO`, `QUEUE`, `ACTION`,
`FOCUS`, `RESCUE`, `STATE`. The coordinator broadcasts a full snapshot on an
800 ms heartbeat, carrying a monotonic `revision`; clients hydrate from it and
predict locally between beats.

Peers time out after 9 s, which sweeps the queue of anyone who closed their tab.

Every message handler tolerates a peer running an **older build**: a snapshot
arriving without a named roster, an attempt cap or a push window is read as
"that feature is not present", never as an error. A World cannot force everyone
to reload at once, so mixed versions are the normal case rather than an edge one.

### The HTTPS live wire — why we talk about a server

DCL's scene room does not cross **desktop** (`fixed-adapter`) and **mobile**
(`LiveKit`) on a single-scene World. `MessageBus` rides that same split, so two
phones in the plaza can still be two games.

The live island therefore also writes the round over **HTTPS**, against the same
Postgres project as the all-time board: a state row and an action log, polled
~3 times a second. Desktop and mobile `fetch` the same rows. That is the server
in this ecosystem — a persistence API the scene already had permission to
call — not DCL hosting the simulation.

The same never-block contract as the board applies: a quiet or failing store
does not stall a frame. The coordinator still exists so an empty store, or a
store that has not been reached yet, is still a playable island.

Trust is the board's: the anon key is in the published bundle. A client can
inflate a round; it cannot delete the tables.

### Clock offset — why the save window is fair

Every peer stamps its messages in its own clock, and no two clocks in a
Decentraland realm agree. A ten-second push window judged in the
coordinator's clock would be ten seconds for the coordinator and something else
for everyone else.

The offset is a **running minimum of `received - sent`** per peer, which
converges on the true difference between the two clocks. The coordinator then
judges a tap on **when it was thrown**, not when it landed. That single
correction is the reason a player on a phone in another country can beat someone
standing next to the machine's host.

The offset is `undefined` until the first message from that peer. It is not
defaulted to zero — a peer we have never heard from has no estimate, and
pretending otherwise is a guess dressed as a fact.

### The house bot

When nobody else is in the room, a bot takes turns at the machine. It runs
**the same scoring path as a human** — no separate difficulty curve — and its id
is fixed, so a second client electing itself coordinator inherits the same bot
rather than adding a duplicate.

It exists for two reasons: a solo visitor still sees a show, and the multiplayer
behaviour can be exercised without a second headset.

---

## The board is never a dependency

Scores outlive the session. That persistence is a Postgres table read and
written over PostgREST — and it is wired under one rule:

> **If the store is switched off, unreachable, unpaid, renamed or returning
> nonsense, the island behaves exactly as it does with no store at all. Not
> degraded — identical.**

Three mechanisms enforce it, and each exists because the obvious implementation
would break the rule:

1. **Nothing is awaited by the game.** Both calls return immediately. The frame
   loop cannot be slowed or stalled by a network that has gone quiet, because it
   never learns a request happened.
2. **Every promise ends in a catch that swallows.** A rejected fetch inside a
   Decentraland system is an unhandled rejection in the scene runtime — a much
   worse outcome than a missing leaderboard.
3. **It gives up.** After 5 consecutive failures it stops asking for the rest of
   the session. A store that is down stays down for minutes, and a client that
   keeps retrying turns one outage into a retry storm from every visitor at once.

A healthy store is re-read every 45 s. Failures back off from 20 s, doubling, to
a 300 s cap. An empty result is a **permanently valid answer**, not an error to
surface — it is also the state on the very first night, which the arena screen
already draws correctly.

The parser refuses to be clever for the same reason: anything it does not
recognise becomes an empty list, because a board that shows nothing is correct
behaviour and a board that shows garbage is not.

### The key is public, on purpose

A deployed scene is a downloadable bundle, so the anon key travels with it. That
is inherent to any browser client, not a slip. The table's row-level security
therefore assumes the whole world holds the key: **select, insert and update —
and no delete anywhere.**

Update matters. Writes use `resolution=merge-duplicates`, which PostgREST issues
as `INSERT ... ON CONFLICT DO UPDATE` and which is refused outright without the
update privilege; a board granted insert alone accepts a player's first score and
silently rejects every improvement after it.

The line that actually protects the record is the missing DELETE. A public key
may add to the board and may better its own row. It may never remove anybody
from it.

---

## Mobile-first, concretely

Decentraland Mobile runs **landscape-only**, so a phone reports its *long* edge.
This is the single fact most of the mobile work turns on.

### Detecting a phone

The compact breakpoint is **940 px**, not the conventional 768. iPhone 14
reports 844, Pixel 7 reports 915, iPhone 14 Plus reports 926 — every one of them
takes the desktop branch under a 768 cutoff, which is exactly the wrong answer on
the devices this is judged on. A non-zero device inset (notch, home indicator)
wins over width outright.

### One frame, not per-control insets

A phone does not hand its whole screen to the scene. The Explorer draws a
joystick, a jump cluster, chat and a menu over the top, and reports where they
are *not* in `interactableArea`.

Every edge-anchored control on the HUD is placed inside **one** computed frame
derived from that area plus the device safe inset. Anchoring each control to its
own hand-picked number is how a HUD ends up with pieces floating at different
distances from the edges, reading as drift toward the middle of the screen.

Both areas are reported against the whole screen, and the offsets are measured
inside a safe-screen origin that has already moved in by the device inset — so
the device inset is subtracted back out of the chrome inset, or it is paid twice
and the control sits a notch's width in from where it was asked to be.

### Thumb clearance

The glove's lift off the bottom edge is **118 px**. That is not a taste value: it
is the distance that clears the Explorer's own jump cluster in the bottom-right
corner. Two stacked controls under one thumb is a tap that could land on either,
and merely abutting the jump button's edge is still a miss waiting to happen.

Both thumb controls take their lift from **one function**, so the two sides land
on a single line rather than drifting apart as either is edited.

On a last-chance save, **HELP sits in the punch-button slot**. A phone has no E.
The control that answers "help them" is the same thumb target as PUNCH.

### Trimming the control cluster

`TouchScreenControls` (SDK 7.27+) lets the scene declare which on-screen buttons
exist. The scene hides what it does not read and keeps what it does:

| Kept | Why |
|---|---|
| joystick | you walk to the machine |
| jump | the clouds and the vent are jump content |
| E / pointer | the return-to-island escape hatch |
| F | one of the three secrets, held through a charge |
| 1 and 3 | another secret, the sequence 1-3-1 |

| Removed | Why |
|---|---|
| crosshair | the game draws its own reticle, front and centre, as the hero element; a second dot beside it reads as a bug |
| buttons 2 and 4 | nothing in this scene ever reads them |

Reducing the cluster to a bare minimum would have deleted the secrets on mobile,
which is why it is trimmed by hand rather than by rule.

The call is idempotent and a no-op on desktop, so it is safe unconditionally.

### Text sizing

Box dimensions scale with the viewport. **Small copy does not** — at the 0.45
scale floor a 17 px caption renders at 8 px, which is unreadable on the exact
device the scale exists to serve. Captions go through a separate helper with a
minimum pixel floor.

---

## Scoring

```
quality = power×0.38 + timing×0.36 + aim^1.25×0.26   (+4% synergy)
score   = 120 + 879 × quality²
```

The three channels are **added, not gated**. A `min()` across them was tried and
dragged every attempt toward its weakest component, capping real play near 550.

The square on the outside is what restores the spread: the same three punches
that used to score 933 / 577 / 395 now score 872 / 358 / 206. A perfect punch
still lands on exactly the maximum, and the map is monotonic in every channel.

Over-holding is bounded rather than free. The charge is hard-capped at twice the
ideal (1700 ms) in both the manual and forced release paths, so the grace window
is 850 ms, not infinite. The plateau inside that window is deliberate: power and
timing are two clocks that one release instant cannot satisfy at once.

After the curve, 900+ needs full power, a near-centred marker and roughly 0.85
aim — so the celebration tier is an achievement again. A casual punch (sloppy
timing, 60% aim) still scores 642, so a first-timer gets a machine that answers
them.

Verified against 20,000 simulated house-bot turns: median 758 → 583, and the
900+ rate fell from 19% to 8.5%.

The timing band is 0.13 wide either side of its target — 26% of the sweep — and
the falloff runs two band-widths, so about 78% of the sweep pays something. The
target is not arbitrary: it is exactly where the marker sits at an ideal charge.

---

## The crowd

Spectators are mechanically load-bearing, not decoration.

On this island they do **not** add points to the player who is up. They save
the run.

When a last-chance punch falls short of 900, THE PUSH opens. The object is
their score — already on every screen, with a line at 900. The control is the
Focus meter reused as a save: stay in the green, the number climbs. Extra
people make the band narrower. The coordinator replays every helper's pulse
list from scratch (it does not add numbers a client asserted). Helpers with no
pulses yet still appear in the room so the puncher can see who is in.

The puncher cannot play their own save. Anyone else in the plaza can, including
late joiners.

---

## The arena screen

A 16 m curved screen, and the rule it obeys is a physical one: **big text on a
half cylinder turns away from the crowd at both ends.** So the ranked score list
is not on the arc — it is a flat HUD panel behind a SCORES button.

What the arc does carry is a verdict card at the end of a turn: name, score, tier
word, spark shower, positioned off-centre because the cabinet covers the arc's
middle.

The earlier rule was stricter — no text at all while anything is happening — and
held to the letter it turned 16 m of screen one flat colour during a punch, which
reads as a video transition and says nothing.

---

## The climb

Under the island is a spiral of clouds. Press jump on the way *down* and the
landing is read as deliberate: apexes run 1.98 m, 3.17 m, 5.10 m, then saturate.
Stop and it bleeds back down — 5.10 → 2.64 → 1.52 → 0.98 → 0.71 → 0.56.

Three decisions in there are worth naming:

- The beat is an **edge**, not a held key. A held button is not a rhythm.
- It is read **once per frame**, because two overlapping cloud discs must not
  double-count one press.
- The window opens **before** contact. A capped bounce crosses the contact band
  in a few frames, so asking for a press inside it would be a reflex test rather
  than a rhythm one.

The charge belongs to the **player**, not the cloud, because the spiral is
climbed between clouds rather than on any one of them. All three of a cloud's
answers — hold, bounce, pump — come out of one function, so they cannot drift
apart.
