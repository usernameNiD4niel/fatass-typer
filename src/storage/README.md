# `storage` — persistence seam

## Contract

- A `StorageAdapter` interface plus an **in-memory implementation only**.
- No database. Progress resets on reload — that is the current intended behavior
  (CLAUDE.md §2).
- No persistence logic inside rendering or React components.
- Persisted shapes carry `schemaVersion` from the start, so a real backing store can be
  added later without a migration scramble.

## Contents

Populated by step F5. An IndexedDB implementation is deliberately deferred; this
interface is the seam it would slot into. See CLAUDE.md §5.
