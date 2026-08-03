# `storage` — persistence seam

## Contract

- A `StorageAdapter` interface plus an **in-memory implementation only**.
- No database. Progress resets on reload — that is the current intended behavior
  (CLAUDE.md §2).
- No persistence logic inside rendering or React components.
- Persisted shapes carry `schemaVersion` from the start, so a real backing store can be
  added later without a migration scramble.

## Contents

- `storage-adapter.ts` — the interface: load and save a profile, append and list runs, clear
  everything. **Everything is async.** Nothing about the in-memory store needs to be, but
  IndexedDB is, and an interface that only became async later would force every caller to
  change — paying that cost once is cheaper than paying it twice.
- `in-memory-storage.ts` — the only implementation. Progress resets on reload, as intended
  for now. Run history is capped (50), newest first, so a long session cannot grow without
  bound.

It **validates what it loads**, using the same `coercePlayerProfile` recovery a corrupt save
would need (spec §17). That looks paranoid for a store nothing external can corrupt, and
that is the point: the recovery path is exercised on every load in every test, rather than
being written blind on the day real persistence arrives.

A missing profile is `null`, not an error — a first-run player simply has nothing stored.

The rules that decide what a finished run _does_ to a profile live in
`game-core/progress/`, not here: bests only ever improve, a completed map stays completed,
only completions count toward a best time, and unlocks need both a finished run and the
accuracy gate. Storage just holds the result.

An IndexedDB implementation is deliberately deferred; this interface is the seam it slots
into. See CLAUDE.md §5.
