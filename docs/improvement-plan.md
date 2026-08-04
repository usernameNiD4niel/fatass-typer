# Improvement plan

Written 2026-08-04, after playing Map 1 and measuring the result against the
playtest harness.

## What the game currently is

100 seconds of Map 1, played at 45 WPM: **one** obstacle. Everything else was
flow words over an empty road — type them, nothing happens, nothing arrives, the
run continues. Score reached 6,845 and combo 13× from actions that carried no
stake at all.

Measured with `playtest-harness`, seed `shape`, each map at its advertised speed:

| Map | Duration | Hazards | One real moment every |
| --- | -------- | ------- | --------------------- |
| 1   | 163s     | 7       | **23.3s**             |
| 2   | 167s     | 8       | 20.9s                 |
| 3   | 160s     | 12      | 13.3s                 |
| 4   | 161s     | 12      | 13.4s                 |
| 5   | 155s     | 13      | 11.9s                 |
| 6   | 149s     | 19      | 7.8s                  |

That is the diagnosis in one table. Map 1 is a 2.7-minute run containing seven
moments that matter. The rest is filler that has been dressed up as content.

**After 1.1** (same harness, same seeds, all 918 tests passing):

| Map | Duration | Hazards | One real moment every | Characters typed |
| --- | -------- | ------- | --------------------- | ---------------- |
| 1   | 159s     | 8       | 19.9s                 | 231              |
| 2   | 157s     | 9       | 17.4s                 | 280              |
| 3   | 150s     | 14      | 10.7s                 | 345              |
| 4   | 146s     | 14      | 10.4s                 | 380              |
| 5   | 139s     | 18      | 7.7s                  | 423              |
| 6   | 133s     | 22      | 6.1s                  | 490              |

Every map's secret sentence now completes; none did before on Maps 1–5. Coins
dropped is zero everywhere. Typing occupancy is 0.86–0.92 of what continuous
typing at the map's advertised speed would produce.

## Diagnosis

1. **Stakes density near zero.** Over 90% of keystrokes have no consequence.
   Flow words exist to fill dead air, but filling dead air with
   consequence-free typing teaches the player that typing does not matter.
2. **The road is empty.** No traffic, no props, no events, no landmarks.
   Buildings slide past. Nothing to look at, so nothing to feel.
3. **No payoff on success.** Clearing a hazard changes a number in a corner. No
   camera punch, no whoosh, no near-miss beat, no debris. The best moment in
   the game has no moment.
4. **Score is inflated.** Free words pay the same combo as hazards, so the
   number means nothing.
5. **No visible, continuous threat.** The dogs were deleted and nothing replaced
   them. The only pressure is an invisible deadline. Runners are addictive
   because the threat is on screen and always closing.
6. **Failure is binary, instant, and three minutes expensive.** One miss ends
   everything. Punishing without being exciting.
7. **Speed is not rewarded.** Clearing at target WPM and clearing at twice
   target produce identical outcomes. The game gives the player no reason to
   get faster — fatal, given that is the whole point.
8. **Nothing persists.** In-memory storage only. Close the tab and it is gone.
9. **The eye is locked on the vanishing point.** The word sits small and far at
   screen centre, so the 3D scene is wallpaper.
10. **Flat difficulty within a run.** Second 10 is identical to second 150.

## Phase 1 — make it a game

Nothing else matters until this ships.

- [x] **1.1 Raise hazard density.** Shipped — see "How 1.1 actually went" below.
      The route this plan proposed was wrong.
- [x] **1.2 Reward speed continuously.** Shipped — see "How 1.2 went" below.
- [x] **1.3 Restore a visible chaser.** Shipped — see "How 1.3 went" below.
- [x] **1.4 Impact feedback.** Shipped — see "How 1.4 went" below. Floating score
      labels and a margin-sized camera punch. Speed lines and the vignette are
      not done; chromatic split is dropped (it needs a post-processing pass, and
      this project ships no extra render dependencies).
