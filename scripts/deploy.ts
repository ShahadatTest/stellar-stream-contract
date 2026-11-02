#!/usr/bin/env node
/**
 * Deploy the Sentinel registry to a Stellar network and seed the watchlist.
 *
 *   make wasm && SEED=1 node scripts/deploy.ts
 *
 * Uses the raw Soroban transaction path (upload wasm, create contract), so no
 * Stellar CLI is required. Writes deployments.json, which the CLI reads as its
 * default config.
 */
import fs from "node:fs";
import process from "node:process";
import { Address, BASE_FEE, Keypair, Operation, TransactionBuilder, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { Account, rpc } from "@stellar/stellar-sdk";
import { fundWithFriendbot, openServer, resolveNetwork } from "../packages/sdk/src/index.ts";

const WASM_PATH = "target/wasm32v1-none/release/sentinel_registry.wasm";
const OUT_PATH = "deployments.json";
const WARN_LEDGERS = 518_400; // 30 days

/** Native XLM Stellar Asset Contract on testnet: a real, well-known contract. */
const TESTNET_XLM_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

type KeypairLike = Keypair;

async function submit(
  server: rpc.Server,
  cfg: ReturnType<typeof resolveNetwork>,
  keypair: KeypairLike,
  build: (account: Account) => TransactionBuilder,
) {
  const account = await server.getAccount(keypair.publicKey());
  const tx = build(account as Account).setTimeout(120).build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error(`Submission failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
  }

  const final = await server.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1_000 });
  if (final.status !== "SUCCESS") {
    throw new Error(`Transaction ${sent.hash} ended with ${final.status}`);
  }
  return final;
}

async function main(): Promise<void> {
  const networkName = process.env.SENTINEL_NETWORK ?? "testnet";
  const cfg = resolveNetwork(networkName);

  if (!fs.existsSync(WASM_PATH)) {
    throw new Error(`Missing ${WASM_PATH}. Run \`make wasm\` first.`);
  }
  const wasm = fs.readFileSync(WASM_PATH);
  console.log(`wasm        ${WASM_PATH} (${(wasm.length / 1024).toFixed(1)} KiB)`);

  const server = openServer(cfg);
  const latest = await server.getLatestLedger();
  console.log(`network     ${cfg.name} (${cfg.rpcUrl}), ledger ${latest.sequence}`);

  let keypair: KeypairLike;
  if (process.env.SENTINEL_SECRET) {
    keypair = Keypair.fromSecret(process.env.SENTINEL_SECRET);
  } else {
    keypair = Keypair.random();
    await fundWithFriendbot(cfg, keypair.publicKey());
    console.log(`account     ${keypair.publicKey()} (funded by friendbot)`);
  }
  console.log(`deployer    ${keypair.publicKey()}`);

  console.log("uploading wasm ...");
  const upload = await submit(server, cfg, keypair, (account) =>
    new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: cfg.passphrase }).addOperation(
      Operation.uploadContractWasm({ wasm }),
    ),
  );
  const wasmHash = Buffer.from(scValToNative(upload.returnValue as xdr.ScVal) as Uint8Array);
  console.log(`wasm hash   ${wasmHash.toString("hex")}`);

  console.log("creating registry contract ...");
  const create = await submit(server, cfg, keypair, (account) =>
    new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: cfg.passphrase }).addOperation(
      Operation.createCustomContract({ address: new Address(keypair.publicKey()), wasmHash }),
    ),
  );
  const registry = scValToNative(create.returnValue as xdr.ScVal) as string;
  console.log(`registry    ${registry}`);
  console.log(`explorer    ${cfg.explorerBase}/contract/${registry}`);

  const contracts: Array<{ contract: string; label: string; warnLedgers: number }> = [];
  const seed = process.env.SEED !== "0";

  const watch = async (target: string, label: string) => {
    await submit(server, cfg, keypair, (account) =>
      new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: cfg.passphrase }).addOperation(
        Operation.invokeContractFunction({
          contract: registry,
          function: "watch",
          args: [
            new Address(keypair.publicKey()).toScVal(),
            new Address(target).toScVal(),
            xdr.ScVal.scvString(label),
            xdr.ScVal.scvU32(WARN_LEDGERS),
          ],
        }),
      ),
    );
    contracts.push({ contract: target, label, warnLedgers: WARN_LEDGERS });
    console.log(`watch       ${target} — ${label}`);
  };

  if (seed) {
    // The registry watches itself: the first scan proves the whole loop.
    await watch(registry, "Sentinel registry (self)");
    if (cfg.name === "testnet") {
      await watch(TESTNET_XLM_SAC, "Native XLM Stellar Asset Contract");
    }
  }

  const deployment = {
    network: cfg.name,
    registry,
    deployer: keypair.publicKey(),
    wasmHash: wasmHash.toString("hex"),
    deployedAt: new Date().toISOString(),
    contracts,
  };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`\nwrote ${OUT_PATH}`);
  console.log(`\nNext: node packages/cli/src/index.ts scan`);
}

main().catch((error: unknown) => {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
