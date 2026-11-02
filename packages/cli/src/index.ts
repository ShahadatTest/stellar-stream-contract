#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";
import { Keypair } from "@stellar/stellar-sdk";
import {
  addWatch,
  daysToLedgers,
  exitCodeFor,
  formatDuration,
  LEDGERS_PER_DAY,
  openServer,
  readWatchCount,
  readWatchlist,
  removeWatch,
  renderJson,
  renderText,
  resolveNetwork,
  resolveSource,
  scanTargets,
  worstRisk,
} from "../../sdk/src/index.ts";
import type { ScanTarget } from "../../sdk/src/index.ts";

const USAGE = `soroban-sentinel — keep Soroban contract state alive

Usage:
  sentinel scan   [options]        Forecast archival for watched contracts
  sentinel verify [options]        Same as scan, but exits 2 unless healthy
  sentinel registry list           Print the on-chain watchlist
  sentinel registry add            Add a contract to the watchlist
  sentinel registry remove         Remove a contract from the watchlist
  sentinel doctor                  Check RPC, ledger and registry health

Targets (scan/verify):
  --contract <C...>        Contract to check (repeatable)
  --config <path>          JSON config with contracts[] (default: deployments.json)
  --registry <C...>        Read targets from this registry's watchlist

Network:
  --network <name>         testnet | futurenet | mainnet (default: testnet)
  --rpc-url <url>          Override the RPC endpoint
  --warn-ledgers <n>       Warn window when not set per contract (default: 30 days)

Output:
  --json                   Machine-readable output
  --strict                 verify: fail on watch/urgent too, not only critical/archived

Environment:
  SENTINEL_SECRET          Signing key for registry writes
  SENTINEL_PUBLIC_KEY      Read-only source account (mainnet simulations)
  SENTINEL_NETWORK         Default network
  SENTINEL_RPC_URL         Default RPC endpoint

Docs: https://streams-hq.github.io/soroban-sentinel/
`;

interface ConfigFile {
  network?: string;
  registry?: string;
  contracts?: Array<{ contract?: string; label?: string; warnLedgers?: number; warn_ledgers?: number }>;
  watch?: Array<{ contract?: string; label?: string; warnLedgers?: number; warn_ledgers?: number }>;
}

