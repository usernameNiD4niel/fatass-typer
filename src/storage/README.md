# `storage` — persistence seam

## Contract

- A `StorageAdapter` interface with **two implementations**: IndexedDB (the default) and
  in memory (the fallback and the test double).
- No persistence logic inside rendering or React components.
- Persisted shapes carry `schemaVersion`, which is what made turning the seam on a
  non-event rather than a migration scramble.

## Contents

- `storage-adapter.ts` — the interface: load and save a profile, append and list runs, clear
  everything. **Everything is async.** Nothing about the in-memory store needs to be, but
  IndexedDB is, and an interface that only became async later would force every caller to
  change — paying that cost once is cheaper than paying it twice.
- `indexeddb-storage.ts` — the default (plan 2.1). Progress survives a reload. Two object
  stores: the profile as a single record, and runs keyed on `runId` with an index on
  `mapId`. Keying on the run's own id means appending the same run twice is an overwrite
  rather than a duplicate.
- `in-memory-storage.ts` — the fallback when the browser will not persist, and the double
  the rest of the suite injects. Run history is capped (50), newest first, so a long
  session cannot grow without bound.

It **validates what it loads**, using the same `coercePlayerProfile` recovery a corrupt save
would need (spec §17). That looks paranoid for a store nothing external can corrupt, and
that is the point: the recovery path is exercised on every load in every test, rather than
being written blind on the day real persistence arrives.

A missing profile is `null`, not an error — a first-run player simply has nothing stored.

The rules that decide what a finished run _does_ to a profile live in
`game-core/progress/`, not here: bests only ever improve, a completed map stays completed,
only completions count toward a best time, and unlocks need both a finished run and the
accuracy gate. Storage just holds the result.

## Two rules the IndexedDB implementation adds

**It never takes the game down.** IndexedDB is unavailable in some private-browsing modes,
can be blocked by policy, and can fail mid-session if the user clears site data. Every
operation falls back rather than rejecting: a failed load reads as "no profile", a failed
save is dropped. Losing progress is bad; refusing to let somebody play is worse.

**What it reads is untrusted.** A stored profile came off a disk the game does not control
— a previous version wrote it, or the user edited it in devtools. Profiles are coerced
field by field (spec §17), because one bad number is not a reason to lose somebody's
progress. Runs are checked with `isRunResult` and bad ones are _skipped_ instead, because
one run is not somebody's progress and a history is more useful missing an entry than
carrying a fictional one.

A keyed store also does not trim itself the way an array slice does, so `appendRun` prunes
past the cap explicitly — without it a player who runs daily accumulates records forever,
which is the sort of failure that only shows up months later.