- [x] **1.5 One-click start.** Done. The game screen's own "Start run" is gone:
      the briefing click already gives the document sticky user activation, which
      is what `AudioContext.resume()` actually needs, so the second button was
      asking the player to confirm a decision they had already made on a screen
      that looked exactly like the game. The button still appears when the run is
      genuinely stopped, after a crash or a finish.

## How 1.1 actually went

**The premise of 1.1 was wrong.** Killing gap words was tried first and made
things worse: hazard density rose, but typing volume and occupancy both fell,
because gap words were carrying 39% of the run's characters.

The real cause was one term in the hazard spawner's gate: it waited on
`session.flow !== null`. The filler invented to cover the gaps was itself
creating them — about 3.5s of delay per encounter on Map 1. A gap word has no
body, so there is nothing for a hazard to collide with, and dropping one costs
nothing. Deleting that single term is the whole fix.

Three changes shipped:

1. Gap words no longer block the hazard spawner, nor the coin spawner.
2. `FLIGHT_MS` 30s → 6s. Flight suspends hazards and waives any whose window
   passes during it, so it was deleting about a fifth of a Map 1 run — two of
   seven hazards — and handing the player nothing to type. A reward in a typing
   game cannot be an absence of typing.
3. A due coin line or crate now outranks a hazard. Without it, hazards took every
   gap the moment they stopped waiting for gap words, and pickups starved to zero
   on Maps 1 and 2.

Two pre-existing bugs surfaced once encounters came close together, both fixed:

- A coin line placed while the player was still airborne from a just-resolved
  hazard armed its word, `beginLaneChange` refused (a jump cannot be steered out
  of), and every coin passed underneath somebody who had typed for them. Coins
  now wait for the body, not just for the road.
- `commitToCoins` asked for its swerve exactly once, so a refusal lost it
  permanently. Hazards were given a retry when this same bug was found there;
  coins never were. `retryCoinSwerve` closes it.

**Remaining ceiling.** Map 1 sits at ~20s per hazard and will not go lower by
tuning: a 20 WPM word takes ~5s to type, its body ~4s to arrive, and coin lines
own most of the rest. Reaching 4–6s there needs a structural change to the
one-encounter-at-a-time rule, which is load-bearing for the fairness guarantees.
Not attempted.

## How 1.2 went

Clearing a hazard used to pay the map's full `boost.speedMultiplier` regardless
of how it was cleared, so typing at 20 WPM and at 60 produced identical speed.
Both halves of the reward now scale with **margin** — the fraction of the
hazard's own budget still unspent when the word was finished. Normalised against
the budget rather than measured in absolute seconds, so it asks how decisively
the deadline was beaten, not how long the word happened to be.

- **Score:** a new `marginBonusMax` term, paid on `margin²`. Squared, because a
  linear reward pays a scraped clear nearly as well as a decisive one — and the
  game already had that in `remainingTimeBonus`. At 250 it is the largest single
  term available on a hazard, which it has to be: clearing at all is already a
  pass.
- **Speed:** `boostMultiplier` scales linearly with margin, never above the map's
  configured ceiling. The ceiling matters — `placementSpeed` measures hazard
  placement against it, so a boost that could exceed it would let the player
  arrive early at a deadline that assumed they could not.

Gap words are explicitly excluded from the margin bonus. It is the biggest
reward in the game and they cost nothing to miss; paying it there would recreate
the free-points problem 1.1 existed to fix.

**The band had to be calibrated, not assumed.** Measured across all six maps at
1×, 1.25×, 1.6× and 2.2× target speed, real margins run 0.24 to 0.67 and never
approach 1 — typing the word is most of what the budget is for. Mapping raw
margin onto the boost range wasted over half of it: a target-speed typist got
1.13× of an available 1.55×, and the cap was unreachable by anyone. Stretching
the attainable band (`MARGIN_BAND_FLOOR`/`CEILING`) across the full range fixes
that, with a `MARGIN_FLOOR_SHARE` so a typist at exactly the advertised speed is
never left unboosted — they are the audience the map was written for.

Resulting boost, and run time, by typing speed:

