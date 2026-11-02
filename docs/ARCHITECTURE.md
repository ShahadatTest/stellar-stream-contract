# Architecture

## 1. The problem Soroban has and other chains do not

A Soroban ledger entry is not permanent. Each entry carries a TTL measured in
ledgers, and when that TTL lapses the entry is moved out of the live state into
the archive.

Two properties make this operationally dangerous:

- **The instance entry is a single point of failure.** A contract's instance
  entry holds its executable reference and instance storage. If it is archived,
  every call to the contract fails until somebody restores the footprint. A
  contract holding user balances becomes a contract whose users cannot withdraw.
- **Nothing tells you it is happening.** Reads of an existing entry return
  `liveUntilLedgerSeq`, but you have to ask. There is no notification, no event,
  and no expiry field in the contract's own ABI.

Restoration is permissionless: anyone can submit a `RestoreFootprint` operation
and pay the fee. So the hard part is not the fix, it is the *detection*.

## 2. What Sentinel does about it

```
                    ┌──────────────────────────────┐
  project lead ────▶│ sentinel-registry (Soroban)  │  public watchlist
                    │ watch / unwatch / list       │  no funds, no admin
                    └───────────────┬──────────────┘
                                    │ list(0, 50) …
                                    ▼
                    ┌──────────────────────────────┐
  maintainer ──────▶│ sentinel (CLI + SDK)         │
                    │ getLedgerEntries(instance)   │──────▶ Soroban RPC
                    │ liveUntilLedgerSeq → risk    │
                    └───────────────┬──────────────┘
                                    │ exit 0 / 2, JSON
                                    ▼
                        CI job · cron · dashboard
```

The registry is deliberately thin. It cannot extend another contract's TTL — in
Soroban only the owning contract may do that — so its job is declaration and
discovery, not enforcement. The keeper tooling does the measuring.

## 3. Which keys can actually be measured

`getLedgerEntries` returns exactly the keys you ask for, so monitoring is
bounded by what a watcher can derive:

| Key | Derivable without contract knowledge? | Meaning |
| --- | --- | --- |
| Contract instance | **Yes**, from the contract id | Archival takes the whole contract offline |
| Contract code (wasm) | Yes, from the wasm hash | Archival means the code must be re-uploaded |
| Contract data (instance) | No — needs the storage key | Part of the instance entry's TTL |
| Contract data (persistent) | No — needs the storage key | Individual records expire independently |

The instance key is the important one: it is constructed as

```
LedgerKey::ContractData {
    contract: ScAddress::Contract(id),
    key: ScVal::LedgerKeyContractInstance,
    durability: Persistent,
}
```

which is why `sentinel scan --contract C...` works on a contract it has never
seen, with no cooperation from the contract's authors. Persistent data keys are
opt-in through `extraKeys` in the SDK; enumerating them automatically requires a
footprint indexer (see the roadmap).

## 4. Risk model

All risk math lives in `packages/sdk/src/ttl.ts` and is pure, so it is cheap to
test and reuse.

```
ledgersRemaining = liveUntilLedger - currentLedger
secondsRemaining = ledgersRemaining * 5
expiresAt        = now + secondsRemaining
```

Classification against a per-contract warn window `w`:

| Condition | State |
| --- | --- |
| `remaining <= 0` | `ARCHIVED` |
| `remaining <= ceil(w * 0.10)` | `CRITICAL` |
| `remaining <= ceil(w * 0.33)` | `URGENT` |
| `remaining <= w` | `WATCH` |
| otherwise | `OK` |

The 5-second close time is the protocol target, not a guarantee; forecasts are
estimates and are labelled as such. A reading can never exceed the network's
`maxEntryTtl`, which is why a healthy contract on testnet can look `URGENT`
against a 30-day window.

## 5. Registry design

- **No admin.** `watch` requires the owner's signature, `unwatch` requires the
  same owner. There is nothing else to call.
- **No funds.** The contract never touches a token, so it cannot be drained.
- **Stable ids.** Ids are monotonic and never reused, so `Target(id)` is a
  durable index for keyset pagination and event consumers.
- **Bounded reads.** `list` returns at most 50 entries per call, keeping
  simulation cost predictable.
- **Self-preservation.** Every read and write extends the registry's own
  instance and persistent TTLs. The watchdog must not be the thing that expires
  first — and `deployments.json` includes the registry itself so its own TTL
  shows up in every scan.

## 6. Trust boundaries

| Assumption | Consequence if violated |
| --- | --- |
| The RPC endpoint is honest | A malicious RPC can report optimistic TTLs; use an endpoint you trust, and more than one for critical infrastructure |
| Ledger close time is ~5s | Forecasts drift; the state can only get worse, never better, so a stale forecast is pessimistic |
| The watchlist is a declaration | Being listed is not an endorsement or an audit |
| Restoration is permissionless | Anyone can restore, but somebody has to pay; Sentinel does not subsidise it |
