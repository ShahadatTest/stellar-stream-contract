# Contract specification — `sentinel-registry`

Source of truth for `contracts/registry`. If code and spec disagree, the spec
wins until it is deliberately changed; behaviour changes must update this file
in the same pull request.

- Crate: `sentinel-registry` (`contracts/registry`)
- Language: Rust 2021, `soroban-sdk` 28.x, target `wasm32v1-none`
- Contracts: **one**. It stores a watchlist and nothing else.
- Holds no funds. Has no admin. Is not upgradeable.

---

## 1. Storage

### `DataKey`

| Variant | Class | Value |
| --- | --- | --- |
| `NextId` | instance | `u64`, next watch id (also the count of watches ever created) |
| `ActiveCount` | instance | `u64`, number of active watches |
| `Target(u64)` | persistent | `Address` of the watched contract, indexed by id |
| `IdOf(Address)` | persistent | `u64` id of the watch for that contract |
| `Watch(Address)` | persistent | the `Watch` record |

### `Watch`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `u64` | Monotonic id, never reused |
| `target` | `Address` | The watched contract |
| `owner` | `Address` | Registered the watch; the only account that may remove it |
| `label` | `String` | Human-readable name for dashboards |
| `warn_ledgers` | `u32` | Warn when fewer than this many ledgers remain |
| `added_ledger` | `u32` | Ledger sequence at registration |
| `active` | `bool` | False after removal; the record is retained |

### TTL policy

Every write extends the registry's instance TTL and the TTLs of all three
persistent entries it touches; every read extends the instance TTL and the TTL
of the record it reads.

- Threshold: 17,280 ledgers (~1 day)
- Extension: 518,400 ledgers (~30 days), clamped by the network's `maxEntryTtl`

Guard rails:

| Constant | Value | Purpose |
| --- | --- | --- |
| `MIN_WARN_LEDGERS` | 17,280 | A warn window under a day is useless |
| `MAX_WARN_LEDGERS` | 6,307,200 | One year: larger is certainly a unit mistake |
| `MAX_PAGE` | 50 | Upper bound on `list` result size |

---

## 2. Errors

| Code | Variant | Raised when |
| --- | --- | --- |
| 1 | `Unauthorized` | Caller is not the watch owner |
| 2 | `AlreadyWatched` | Target already has an active watch |
| 3 | `NotFound` | No watch record for the target |
| 4 | `NotWatched` | Removing a watch that is already inactive |
| 5 | `InvalidWarnWindow` | `warn_ledgers` outside `[MIN_WARN_LEDGERS, MAX_WARN_LEDGERS]` |
| 6 | `MathOverflow` | Checked arithmetic overflowed |

Codes are part of the ABI. Never renumber; removing a variant is breaking.

---

## 3. Events

All emitted through `#[contractevent]`. Exactly one event per state change.

| Event | Fields | Emitted by |
| --- | --- | --- |
| `WatchAdded` | `id, target, owner, warn_ledgers` | `watch` |
| `WatchRemoved` | `target, owner` | `unwatch` |

Indexers can reconstruct the full current watchlist from `WatchAdded` and
`WatchRemoved` alone, which is the intended path for a footprint indexer.

---

## 4. Functions

### `watch(owner, target, label, warn_ledgers) -> Result<u64, SentinelError>`

- **Auth:** `owner.require_auth()`.
- **Validation:** `warn_ledgers` within bounds (else `InvalidWarnWindow`); no
  active watch on `target` (else `AlreadyWatched`).
- **Effects:** allocates the next id, writes `Watch`, `Target(id)`, `IdOf`,
  increments `NextId` and `ActiveCount`, extends TTLs.
- **Events:** `WatchAdded`.
- **Notes:** re-registering a removed contract allocates a **new** id.

### `unwatch(owner, target) -> Result<(), SentinelError>`

- **Auth:** `owner.require_auth()`.
- **Validation:** record exists (else `NotFound`); caller is the owner (else
  `Unauthorized`); the watch is active (else `NotWatched`).
- **Effects:** sets `active = false`, decrements `ActiveCount`, keeps the record.
- **Events:** `WatchRemoved`.

### `get(target) -> Result<Watch, SentinelError>`

- **Auth:** none. **Returns** the record, active or not. `NotFound` if absent.
- **Side effect:** extends TTLs.

### `is_watched(target) -> bool`

- **Auth:** none. True only for an **active** watch.

### `list(cursor, limit) -> Vec<Watch>`

- **Auth:** none.
- **Behaviour:** iterates ids from `cursor` upward, skipping inactive records,
  until `limit` results are collected or ids are exhausted. `limit == 0` or
  `limit > MAX_PAGE` is clamped to `MAX_PAGE`.
- **Notes:** because removed ids are skipped, a page may return fewer than
  `limit` entries while later entries still exist. Callers page by advancing
  `cursor` to `last id + 1`.

### `count() -> u64`

- **Auth:** none. Number of watches ever created (the next id).

### `active_count() -> u64`

- **Auth:** none. Number of active watches.

---

## 5. Invariants

1. `active_count == |{w : Watch(w).active}|`.
2. `count == NextId`, and every id in `[0, NextId)` maps to at most one
   `Target(id)`.
3. `Watch(t).id == IdOf(t)` for every existing record.
4. No function can transfer tokens, change another contract's storage, or change
   the contract's own executable.
5. `unwatch` never deletes storage; ids stay resolvable forever.

---

## 6. Out of scope, by design

- Extending a *foreign* contract's TTL. Soroban forbids it; the owning contract
  must expose its own extension path.
- Paying restoration fees. Sentinel reports; it does not subsidise.
- Vouching for a listed contract. The watchlist is a declaration.