| Map | 1× target  | 1.25×      | 1.6×       | 2.2×       |
| --- | ---------- | ---------- | ---------- | ---------- |
| 1   | 1.23× 166s | 1.34× 162s | 1.49× 160s | 1.55× 158s |
| 3   | 1.28× 166s | 1.36× 159s | 1.44× 152s | 1.55× 149s |
| 6   | 1.30× 160s | 1.55× 151s | 1.65× 140s | 1.70× 131s |

A fast typist now finishes Map 6 18% quicker than a target-speed one. Every
speed still finishes every map.

## How 1.4 went

The rules already knew what every word was worth and what every mistake cost,
and said none of it. Score was a number in a corner that changed by an
unexplained amount, so a decisive clear and a scraped one looked identical and a
mistyped character cost points silently. 1.2 made speed pay; this is what makes
the payment visible.

**Floating score labels.** Every completed word puts a `+N` over the road where
it happened, and every wrong character puts a `−5` there. The penalty is shown
on the keystroke that caused it even though it is not charged until the prompt
finishes — a cost explained three seconds after the fact teaches nothing about
the keystroke.

They travel in `WorldSnapshot`, not through the event bus. These are spawned by
keystrokes, and pushing a React event per mistyped character through a bus that
exists to throttle traffic would be working against it. A fixed pool of six slots
recycles oldest-first, so mistyping quickly never hides the newest number, and
nothing allocates per frame.

**Camera punch.** Clearing a hazard kicks the field of view by up to 9°, scaled
by the same margin that pays the score and the boost — so the size of the kick is
the feedback. It is tracked separately from the speed-driven `fovBias` because
they answer different questions: the bias is how fast you _are_ going and eases;
the punch is the moment you earned it and must not. A mistake gets a small shake
instead.

Colour is never the only signal: a gain carries a leading `+` and a loss a `−`,
so the two are distinguishable without seeing colour at all. Reduced motion drops
the rise and the punch and keeps the labels.

Two bugs found by looking at it rather than by testing it:

- Labels drew the raw float — the first one on screen read
  `+654.4791532272574`. Rounded at the source, where the HUD already rounds.
- A label from a finished run hung over the new road after a restart. They age on
  wall-clock time, so a stopped run has no frames left to age them with; the pool
  is now cleared on restart.

**Not done:** speed lines and the edge vignette. Chromatic split is dropped — it
needs a post-processing pass and a new render dependency, which this project does
not take.

## How 1.3 went

`game-core/pursuit` — a gap in metres, and at zero the run ends. It has its own
README; the short version follows.

**It invents no new currency.** The gap responds to the same **margin** that pays
the score and the boost, so there is one thing to get good at and three things
that reward it. Clear decisively and it falls back; scrape past, mistype, or let
a gap word lapse and it closes. **A declined coin line moves it not at all** —
coins are the only optional thing in the game and that is true only while
declining them is free.

The scene draws it behind the player, in their lane, with an emissive grille that
brightens as it closes. At the full gap it sits behind the camera, deliberately:
a threat permanently in frame stops being read after a minute, and this one
arrives exactly when it matters. The HUD carries a "Chaser" meter reading
Behind / Closing / On you — a word rather than a percentage, because "68% caught"
is not something a player can act on, and so the danger is never colour-only.

**The break-even point had to be measured, not chosen.** The first build set it
at the margin a typist at the advertised speed actually clears with (0.30), and
that killed the entire tolerance band: a typist at 85% of target was caught 8
runs out of 8 on every map. A map promises a floor, not a ceiling, so break-even
belongs below the band rather than at its top. At 0.10:

| Error rate at target speed | Outcome                 |
| -------------------------- | ----------------------- |
| 0%                         | finishes every time     |
| 3%                         | finishes every time     |
| 6%                         | **caught** in most runs |
| 10%                        | dead                    |

A clean run is never threatened; an inaccurate one is hunted down. Accuracy is
what the unlock gates read, so the chaser and the progression now want the same
thing from the player.

It follows that the chaser is nearly inert against the metronomic typist in
`playtest-harness`, which never mistypes — every map-progression guarantee passes
unchanged. That is not the feature doing nothing; it is the harness modelling a
player who does not make the mistake the feature punishes.

