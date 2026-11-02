import assert from "node:assert/strict";
import { test } from "node:test";
import { StrKey, xdr } from "@stellar/stellar-sdk";
import {
  contractScAddress,
  dataLedgerKey,
  describeKey,
  instanceLedgerKey,
  ledgerKeyToBase64,
  wasmHashOf,
} from "../src/footprint.ts";

const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 7));

test("instance key is derivable from the contract id alone", () => {
  const key = instanceLedgerKey(CONTRACT);
  assert.equal(key.type, "contractData");
  assert.equal(ledgerKeyToBase64(key), ledgerKeyToBase64(instanceLedgerKey(CONTRACT)));
  assert.equal(
    describeKey({ contractId: CONTRACT, kind: "instance", durability: "persistent" }),
    "instance",
  );
});

test("data keys round-trip their storage key and durability", () => {
  const keyXdr = xdr.ScVal.scvString("Vault:total").toXdr("base64");
  const temporary = dataLedgerKey(CONTRACT, keyXdr, "temporary");
  const persistent = dataLedgerKey(CONTRACT, keyXdr, "persistent");

  assert.equal(temporary.type, "contractData");
  assert.notEqual(ledgerKeyToBase64(temporary), ledgerKeyToBase64(persistent));
  assert.match(
    describeKey({ contractId: CONTRACT, kind: "data", durability: "temporary", keyXdr }),
    /^data:/,
  );
});

test("non-contract addresses are rejected early", () => {
  assert.throws(() => contractScAddress("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"), /Not a contract/);
  assert.throws(() => instanceLedgerKey("not-an-address"), /Not a contract/);
});

test("wasmHashOf reports the executable hash and ignores SAC entries", () => {
  const entryWith = (executableName: string, wasmHash?: Uint8Array): xdr.LedgerEntryData =>
    ({
      type: "contractData",
      contractData: {
        val: {
          type: "scvContractInstance",
          instance: {
            executable: { type: executableName, wasmHash },
          },
        },
      },
    }) as unknown as xdr.LedgerEntryData;

  assert.equal(wasmHashOf(entryWith("contractExecutableWasm", Buffer.alloc(32, 9))), "09".repeat(32));
  assert.equal(wasmHashOf(entryWith("contractExecutableStellarAsset")), null);
  // A non-instance entry cannot yield a hash, and must not throw.
  assert.equal(wasmHashOf({} as xdr.LedgerEntryData), null);
});
