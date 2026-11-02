# Security Policy

## Scope

This repository contains:

- `contracts/registry` — the on-chain watchlist (`sentinel-registry` wasm)
- `packages/sdk`, `packages/cli` — the `sentinel` keeper tooling
- `scripts/deploy.ts` — deployment helper

In scope: loss or lockup of funds, unauthorized watchlist mutation, denial of
service against the registry, and keeper behaviour that could cause an operator
to miss an archival deadline.

Out of scope: the Stellar network itself, Soroban host behavior, and upstream
protocol limits on TTL extension.

## Reporting

Do **not** open a public issue for a vulnerability. Use GitHub's private
vulnerability reporting ("Security" tab → "Report a vulnerability") or email the
maintainer listed in `README.md`.

Include the affected commit, a reproduction, and the impact you believe it has.
You will get an acknowledgement within 72 hours.

## Contract risk notes

The registry holds **no funds and has no admin**. It cannot transfer tokens,
upgrade itself, or change another contract's state. Its only privileged action
is "the owner of a watch may remove it", which is enforced with
`Address::require_auth`.

Consumers should still be aware that:

- The watchlist is a *declaration*, not an attestation. Registering a contract
  does not mean the maintainers vouch for it.
- Liveness data comes from a Soroban RPC endpoint. A malicious RPC can report
  optimistic TTLs, so run `sentinel` against an endpoint you trust, and prefer
  more than one for anything critical.
- Archival is a protocol-level event. `sentinel` forecasts it; it cannot prevent
  it. Extension must be done by the owning contract, and restoration by anyone
  willing to pay the fee.

## Supported versions

The registry is immutable once deployed; security fixes ship as a new contract
id, recorded in `deployments.json` and the release notes.
