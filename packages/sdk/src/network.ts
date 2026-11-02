import { Networks } from "@stellar/stellar-sdk";

/** Stellar closes a ledger roughly every 5 seconds. */
export const CLOSE_TIME_SECONDS = 5;

/** 86,400s / 5s. */
export const LEDGERS_PER_DAY = 17_280;

/** 365 * LEDGERS_PER_DAY. */
export const LEDGERS_PER_YEAR = 6_307_200;

export type NetworkName = "testnet" | "futurenet" | "mainnet";

export interface NetworkConfig {
  name: NetworkName;
  rpcUrl: string;
  passphrase: string;
  /** Only present on networks with a friendbot. */
  friendbotUrl?: string;
  explorerBase: string;
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    name: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    passphrase: Networks.TESTNET,
    friendbotUrl: "https://friendbot.stellar.org",
    explorerBase: "https://stellar.expert/explorer/testnet",
  },
  futurenet: {
    name: "futurenet",
    rpcUrl: "https://rpc-futurenet.stellar.org",
    passphrase: Networks.FUTURENET,
    friendbotUrl: "https://friendbot-futurenet.stellar.org",
    explorerBase: "https://stellar.expert/explorer/futurenet",
  },
  mainnet: {
    name: "mainnet",
    rpcUrl: "https://mainnet.sorobanrpc.com",
    passphrase: Networks.PUBLIC,
    explorerBase: "https://stellar.expert/explorer/public",
  },
};

/**
 * Resolve a network by name, honouring `SENTINEL_NETWORK` and
 * `SENTINEL_RPC_URL` overrides for private or regional RPC endpoints.
 */
export function resolveNetwork(name?: string): NetworkConfig {
  const requested = (name ?? process.env.SENTINEL_NETWORK ?? "testnet").toLowerCase();
  const preset = NETWORKS[requested as NetworkName];
  if (!preset) {
    throw new Error(`Unknown network "${requested}". Expected one of: ${Object.keys(NETWORKS).join(", ")}.`);
  }
  const rpcUrl = process.env.SENTINEL_RPC_URL ?? preset.rpcUrl;
  return { ...preset, rpcUrl };
}

export function explorerContractUrl(cfg: NetworkConfig, contractId: string): string {
  return `${cfg.explorerBase}/contract/${contractId}`;
}

/** Delay between ledger `from` and ledger `to`, in seconds. */
export function ledgersToSeconds(ledgers: number): number {
  return Math.max(0, Math.round(ledgers)) * CLOSE_TIME_SECONDS;
}
