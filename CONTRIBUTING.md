# Contributing

Thanks for helping keep Soroban contracts alive. This repo is part of the
[Stellar Drips Wave](https://www.drips.network/wave/stellar) programme: issues
labelled `Stellar Wave` are funded, and `good first issue` ones are scoped for a
first contribution.

## Setup

Prerequisites:

- Rust stable (the pinned toolchain in `rust-toolchain.toml` applies
  automatically, including the `wasm32v1-none` target)
- Node.js 22.6+ (the CLI runs TypeScript directly through Node's type stripping;
  there is no build step)
- No Stellar CLI required — `scripts/deploy.ts` uses raw Soroban transactions

```bash
git clone https://github.com/Streams-Hq/stellar-stream-contract.git
cd soroban-sentinel
npm install

make test      # Rust + Node test suites
make clippy    # lints, warnings are errors
make fmt       # cargo fmt
npm run typecheck
make wasm      # contract artifact
```

## Running against testnet

```bash
node packages/cli/src/index.ts doctor
node packages/cli/src/index.ts scan --contract CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Read-only commands need no key: on testnet a throwaway account is funded via
friendbot for RPC simulation. Registry writes need `SENTINEL_SECRET`.

## Ground rules

- One logical change per pull request; keep diffs reviewable.
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `ci:`, `refactor:`).
- Behaviour changes update `docs/ARCHITECTURE.md` and `docs/CLI.md` in the same
  PR. Contract ABI changes also update `docs/CONTRACT_SPEC.md`.
- New contract behaviour needs a test. `cargo test` must stay green, and
  `clippy -D warnings` is enforced in CI.
- Never commit secrets. `SENTINEL_SECRET` belongs in your environment or an
  untracked `.env`, never in `deployments.json`.

## Labels

| Label | Meaning |
| --- | --- |
| `Stellar Wave` | Part of the funded Wave backlog |
| `good first issue` | Small, well-scoped, no prior context needed |
| `complexity: low/mid/high` | Rough effort, not difficulty of the idea |
| `type: bug/test/docs/ci/feat` | Area of change |

## Reporting bugs

Open an issue with the command you ran, the network, and the output. If the
output contains a contract id you consider private, redact it. For security
issues follow `SECURITY.md` instead.