**Not done:** the results screen still says "Crashed" when the chaser catches
you. `RunResult` carries no failure reason, and adding one is a persisted-shape
change — new `schemaVersion`, validator and coercion. Worth doing, but it is its
own piece of work.

## Phase 2 — make them come back

- [x] **2.1 Real persistence.** Shipped — see "How 2.1 went" below.
- [ ] **2.2 Endless mode.** Continuous speed ramp, and the previous personal
      best rendered as a line on the road where the last run died.
- [ ] **2.3 Daily seed.** One shared seed per day plus a local history.
- [ ] **2.4 Per-key weakness tracking.** Log fumbled characters and digraphs,
      weight prompt selection toward them, show a "worst keys" panel on results.
      This is what turns the game into training with a visible improvement curve.

## How 2.1 went

`IndexedDbStorage` is now the default adapter, with `InMemoryStorage` as the
fallback and the test double. Nothing above the seam changed: the interface was
async from the start precisely so that this day would not require touching every
caller, and it did not.

**Why IndexedDB and not `localStorage`.** `localStorage` is synchronous on the
main thread — a write blocks the frame it happens in, and the game writes a
profile at the end of every run. It also stores strings, so run history would be
one JSON blob rewritten in full on every append. IndexedDB stores records and
indexes them.

Two rules the implementation adds:

- **It never takes the game down.** IndexedDB is unavailable in some
  private-browsing modes, can be blocked by policy, and can fail mid-session if
  the user clears site data. Every operation falls back rather than rejecting.
  Losing progress is bad; refusing to let somebody play is worse.
- **What it reads is untrusted.** A stored profile came off a disk the game does
  not control. Profiles are coerced field by field (spec §17) — one bad number is
  not a reason to lose somebody's progress. Runs are checked with `isRunResult`
  and bad ones are _skipped_, because one run is not somebody's progress and a
  history is better missing an entry than carrying a fictional one.

Runs are keyed on `runId`, so recording the same run twice is an overwrite rather
than a duplicate. A keyed store does not trim itself the way an array slice does,
so `appendRun` prunes past the cap explicitly — without it a player who runs
daily accumulates records forever, which is the sort of failure that only shows
up months later.

**Tested twice, deliberately.** Fifteen unit tests against `fake-indexeddb` cover
the logic, and one Playwright test covers the thing a fake cannot: it crashes a
run, genuinely reloads the page, and reads the attempt count back. Everything
about persistence can be made to pass against a fake; only a real reload proves
the database outlived the page.

Two things had to change once progress was real. The settings screen told the
player "progress currently lives in memory and is lost on reload anyway", which
became a lie — reset is now a genuinely destructive action and says so. And the
main menu offers "Continue" once there is progress to continue, which is why the
e2e reaches map selection via "Maps".

## Phase 3 — make it feel good

- [ ] **3.1 Fill the road** — ambient traffic in unblocked lanes, roadside
      props, tunnels, junctions, weather.
- [ ] **3.2 Speed sensation** — FOV scaled to velocity, streak particles, camera
      shake, wind audio pitched to speed.
- [ ] **3.3 Move the word closer** — larger, nearer, anchored to the hazard's
      screen position with a leader line, so it can be read peripherally.
- [ ] **3.4 Escalation within a run** — thirds, each with a speed step, a new
      hazard type and a visible landmark; the final 20% a sprint with its own
      music layer.
- [ ] **3.5 Comeback layer** — powerups every ~30s once density is up, with the
      shield visible on the character.

## Phase 4 — depth

- [ ] **4.1 Combo tiers** with escalating visual and audio state, so a streak is
      felt and losing it hurts.
- [ ] **4.2 Near-miss bonus** — clearing with under 15% of the budget left pays
      extra, making greed a strategy.
- [ ] **4.3 Score decomposition** on the results screen: speed vs accuracy vs
      combo vs coins.

## Sequencing

1.1 and 1.2 are the two that matter; everything else amplifies them. Phase 2 is
what makes the game stick. Phases 3 and 4 should not start before Phase 1 ships.
