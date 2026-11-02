# CLI reference

```
node packages/cli/src/index.ts <command> [options]
# or, after `npm link` / `npm i -g .`:
sentinel <command> [options]
```

The CLI is TypeScript executed directly by Node (type stripping). There is no
build artifact and no bundler.

## `scan`

Read TTLs and print a forecast table.

| Flag | Meaning |
| --- | --- |
| `--contract <C...>` | Contract to check. Repeatable |
| `--config <path>` | JSON config with `contracts[]` or `watch[]`. Default `deployments.json` |
| `--registry <C...>` | Use the on-chain watchlist as the target list |
| `--network <name>` | `testnet` (default), `futurenet`, `mainnet` |
| `--rpc-url <url>` | Override the RPC endpoint |
| `--warn-ledgers <n>` | Warn window when not set per contract. Default 518,400 (30 days) |
| `--json` | Emit the full `ScanResult` as JSON |

`scan` always exits `0` unless the command itself errors. Use `verify` for gating.

```bash
sentinel scan --contract CABC... --warn-ledgers 86400 --json
```

## `verify`

Identical output and flags to `scan`, but the exit code is the signal:

| Exit code | Meaning |
| --- | --- |
| `0` | No contract is `CRITICAL` or `ARCHIVED` |
| `2` | At least one is `CRITICAL` or `ARCHIVED` (or `WATCH`/`URGENT` too, with `--strict`) |
| `1` | The command failed (bad flags, RPC error, missing key) |

```yaml
- run: npx sentinel verify --config deployments.json --strict
```

## `registry list`

Print the on-chain watchlist.

```bash
sentinel registry list                 # first page (50)
sentinel registry list --all           # up to 200 entries
sentinel registry list --json
```

## `registry add` / `registry remove`

Writes require `SENTINEL_SECRET` (or `--secret`).

```bash
SENTINEL_SECRET=S... sentinel registry add \
  --target CC... --label "Payroll v2" --warn-ledgers 518400

SENTINEL_SECRET=S... sentinel registry remove --target CC...
```

`--owner` defaults to the signing account. `add` prints the new watch id and the
transaction hash; `remove` prints the hash.

## `doctor`

Prints RPC health, latest ledger, protocol version, registry id and the
effective warn window. Use it first when something looks wrong.

## Environment

| Variable | Purpose |
| --- | --- |
| `SENTINEL_NETWORK` | Default network when `--network` is absent |
| `SENTINEL_RPC_URL` | Default RPC endpoint |
| `SENTINEL_REGISTRY_ID` | Default registry contract id |
| `SENTINEL_SECRET` | Signing key for registry writes |
| `SENTINEL_PUBLIC_KEY` | Read-only source account (needed on mainnet, where there is no friendbot) |
| `SENTINEL_WARN_LEDGERS` | Default warn window |

On testnet and futurenet, read-only commands with no configured key generate a
throwaway account and fund it through friendbot so RPC simulation has a source.

## JSON shape

```json
{
  "network": "testnet",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "latestLedger": 5515284,
  "scannedAt": "2026-11-02T06:20:00.000Z",
  "contracts": [
    {
      "contractId": "CC4TQFW5...",
      "label": "Sentinel registry (self)",
      "warnLedgers": 518400,
      "risk": "urgent",
      "missing": false,
      "ledgersRemaining": 120952,
      "secondsRemaining": 604760,
      "expiresAt": "2026-11-09T06:13:00.000Z",
      "entries": [
        {
          "key": "instance",
          "kind": "instance",
          "durability": "persistent",
          "present": true,
          "liveUntilLedger": 5636236,
          "wasmHash": "c1ed6c44..."
        }
      ],
      "explorerUrl": "https://stellar.expert/explorer/testnet/contract/CC4TQFW5..."
    }
  ],
  "summary": { "healthy": 1, "watch": 0, "urgent": 1, "critical": 0, "missing": 0 }
}
```
