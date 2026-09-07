# High Ground — how the game works

The punch-machine championship on a sky island. One machine, one queue, one
board. This page is the whole rulebook: what you are trying to do, what every
number on the screen means, and what there is to do while you wait.

Every figure below is read from the shipping source — `shared/punch-machine-contract.ts`,
`shared/punch-game-profile.ts` and `shared/punch-challenge.ts`. Where a number is
tunable by the venue owner, the default is given.

---

## The short version

1. Walk to the cabinet and press **E** (or the on-screen E) to join the queue.
2. On your turn, **hold the glove** to charge, and **let go** as the marker
   crosses the gold band.
3. A punch scores **120–999**. **900 or more** buys you another punch on the
   same turn and steps a **multiplier ladder**.
4. Your turn ends the first time you fall short of 900. Your **round total** —
   every punch, times the ladder — is what goes on the board.
5. While you wait, work the **Focus meter**. It stores points for *your* next
   turn, not for the player who is up.

---

## Players, turns and time

| Question | Answer |
|---|---|
| **Maximum players?** | No cap. The queue is unbounded — everyone in the World shares one line, and there is no "room full". What limits a session is Decentraland's own per-scene population, not the game. |
| **Maximum turns?** | A turn starts at **3 punches**. Every punch of 900+ adds one more, with no practical ceiling: the guard sits at **99 punches**, and it is a runaway guard rather than a rule you are meant to meet. The difficulty ramp ends a turn long before it. |
| **How long is a turn?** | Each punch has a **20 s** timer, with a **10 s** visible countdown. Let it run out and the turn passes on. |
| **Waiting between punches** | The score reveal is **1.08 s hold + 2.6 s count-up + 0.6 s linger**, then the machine reloads: **1.7 s** normally, **1.0 s** after a 900+, dropping **120 ms** per streak rung to a floor of **0.64 s**. A hot streak is deliberately faster than a cold one. |
| **Nobody in the room?** | A house regular takes a turn on its own — the attract show — so a solo visit is still a show. Its scores never touch the board. |

---

## One punch, in detail

Three channels are scored, and all three are yours:

| Channel | Weight | What it measures |
|---|---|---|
| **Power** | 38% | How close your hold was to the ideal charge (**850 ms**). Over-hold and it bleeds away. |
| **Timing** | 36% | How near the gold band the marker was when you released. |
| **Aim** | 26% | Where on the leather your pointer was. |

Land all three and a **4% synergy bonus** is added on top. The finished quality is
squared before it is scaled, so the top of the range is genuinely hard to reach —
one punch runs **120 at the floor to 999 at the ceiling**.

Your **stance** matters before any of that: standing outside the strike zone, or
off-centre, or not facing the bag, costs up to **20% of power**. Inside 35 cm and
25° is treated as perfect.

**999 is the hard ceiling on a single punch.** No mechanic in the live game puts a
fourth digit on the cabinet.

---

## What 900 means

900 is the game's one threshold, and it deliberately carries **four** meanings at
once — one number to learn, four consequences:

1. **It extends your turn.** A punch of 900+ grants one more punch on the same
   round.
2. **It steps the multiplier ladder** (below).
3. **It shortens the reload** — the machine comes back in 1.0 s instead of 1.7 s,
   and faster still deeper into a streak.
4. **It is the celebration line.** The crowd, the lights and the arena arc all
   read it. House regulars are capped below it on purpose: celebrations belong to
   people.

Fall short of 900 and the streak breaks, the ladder resets to ×1, and the turn
ends when your granted punches run out.

---

## The multiplier ladder

A **streak** is consecutive 900+ punches inside one turn. Each punch's score is
multiplied by the rung the streak has reached, and those multiplied points are
what your round total collects.

| Streak | 1 | 2 | 3 | 4 | 5 | 6 | 7+ |
|---|---|---|---|---|---|---|---|
| **Multiplier** | ×1 | ×2 | ×4 | ×8 | ×16 | ×32 | ×64 |

*(Default profile, "streak-rush". The "classic" profile runs ×1, ×1, ×2, ×3, ×4.)*

A ×64 rung on a 950 punch is 60,800 points from one swing — which is the point.
The ramp below makes a long streak dramatically harder than a short one, so the
reward is shaped like the difficulty rather than like the score.

**The golden ball.** Every **3rd** streak rung arms the next ball gold, and a gold
ball **doubles the ladder** for that punch (not the 0–999 score — that is already
clamped). It disarms itself on the punch it lands on.

---

## Does it get harder? Yes — three dials

All three start from the **second** punch of a turn and compound:

| Dial | Default | What it does |
|---|---|---|
| **Marker speed** | +4% per punch, capped at **×1.3** | The sweep gets quicker. Capped on purpose: past a point, extra speed removes skill instead of raising it — the gold band always stays wide enough to react to. |
| **Marker variance** | +12% per punch, up to fully irregular | The marker stops reversing in the same places. The rhythm cannot be counted, only read. This is the dial with no ceiling problem, and it is the real difficulty. |
| **Difficulty bonus** | gain **7**, capped **×16** | The flip side. Holding *past* the ideal charge makes the release harder and pays a multiplier for it — but **only if your timing lands at 0.9 or better**. A risky hold that is sloppy pays nothing. |

