import { rpc, xdr, Keypair, TransactionBuilder, Operation, Account, BASE_FEE } from "@stellar/stellar-sdk";
import type { NetworkConfig } from "./network.ts";

export function openServer(cfg: NetworkConfig): rpc.Server {
  return new rpc.Server(cfg.rpcUrl, {
    allowHttp: cfg.rpcUrl.startsWith("http://"),
  });
}

let ephemeral: Keypair | null = null;

/**
 * Resolve the account used as the transaction source for simulations and
 * writes.
 *
 * Simulations need an existing account even though nothing is signed, so on
 * testnet/futurenet a throwaway friendbot-funded key is created on demand. On
 * mainnet an explicit `SENTINEL_SECRET` (or `SENTINEL_PUBLIC_KEY` for
 * read-only use) is required.
 */
export async function resolveSource(
  cfg: NetworkConfig,
  options: { secret?: string; readOnly?: boolean } = {},
): Promise<{ keypair: Keypair | null; publicKey: string }> {
  const secret = options.secret ?? process.env.SENTINEL_SECRET;
  if (secret) {
    const keypair = Keypair.fromSecret(secret);
    return { keypair, publicKey: keypair.publicKey() };
  }

  const envPublicKey = process.env.SENTINEL_PUBLIC_KEY;
  if (envPublicKey) {
    return { keypair: null, publicKey: envPublicKey };
  }

  if (!cfg.friendbotUrl) {
    throw new Error(
      `No signing key configured for ${cfg.name}. Set SENTINEL_SECRET (or SENTINEL_PUBLIC_KEY for read-only commands).`,
    );
  }

  if (!ephemeral) {
    ephemeral = Keypair.random();
    await fundWithFriendbot(cfg, ephemeral.publicKey());
  }
  return { keypair: ephemeral, publicKey: ephemeral.publicKey() };
}

export async function fundWithFriendbot(cfg: NetworkConfig, publicKey: string): Promise<void> {
  if (!cfg.friendbotUrl) {
    throw new Error(`${cfg.name} has no friendbot; fund ${publicKey} manually.`);
  }
  const url = `${cfg.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);
  if (!response.ok && response.status !== 400) {
    // 400 means "account already funded", which is fine.
    throw new Error(`Friendbot failed for ${publicKey}: ${response.status} ${await response.text()}`);
  }
}

export interface InvokeResult {
  hash: string;
  status: string;
  returnValue: unknown;
}

/** Build, simulate and (optionally) sign + submit a contract invocation. */
export async function invokeContract(
  server: rpc.Server,
  cfg: NetworkConfig,
  params: {
    contractId: string;
    method: string;
    args?: xdr.ScVal[];
    keypair?: Keypair | null;
    publicKey: string;
    submit?: boolean;
  },
): Promise<InvokeResult> {
  const account = await server.getAccount(params.publicKey);
  const tx = new TransactionBuilder(account as Account, {
    fee: BASE_FEE,
    networkPassphrase: cfg.passphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: params.contractId,
        function: params.method,
        args: params.args ?? [],
      }),
    )
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);

  if (!params.submit) {
    prepared.sign(params.keypair ?? Keypair.random());
    const simulation = await server.simulateTransaction(prepared);
    if ("error" in simulation) {
      throw new Error(`Simulation failed: ${simulation.error}`);
    }
    return {
      hash: "",
      status: "SIMULATED",
      returnValue: "result" in simulation ? simulation.result?.retval : undefined,
    };
  }

  if (!params.keypair) {
    throw new Error("A signing key is required to submit this invocation.");
  }

  prepared.sign(params.keypair);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error(`Submission failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
  }

  const final = await server.pollTransaction(sent.hash, {
    attempts: 15,
    sleepStrategy: () => 1000,
  });

  if (final.status !== "SUCCESS") {
    throw new Error(`Transaction ${sent.hash} ended with status ${final.status}`);
  }

  return {
    hash: sent.hash,
    status: final.status,
    returnValue: final.returnValue,
  };
}
