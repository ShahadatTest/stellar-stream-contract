# Roadmap

Versioned by capability, not by date. `v0.1` is deployed and useful; everything
below is sequenced by what unlocks the most value per unit of work, and each
item maps to a Wave issue.

## v0.1 — shipped

- [x] `sentinel-registry` contract: permissionless watchlist, owner-only removal,
      monotonic ids, keyset pagination, self-extending TTLs
- [x] TTL → wall-clock forecasting against Stellar's 5s close time
- [x] Risk classification (`OK` / `WATCH` / `URGENT` / `CRITICAL` / `ARCHIVED`)
- [x] `sentinel scan / verify / registry / doctor`
- [x] Instance-key derivation for any contract id, no cooperation required
- [x] Testnet deployment + seeded watchlist + daily CI scan
- [x] Docs site on GitHub Pages

## v0.2 — close the loop

- [ ] **`sentinel restore`**: build and submit `RestoreFootprint` for archived
      entries, using the simulation `restorePreamble` to get the footprint and
      `minResourceFee`. Dry-run by default.
- [ ] **`sentinel extend`**: for contracts that expose their own extension hook,
      invoke it with a ledger budget, and record the resulting TTL.
- [ ] **maxEntryTtl-aware risk**: read the network cap and never label a
      contract `URGENT` when it is already at the ceiling.
- [ ] **Multi-RPC consensus**: query two endpoints and report disagreement, so a
      single lying RPC cannot make a dead contract look alive.

## v0.3 — make the watchlist trustworthy

- [ ] **Footprint indexer**: consume `WatchAdded`/`WatchRemoved` plus Soroban RPC
      `getEvents` to enumerate a contract's persistent keys automatically.
- [ ] **Bounty accounting**: let a project deposit a reward that reimburses
      whoever restores its entries. Needs a verification story for "this keeper
      really paid the restore fee" before it can hold value.
- [ ] **Ownership transfer**: hand a watch to another address without a new id.

## v0.4 — make it visible

- [ ] **Status page**: static dashboard generated from `scan --json`, showing
      every watched contract, its deadline and a sparkline of ledger progress.
- [ ] **Webhook alerts**: Slack/Discord/email on state transitions, deduplicated
      so a daily cron does not spam.
- [ ] **Prometheus exporter** for operators who already run monitoring.

## Explicit non-goals

- Extending someone else's TTL from a shared contract. Soroban does not allow
  it; pretending otherwise would be a broken promise.
- Holding user funds. The registry is deliberately fundless.
- Becoming a generic multi-chain uptime monitor. The forecast is only meaningful
  because Soroban has a protocol-defined expiry.
