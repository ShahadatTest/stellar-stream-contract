.PHONY: build wasm test test-rust test-js clippy fmt check deploy-testnet scan clean

# soroban-sdk v28 refuses a bare `cargo build` for wasm: only the Stellar CLI
# sets the build-system flag the SDK requires, and it also shrinks the emitted
# contract spec. Requires stellar-cli v25.2.0+ (docs/DEPLOYMENT.md).
wasm:
	stellar contract build
	@ls -lh target/wasm32v1-none/release/sentinel_registry.wasm

build: wasm

test: test-rust test-js

test-rust:
	cargo test

test-js:
	node --test packages/sdk/test/*.test.ts

clippy:
	cargo clippy --all-targets -- -D warnings

fmt:
	cargo fmt --all

check:
	cargo check --all-targets

# Upload the wasm and create the registry on testnet. Writes
# deployments.testnet.json; see scripts/deploy.ts.
deploy-testnet: wasm
	node scripts/deploy.ts

# Scan the contracts listed in deployments.json against the network RPC.
scan:
	node packages/cli/src/index.ts scan --config deployments.json

clean:
	cargo clean
	rm -rf node_modules