function loadConfig(path: string): ConfigFile | null {
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf8")) as ConfigFile;
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${(error as Error).message}`);
  }
}

function toTargets(entries: ConfigFile["contracts"], fallbackWarn: number): ScanTarget[] {
  return (entries ?? [])
    .map((entry) => ({
      contractId: entry.contract ?? "",
      label: entry.label ?? "",
      warnLedgers: entry.warnLedgers ?? entry.warn_ledgers ?? fallbackWarn,
    }))
    .filter((entry) => entry.contractId.startsWith("C"));
}

async function resolveTargets(options: {
  contracts: string[];
  configPath: string;
  registry?: string;
  network: string;
  warnLedgers: number;
}): Promise<ScanTarget[]> {
  if (options.contracts.length > 0) {
    return options.contracts.map((contractId) => ({
      contractId,
      label: "",
      warnLedgers: options.warnLedgers,
    }));
  }

  const config = loadConfig(options.configPath);
  const fromConfig = toTargets(config?.contracts ?? config?.watch, options.warnLedgers);
  if (fromConfig.length > 0) return fromConfig;

  const registryId = options.registry ?? config?.registry ?? process.env.SENTINEL_REGISTRY_ID;
  if (!registryId || !registryId.startsWith("C")) {
    throw new Error(
      `No targets. Pass --contract C..., or --config with a contracts[] list, or --registry for the on-chain watchlist.`,
    );
  }

  const cfg = resolveNetwork(options.network);
  const server = openServer(cfg);
  const source = await resolveSource(cfg, { readOnly: true });
  const watched = await collectWatchlist(server, cfg, registryId, source.publicKey, source.keypair);
  return watched.map((entry) => ({
    contractId: entry.target,
    label: entry.label,
    warnLedgers: entry.warnLedgers || options.warnLedgers,
  }));
}

async function collectWatchlist(
  server: ReturnType<typeof openServer>,
  cfg: ReturnType<typeof resolveNetwork>,
  registryId: string,
  publicKey: string,
  keypair: Keypair | null,
  maxPages = 20,
) {
  const collected: Awaited<ReturnType<typeof readWatchlist>>["watched"] = [];
  let cursor = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await readWatchlist(server, cfg, { registryId, publicKey, keypair, cursor, limit: 50 });
    collected.push(...result.watched);
    if (result.nextCursor === null || result.watched.length === 0) break;
    cursor = result.nextCursor;
  }
  return collected;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const subcommand = command === "registry" ? argv[1] : undefined;
  const rest = command === "registry" ? argv.slice(2) : argv.slice(1);

  const { values } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      contract: { type: "string", multiple: true, default: [] },
      config: { type: "string", default: "deployments.json" },
      registry: { type: "string" },
      network: { type: "string" },
      "rpc-url": { type: "string" },
      "warn-ledgers": { type: "string" },
      json: { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
      target: { type: "string" },
      label: { type: "string", default: "" },
      owner: { type: "string" },
      secret: { type: "string" },
      all: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (!command || values.help) {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }

  if (values["rpc-url"]) process.env.SENTINEL_RPC_URL = values["rpc-url"] as string;
  const cfg = resolveNetwork(values.network as string | undefined);
  const warnLedgers = values["warn-ledgers"]
    ? Number(values["warn-ledgers"])
    : Number(process.env.SENTINEL_WARN_LEDGERS ?? LEDGERS_PER_DAY * 30);
  const config = loadConfig(values.config as string);
  const registryId =
    (values.registry as string | undefined) ?? config?.registry ?? process.env.SENTINEL_REGISTRY_ID;

  switch (command) {
    case "scan":
    case "verify": {
      const targets = await resolveTargets({
        contracts: values.contract as string[],
        configPath: values.config as string,
        registry: registryId,
        network: cfg.name,
        warnLedgers,
      });

      if (targets.length === 0) throw new Error("Nothing to scan.");

      const server = openServer(cfg);
      const result = await scanTargets(server, cfg, targets);

      if (values.json) {
        process.stdout.write(`${renderJson(result)}\n`);
      } else {
        process.stdout.write(`${renderText(result)}\n`);
        if (registryId) {
          process.stdout.write(`\nRegistry: ${registryId} (${cfg.name})\n`);
        }
      }

      if (command === "scan") {
        process.stderr.write(`\nworst: ${worstRisk(result)}\n`);
        return 0;
      }
      return exitCodeFor(result, values.strict as boolean);
    }

    case "registry": {
      if (subcommand === "add") {
        const target = values.target as string | undefined;
        if (!target || !target.startsWith("C")) throw new Error("--target <C...> is required.");
        if (!registryId) throw new Error("--registry <C...> is required (or set SENTINEL_REGISTRY_ID).");

        const server = openServer(cfg);
        const secret = values.secret as string | undefined;
        const source = await resolveSource(cfg, { secret });
        if (!source.keypair) throw new Error("A signing key is required: set SENTINEL_SECRET.");

        const owner = (values.owner as string | undefined) ?? source.keypair.publicKey();
        const result = await addWatch(server, cfg, {
          registryId,
          owner,
          target,
          label: values.label as string,
          warnLedgers,
          keypair: source.keypair,
        });

        process.stdout.write(
          `Watching ${target} as #${result.id ?? "?"} (owner ${owner}, warn ${warnLedgers} ledgers)\ntx: ${result.hash}\n`,
        );
        return 0;
      }

      if (subcommand === "remove") {
        const target = values.target as string | undefined;
        if (!target) throw new Error("--target <C...> is required.");
        if (!registryId) throw new Error("--registry <C...> is required (or set SENTINEL_REGISTRY_ID).");

        const server = openServer(cfg);
        const source = await resolveSource(cfg, { secret: values.secret as string | undefined });
        if (!source.keypair) throw new Error("A signing key is required: set SENTINEL_SECRET.");

        const owner = (values.owner as string | undefined) ?? source.keypair.publicKey();
        const result = await removeWatch(server, cfg, {
          registryId,
          owner,
          target,
          keypair: source.keypair,
        });
        process.stdout.write(`Removed ${target}\ntx: ${result.hash}\n`);
        return 0;
      }

      if (!registryId) throw new Error("--registry <C...> is required (or set SENTINEL_REGISTRY_ID).");
      const server = openServer(cfg);
      const source = await resolveSource(cfg, { readOnly: true });
      const watched = await collectWatchlist(
        server,
        cfg,
        registryId,
        source.publicKey,
        source.keypair,
        values.all ? 200 : 1,
      );
      const counts = await readWatchCount(server, cfg, {
        registryId,
        publicKey: source.publicKey,
        keypair: source.keypair,
      });

      if (values.json) {
        process.stdout.write(`${JSON.stringify({ ...counts, watched }, null, 2)}\n`);
        return 0;
      }

      if (watched.length === 0) {
        process.stdout.write("Watchlist is empty.\n");
        return 0;
      }
      process.stdout.write(`Registry ${registryId} on ${cfg.name}: ${counts.active} active / ${counts.total} total\n\n`);
      for (const entry of watched) {
        process.stdout.write(
          `#${String(entry.id).padEnd(4)} ${entry.target}  ${entry.label || "(unnamed)"}\n` +
            `       owner ${entry.owner} · warn ${formatDuration(entry.warnLedgers * 5)}\n`,
        );
      }
      return 0;
    }

    case "doctor": {
      const server = openServer(cfg);
      const health = await server.getHealth();
      const latest = await server.getLatestLedger();
      process.stdout.write(
        [
          `network      ${cfg.name} (${cfg.rpcUrl})`,
          `rpc health   ${health.status}`,
          `latest ledger ${latest.sequence}`,
          `close time   ${latest.protocolVersion ? `protocol ${latest.protocolVersion}, ~5s per ledger` : "~5s per ledger"}`,
          `registry     ${registryId ?? "(none configured)"}`,
          `warn window  ${formatDuration(warnLedgers * 5)} (${warnLedgers} ledgers)`,
        ].join("\n") + "\n",
      );
      return 0;
    }

    default: {
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
