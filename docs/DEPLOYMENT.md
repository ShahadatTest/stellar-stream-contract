# Deployment

Two things can be deployed: the registry contract and the documentation site.

## Prerequisites

- Rust stable with the `wasm32v1-none` target (the pinned toolchain in
  `rust-toolchain.toml` applies automatically)
- [Stellar CLI](https://github.com/stellar/stellar-cli/releases) **v25.2.0+**
  (v28.1.0 was used for the current deployment). `soroban-sdk` v28 refuses a
  bare `cargo build` for wasm, so the CLI is required, not optional.
- A funded identity, or let the script create one on testnet via friendbot

Install the CLI from the prebuilt release (faster than `cargo install`):

```bash
mkdir -p "$HOME/.local/bin"
curl -sSL "$(curl -sSL https://api.github.com/repos/stellar/stellar-cli/releases/latest \
  | grep -o '"browser_download_url": *"[^"]*x86_64-unknown-linux-gnu.tar.gz"' \
  | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')" | tar -xz -C "$HOME/.local/bin" stellar
```

## 1. Build

```bash
make wasm
# → target/wasm32v1-none/release/sentinel_registry.wasm
```

The build shrinks the contract spec; without the CLI the SDK aborts by design.

## 2. Deploy and seed

`scripts/deploy.ts` uploads the wasm, creates the contract with
`createCustomContract`, and seeds the watchlist. It uses raw Soroban
transactions, so it does **not** need the Stellar CLI.

```bash
# testnet, throwaway key funded by friendbot
node scripts/deploy.ts

# or with your own identity
SENTINEL_SECRET=S... node scripts/deploy.ts
```

It prints and records:

```
wasm hash   <sha256 of the wasm>
registry    C...            ← the contract id
explorer    https://stellar.expert/explorer/testnet/contract/C...
```

and writes `deployments.json`, which is both the record and the CLI's default
config. With `SEED=0` the seeding step is skipped.

> The seeded demo watches are owned by the deploying key. If the script
> generated a throwaway key, those entries can never be removed — use
> `SENTINEL_SECRET` for anything you intend to keep.

## 3. Verify

```bash
node packages/cli/src/index.ts doctor
node packages/cli/src/index.ts scan --config deployments.json
node packages/cli/src/index.ts registry list --config deployments.json
```

Expected: `doctor` reports `rpc health healthy`; `scan` prints a table with the
registry itself and the native XLM SAC on testnet.

## 4. Record the deployment

1. Add the contract id, wasm hash and date to `deployments.json`.
2. Update the table in `README.md` and `site/deployments.html`.
3. Tag the release with the same wasm hash that was uploaded.

## Mainnet

Same sequence with `SENTINEL_NETWORK=mainnet`, `SENTINEL_RPC_URL` pointing at an
endpoint you trust, and `SENTINEL_SECRET` set — there is no friendbot, so the
throwaway-key path is unavailable.

Do not deploy to mainnet until the contract has been reviewed by someone other
than its author. The registry is immutable: `watch`/`unwatch` are the only
mutations, and a bug in id allocation would be permanent.

## Redeploying

The contract has no upgrade path. A behavioural change means a new contract id;
existing watches stay on the old contract and `deployments.json` gains a new
entry. Clients should treat the registry id as configuration, never as a
constant.
