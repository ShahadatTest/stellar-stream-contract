import { rpc, xdr } from "@stellar/stellar-sdk";
import {
  dataLedgerKey,
  describeKey,
  instanceLedgerKey,
  ledgerKeyToBase64,
  wasmHashOf,
} from "./footprint.ts";
import type { KeySpec } from "./footprint.ts";
import type { NetworkConfig } from "./network.ts";
import { explorerContractUrl } from "./network.ts";
import { projectTtl } from "./ttl.ts";
import type { Risk, TtlProjection } from "./ttl.ts";

export interface ScanTarget {
  contractId: string;
  label?: string;
  /** Warn when fewer ledgers than this remain. */
  warnLedgers: number;
  /** Additional storage keys to check, as base64 `ScVal`. */
  extraKeys?: Array<{ keyXdr: string; durability?: "persistent" | "temporary" }>;
}

export interface EntryReport {
  key: string;
  kind: "instance" | "data";
  durability: "persistent" | "temporary";
  present: boolean;
  liveUntilLedger: number | null;
  projection: TtlProjection | null;
  wasmHash: string | null;
}

export interface ContractReport {
  contractId: string;
  label: string;
  warnLedgers: number;
  risk: Risk;
  missing: boolean;
  ledgersRemaining: number | null;
  secondsRemaining: number | null;
  expiresAt: string | null;
  entries: EntryReport[];
  explorerUrl: string;
}

export interface ScanResult {
  network: string;
  rpcUrl: string;
  latestLedger: number;
  scannedAt: string;
  contracts: ContractReport[];
  summary: Record<Risk, number>;
}

const CHUNK = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function riskRank(risk: Risk): number {
  switch (risk) {
    case "missing":
      return 0;
    case "critical":
      return 1;
    case "urgent":
      return 2;
    case "watch":
      return 3;
    default:
      return 4;
  }
}

/**
 * Read `liveUntilLedgerSeq` for every watched contract's instance entry (plus
 * any declared storage keys) and turn the readings into expiry forecasts.
 *
 * RPC can only return keys you ask for, so persistent data keys must be
 * declared explicitly; the instance entry is always derivable and is the entry
 * whose archival takes the whole contract offline.
 */
export async function scanTargets(
  server: rpc.Server,
  cfg: NetworkConfig,
  targets: ScanTarget[],
  options: { now?: number } = {},
): Promise<ScanResult> {
  const latest = await server.getLatestLedger();
  const currentLedger = latest.sequence;

  const specs = new Map<string, KeySpec>();
  const wanted = targets.map((target) => {
    const keys: xdr.LedgerKey[] = [instanceLedgerKey(target.contractId)];
    specs.set(ledgerKeyToBase64(keys[0]), {
      contractId: target.contractId,
      kind: "instance",
      durability: "persistent",
    });

    for (const extra of target.extraKeys ?? []) {
      const durability = extra.durability ?? "persistent";
      const key = dataLedgerKey(target.contractId, extra.keyXdr, durability);
      keys.push(key);
      specs.set(ledgerKeyToBase64(key), {
        contractId: target.contractId,
        kind: "data",
        durability,
        keyXdr: extra.keyXdr,
      });
    }

    return { target, keys };
  });

  const allKeys = wanted.flatMap((entry) => entry.keys);
  const entries = new Map<string, rpc.Api.LedgerEntryResult>();

  for (const batch of chunk(allKeys, CHUNK)) {
    const response = await server.getLedgerEntries(...batch);
    for (const entry of response.entries ?? []) {
      entries.set(ledgerKeyToBase64(entry.key), entry);
    }
  }

  const contracts: ContractReport[] = wanted.map(({ target, keys }) => {
    const reports: EntryReport[] = keys.map((key) => {
      const encoded = ledgerKeyToBase64(key);
      const spec = specs.get(encoded) as KeySpec;
      const found = entries.get(encoded);
      const liveUntilLedger = found?.liveUntilLedgerSeq ?? null;

      return {
        key: describeKey(spec),
        kind: spec.kind,
        durability: spec.durability,
        present: found !== undefined,
        liveUntilLedger,
        projection:
          liveUntilLedger === null || liveUntilLedger === undefined
            ? null
            : projectTtl({
                liveUntilLedger,
                currentLedger,
                warnLedgers: target.warnLedgers,
                now: options.now,
              }),
        wasmHash: found ? wasmHashOf(found.val) : null,
      };
    });

    const instance = reports.find((report) => report.kind === "instance");
    const worst = reports
      .filter((report) => report.present)
      .sort((a, b) => (a.projection?.ledgersRemaining ?? 0) - (b.projection?.ledgersRemaining ?? 0))[0];

    const missing = instance ? !instance.present : false;
    const risk: Risk = missing ? "missing" : (worst?.projection?.risk ?? "healthy");

    return {
      contractId: target.contractId,
      label: target.label ?? "",
      warnLedgers: target.warnLedgers,
      risk,
      missing,
      ledgersRemaining: worst?.projection?.ledgersRemaining ?? null,
      secondsRemaining: worst?.projection?.secondsRemaining ?? null,
      expiresAt: worst?.projection?.expiresAt ?? null,
      entries: reports,
      explorerUrl: explorerContractUrl(cfg, target.contractId),
    };
  });

  const summary: Record<Risk, number> = { healthy: 0, watch: 0, urgent: 0, critical: 0, missing: 0 };
  for (const contract of contracts) summary[contract.risk] += 1;

  return {
    network: cfg.name,
    rpcUrl: cfg.rpcUrl,
    latestLedger: currentLedger,
    scannedAt: new Date(options.now ?? Date.now()).toISOString(),
    contracts,
    summary,
  };
}

export function worstRisk(result: ScanResult): Risk {
  return result.contracts.reduce<Risk>(
    (worst, contract) => (riskRank(contract.risk) < riskRank(worst) ? contract.risk : worst),
    "healthy",
  );
}

/** Exit code contract shared by `scan` and `verify`: 0 ok, 2 needs attention. */
export function exitCodeFor(result: ScanResult, strict = false): number {
  const failing = strict ? ["missing", "critical", "urgent", "watch"] : ["missing", "critical"];
  return result.contracts.some((contract) => failing.includes(contract.risk)) ? 2 : 0;
}