So a turn that goes deep is not the same game as the first three punches. It is
faster, arrhythmic, and it offers you a bet you may take or refuse on every punch.

---

## While you wait: the side games

### Focus — the meter (press E / tap)

The tap meter beside the machine is the waiting game. **It never helps the player
who is up.** It stores **Focus, 0–100**, for *your* own next turn.

- It is a **balance, not a mash**. Each tap pushes the level up by a fixed
  impulse; the level bleeds away exponentially. Overshoot past the zone earns
  nothing.
- The still point **moves** — two out-of-phase drifts plus gusts, repeating only
  after about 180 s, so no fixed tapping rhythm ever solves it. You have to keep
  reading the bar.
- **Green** pays **12 Focus per second**. Time in the **yellow zone** pays half.
  Inside the **gold ring** the rate **doubles to 24/s**. A full bar is about
  **8 seconds** of perfect green.
- ‼️ **You must be in the queue to bank it.** Working the meter as a pure
  spectator earns nothing, and the meter says so.
- Focus survives **60 seconds** outside the queue — a fall, a cloud, a knock-back.

**What it buys:** at the moment of contact, if you have a live streak and the punch
fell short of 900, Focus is spent automatically to lift it **exactly** to 900 —
never in part, never on a punch that already made it, never when there is no
streak to protect. It shows on the result card as a gold `FOCUS +28` row.

### Momentum — beat a regular

With Focus **full**, beat one of the island's regulars in the boxing side-game
(Scrap). That arms **Momentum**: your golden ball comes after your **first** 900+
of the turn instead of the third. It is consumed by the punch it arms. No points,
no multiplier — just earlier entry into a bonus that already exists.

### The fumble save — for spectators only

When a punch breaks a streak worth saving, a **4-second window** opens, and the
number is already on screen so the whole room knows what is at stake. A marker
sweeps at 1 Hz and the catch band is about **41 ms** wide. First reach wins, one
try each, and the rescuer is **named** on the card, the marquee and the board.

‼️ Only people **not in the queue** may reach for it. A competitor cannot save a
rival — this is the game for whoever is sitting in the plaza.

Latency is handled properly: the reach is judged on the elapsed **you actually
saw** on your own screen, not on when the message arrived, so a phone on mobile
data races fairly against a desktop standing next to it.

### The cloud climb

The clouds under the island are a rhythm game of their own. Jump on one, and press
jump again on the way down — the bounce compounds. It is how you get back up after
a fall, and it is the only way up.

### Three secrets

There are three hidden techniques, one per scoring channel — aim, timing, power.
They are taught nowhere in the UI: the island's regulars **whisper** them, one
murmur every few minutes, to whoever is standing nearby. They are meant to be
found by a room and passed between people. Exact inputs are at the bottom of this
page if you would rather not wait.

---

## The boards

- **The live board** — this session's rounds, ranked, on the arena screen. It ranks
  *rounds*, so a turn split across two visits keeps growing one row rather than
  filling the board with fragments.
- **The all-time board** — outlives the session and the room. You arrive alone and
  are still playing against everyone who was here before you.
- The all-time board is a **nice-to-have, never a dependency**: switch it off,
  misconfigure it or take it offline and the island behaves exactly the same.
  Nothing in the game loop ever waits on it.
- Changing a **gameplay** rule starts a new board. Changing sound or effects keeps
  the records.

---

## Not live (in the code, switched off)

Kept honest, because the source contains all three:

- **Jinx** — the crowd's key to drag a rival's punch down. Dormant by owner
  decision; the code is kept against a future rare mode.
- **Crowd boost / High Ground** — spectators used to add points to the player who
  was up, which was the only route past 999 (the "High Ground" event layer above
  1000). Replaced by Focus in September 2026, so the >999 path never fires today.
- **Karma bank** — the earlier "boost well, punch harder" bank. Retired; the gold
  ring is Focus's accelerator and nothing else.

---

## Spoilers — the three secrets

<details>
<summary>Open only if you want them</summary>

- **Seam (aim).** The bag's idle spin is a clock. Release while the seam faces you
  — yaw ≈ 180°, ±24° — and the aim channel is multiplied by up to **1.08**.
- **Knock (timing).** Tap **1-3-1** near the machine inside 2.5 s. The machine
  answers with a low rattle and a shiver; your next punch's marker is snapped
  **40% toward the sweet spot**. Good for 15 s, one punch.
- **Twist (power).** Hold **F** within 400 ms of releasing. An early release is
  pulled **40% toward the ideal charge** — no effect at or after the plateau. This
  is the visible one: the release becomes a two-handed shove.

</details>
