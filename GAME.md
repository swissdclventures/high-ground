# High Ground — how the game works

The punch-machine championship on a sky island. One machine, one queue, one
board. This page is the whole rulebook: what you are trying to do, what every
number on the screen means, and what there is to do while you wait.

Every figure below is read from the **live** World `HIGHGROUND.dcl.eth` (Punch
Machine Championship, published 2026-09-10 15:26 UTC) and from the shipping
source that built it. Where a number is tunable by the venue owner, the live
venue value is given.

---

## The short version

1. Walk to the cabinet and tap **JOIN THE QUEUE**.
2. On your turn, **hold the gold glove** (bottom right, under your thumb) to
   charge, and **let go** as the marker crosses the gold band.
3. A punch scores **120–999**. **900 or more** buys you another punch on the
   same turn and steps a **multiplier ladder**.
4. Your turn ends the first time you fall short of 900 with no last chance
   left. Your **round total** — every punch, times the ladder — is what goes
   on the board.
5. If a last-chance punch falls short of 900, **THE PUSH** opens: anyone who
   is not punching taps **HELP** and holds the green. The room shoves *their
   score* over the line.

There is no Focus meter on this island. Spectators do not boost or jinx the
player who is up. The crowd's job is the save.

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
ends when your granted punches run out — unless THE PUSH is still allowed (below).

---

## The multiplier ladder

A **streak** is consecutive 900+ punches inside one turn. Each punch's score is
multiplied by the rung the streak has reached, and those multiplied points are
what your round total collects.

| Streak | 1 | 2 | 3 | 4 | 5 | 6 | 7+ |
|---|---|---|---|---|---|---|---|
| **Multiplier** | ×1 | ×2 | ×4 | ×8 | ×16 | ×32 | ×64 |

*(Live profile: "streak-rush".)*

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

## THE PUSH — the crowd save

This is the live last-chance game. It replaced the four-second sweep catch and
the Focus meter on this island.

It only opens on a **last-chance** punch that fell short of 900. The venue
allows **up to three** of these per round.

1. **3 seconds — HELP THEM?** The screen asks. Anyone who is not the puncher
   taps the **HELP** disc (it sits in the punch-button slot — there is no E
   verb for this). Tapping during the ask is the yes.
2. **10 seconds — hold the green.** The control is the same meter the room
   already knows from Focus, reused as the save: pulse to stay in the gold /
   green. The object is **their score** — a number already on screen, with a
   line at 900 everybody already understands. Extra people make the band
   *narrower*, not wider: one person can always get there; a crowd has to
   actually play.
3. **Named result.** If the room crosses 900, the streak continues and the
   people who pushed are named on the card and the board. If they come up
   short, the room is told how close it got.

A late hand is still a hand: someone who looks up two seconds in can still
join. The puncher cannot play their own save. Queued players who are not up
can.

Latency is handled the same way as the old catch: the pulse is judged on the
elapsed **you actually saw** on your own screen, not on when the message
arrived.

---

## While you wait

### You are not working a Focus bank

Focus, crowd boost and jinx are **in the source and switched off** on this
island (`focusEnabled`, `boostEnabled`, `karmaEnabled` are all false). Waiting
is watching the turn, joining THE PUSH when it opens, or climbing the clouds.

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
  are still playing against everyone who was here before you. Live venue key:
  `punch-island`.
- The all-time board is a **nice-to-have, never a dependency**: switch it off,
  misconfigure it or take it offline and the island behaves exactly the same.
  Nothing in the game loop ever waits on it.
- Changing a **gameplay** rule starts a new board. Changing sound or effects keeps
  the records.

---

## Not live (in the code, switched off)

Kept honest, because the source contains all three:

- **Focus** — a personal meter that used to lift *your* next punch to 900. Off.
  THE PUSH is the save now, and it is the *room* shoving *their* number.
- **Jinx** — the crowd's key to drag a rival's punch down. Dormant.
- **Crowd boost / High Ground** — spectators used to add points to the player who
  was up, which was the only route past 999. Replaced; the >999 path never fires
  today.
- **Karma bank** — the earlier "boost well, punch harder" bank. Retired.

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
