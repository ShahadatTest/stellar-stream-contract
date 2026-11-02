import { Address, StrKey, xdr } from "@stellar/stellar-sdk";

export type Durability = "persistent" | "temporary";
export type EntryKind = "instance" | "data";

export interface KeySpec {
  contractId: string;
  kind: EntryKind;
  durability: Durability;
  /** Base64 XDR of the storage key `ScVal`. Absent for instance entries. */
  keyXdr?: string;
}

/** Minimal shape shared by the SDK's XDR union arms. */
interface XdrArm {
  type: string;
  [field: string]: unknown;
}

export function contractScAddress(contractId: string): xdr.ScAddress {
  if (!StrKey.isValidContract(contractId)) {
    throw new Error(`Not a contract address: ${contractId}`);
  }
  return Address.fromString(contractId).toScAddress();
}

export function durabilityToXdr(durability: Durability): xdr.ContractDataDurability {
  return durability === "temporary"
    ? xdr.ContractDataDurability.temporary
    : xdr.ContractDataDurability.persistent;
}

export function durabilityFromXdr(value: xdr.ContractDataDurability): Durability {
  return value.name === "temporary" ? "temporary" : "persistent";
}

/**
 * The ledger key of a contract's instance entry.
 *
 * This key is always derivable from the contract id alone, which is what makes
 * "is this contract about to go dark?" a question any watcher can answer
 * without knowing the contract's storage layout. The instance entry is the one
 * whose archival takes the whole contract offline.
 */
export function instanceLedgerKey(contractId: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contractScAddress(contractId),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

/** Ledger key for one contract data entry, given its key as base64 `ScVal`. */
export function dataLedgerKey(
  contractId: string,
  keyXdr: string,
  durability: Durability = "persistent",
): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contractScAddress(contractId),
      key: xdr.ScVal.fromXdr(keyXdr, "base64"),
      durability: durabilityToXdr(durability),
    }),
  );
}

export function ledgerKeyToBase64(key: xdr.LedgerKey): string {
  return key.toXdr("base64");
}

/** Short, stable label for a storage key: `instance` or `data:<first 8 chars>…`. */
export function describeKey(spec: KeySpec): string {
  if (spec.kind === "instance") return "instance";
  const encoded = spec.keyXdr ?? "";
  const head = encoded.slice(0, 8);
  return `data:${head}${encoded.length > 8 ? "…" : ""}`;
}

/**
 * Extract the wasm hash from a contract instance entry, when the executable is
 * a wasm contract. A Stellar Asset Contract returns null, and nothing here may
 * throw: a malformed entry should degrade to "unknown", not crash a scan.
 */
export function wasmHashOf(entry: xdr.LedgerEntryData): string | null {
  try {
    const record = entry as unknown as XdrArm;
    if (record.type !== "contractData") return null;

    const val = (record.contractData as XdrArm).val as XdrArm;
    if (val.type !== "scvContractInstance") return null;

    const instance = val.instance as XdrArm;
    const executable = instance.executable as XdrArm;
    if (executable.type !== "contractExecutableWasm") return null;

    return Buffer.from(executable.wasmHash as Uint8Array).toString("hex");
  } catch {
    return null;
  }
}
