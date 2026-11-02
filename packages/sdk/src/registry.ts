import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { Keypair } from "@stellar/stellar-sdk";
import type { NetworkConfig } from "./network.ts";
import { invokeContract } from "./rpc.ts";

export interface WatchedContract {
  id: number;
  target: string;
  owner: string;
  label: string;
  warnLedgers: number;
  addedLedger: number;
}

export interface RegistryPage {
  watched: WatchedContract[];
  nextCursor: number | null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return fallback;
}

/** Normalise the `Watch` struct returned by `scValToNative`. */
export function normaliseWatch(raw: unknown): WatchedContract {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    id: toNumber(record.id),
    target: String(record.target ?? ""),
    owner: String(record.owner ?? ""),
    label: String(record.label ?? ""),
    warnLedgers: toNumber(record.warn_ledgers),
    addedLedger: toNumber(record.added_ledger),
  };
}

/**
 * Read one page of the on-chain watchlist.
 *
 * Uses simulation, so it costs nothing and needs no signature. The registry
 * caps a page at 50 entries; `nextCursor` is null when the id space is
 * exhausted.
 */
export async function readWatchlist(
  server: rpc.Server,
  cfg: NetworkConfig,
  params: { registryId: string; publicKey: string; keypair?: Keypair | null; cursor?: number; limit?: number },
): Promise<RegistryPage> {
  const cursor = params.cursor ?? 0;
  const limit = params.limit ?? 50;

  const result = await invokeContract(server, cfg, {
    contractId: params.registryId,
    method: "list",
    // `cursor` is u64 on the contract; a u32 ScVal would fail argument conversion.
    args: [xdr.ScVal.scvU64(BigInt(cursor)), xdr.ScVal.scvU32(limit)],
    publicKey: params.publicKey,
    keypair: params.keypair,
    submit: false,
  });

  const raw = result.returnValue;
  if (!raw) throw new Error("Registry returned no value; is the contract id correct?");

  const native = scValToNative(raw as xdr.ScVal) as unknown[];
  if (!Array.isArray(native)) throw new Error("Unexpected registry response: expected a list of watches.");

  const watched = native.map(normaliseWatch);
  const highestId = watched.length > 0 ? Math.max(...watched.map((entry) => entry.id)) : null;

  return {
    watched,
    nextCursor: highestId === null ? null : highestId + 1,
  };
}

export async function readWatchCount(
  server: rpc.Server,
  cfg: NetworkConfig,
  params: { registryId: string; publicKey: string; keypair?: Keypair | null },
): Promise<{ total: number; active: number }> {
  const call = async (method: string) => {
    const result = await invokeContract(server, cfg, {
      contractId: params.registryId,
      method,
      publicKey: params.publicKey,
      keypair: params.keypair,
      submit: false,
    });
    return result.returnValue ? toNumber(scValToNative(result.returnValue as xdr.ScVal)) : 0;
  };

  return { total: await call("count"), active: await call("active_count") };
}

export async function addWatch(
  server: rpc.Server,
  cfg: NetworkConfig,
  params: {
    registryId: string;
    owner: string;
    target: string;
    label: string;
    warnLedgers: number;
    keypair: Keypair;
  },
): Promise<{ hash: string; id: number | null }> {
  const result = await invokeContract(server, cfg, {
    contractId: params.registryId,
    method: "watch",
    args: [
      new Address(params.owner).toScVal(),
      new Address(params.target).toScVal(),
      xdr.ScVal.scvString(params.label),
      xdr.ScVal.scvU32(params.warnLedgers),
    ],
    publicKey: params.keypair.publicKey(),
    keypair: params.keypair,
    submit: true,
  });

  return {
    hash: result.hash,
    id: result.returnValue ? toNumber(scValToNative(result.returnValue as xdr.ScVal)) : null,
  };
}

export async function removeWatch(
  server: rpc.Server,
  cfg: NetworkConfig,
  params: { registryId: string; owner: string; target: string; keypair: Keypair },
): Promise<{ hash: string }> {
  const result = await invokeContract(server, cfg, {
    contractId: params.registryId,
    method: "unwatch",
    args: [new Address(params.owner).toScVal(), new Address(params.target).toScVal()],
    publicKey: params.keypair.publicKey(),
    keypair: params.keypair,
    submit: true,
  });
  return { hash: result.hash };
}
