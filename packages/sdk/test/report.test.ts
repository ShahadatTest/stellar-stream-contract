import assert from "node:assert/strict";
import { test } from "node:test";
import { renderJson, renderText } from "../src/report.ts";
import type { ContractReport, ScanResult } from "../src/scan.ts";
import type { Risk } from "../src/ttl.ts";

const RISKS: Risk[] = ["healthy", "watch", "urgent", "critical", "missing"];

function contract(risk: Risk, index: number): ContractReport {
  const missing = risk === "missing";
  const ledgersRemaining = missing ? null : 10_000 * (5 - index);
  const secondsRemaining = missing ? null : (ledgersRemaining ?? 0) * 5;
  return {
    contractId: `C${risk.toUpperCase().padEnd(8, "X")}EXAMPLE`,
    label: `${risk}-label`,
    warnLedgers: 100_000,
    risk,
    missing,
    ledgersRemaining,
    secondsRemaining,
    expiresAt: missing ? null : "2026-06-01T12:00:00.000Z",
    entries: [],
    explorerUrl: `https://example.test/${risk}`,
  };
}

function fixture(): ScanResult {
  const contracts = RISKS.map((risk, index) => contract(risk, index));
  const summary = Object.fromEntries(RISKS.map((risk) => [risk, 1])) as Record<Risk, number>;
  return {
    network: "testnet",
    rpcUrl: "https://rpc.example.test",
    latestLedger: 1_234_567,
    scannedAt: "2026-01-02T03:04:05.000Z",
    contracts,
    summary,
  };
}

test("renderText with colour off covers every risk state", () => {
  const text = renderText(fixture(), { color: false });
  assert.equal(text.includes("\u001b["), false, "ANSI must stay off");
  assert.match(text, /Soroban Sentinel · testnet · ledger 1234567/);
  assert.match(text, /^STATE\s+LABEL\s+CONTRACT\s+EXPIRES IN\s+ESTIMATED EXPIRY\s+LEDGERS$/m);
  for (const [label, risk] of [
    ["OK", "healthy"],
    ["WATCH", "watch"],
    ["URGENT", "urgent"],
    ["CRITICAL", "critical"],
    ["ARCHIVED", "missing"],
  ] as const) {
    assert.match(text, new RegExp(`${label}\\s+${risk}-label`));
  }
  assert.match(text, /1 healthy · 1 watch · 1 urgent · 1 critical · 1 archived/);
  assert.match(text, /Archived means the entry is not live on this network/);
  // Snapshot of the colour-off table so a column change fails loudly.
  assert.equal(
    text,
    [
      "Soroban Sentinel · testnet · ledger 1234567",
      "",
      "STATE     LABEL                         CONTRACT      EXPIRES IN  ESTIMATED EXPIRY  LEDGERS",
      "-------------------------------------------------------------------------------------------",
      "OK        healthy-label                 CHEALTHYXEXA      2d 21h  2026-06-01 12:00  50000",
      "WATCH     watch-label                   CWATCHXXXEXA       2d 7h  2026-06-01 12:00  40000",
      "URGENT    urgent-label                  CURGENTXXEXA      1d 17h  2026-06-01 12:00  30000",
      "CRITICAL  critical-label                CCRITICALEXA       1d 3h  2026-06-01 12:00  20000",
      "ARCHIVED  missing-label                 CMISSINGXEXA           ?  unknown  ?",
      "",
      "1 healthy · 1 watch · 1 urgent · 1 critical · 1 archived",
      "",
      "Archived means the entry is not live on this network: it was either never deployed or its footprint has been reclaimed and needs a RestoreFootprint transaction.",
    ].join("\n"),
  );
});

test("renderJson preserves ScanResult fields, types and nullability", () => {
  const result = fixture();
  const parsed = JSON.parse(renderJson(result)) as ScanResult;
  assert.equal(parsed.network, "testnet");
  assert.equal(parsed.rpcUrl, "https://rpc.example.test");
  assert.equal(parsed.latestLedger, 1_234_567);
  assert.equal(parsed.scannedAt, "2026-01-02T03:04:05.000Z");
  assert.equal(parsed.contracts.length, 5);
  for (const risk of RISKS) {
    assert.equal(parsed.summary[risk], 1);
  }
  const byRisk = Object.fromEntries(parsed.contracts.map((c) => [c.risk, c]));
  for (const risk of RISKS) {
    const row = byRisk[risk];
    assert.ok(row, `missing contract for ${risk}`);
    assert.equal(typeof row.contractId, "string");
    assert.equal(typeof row.label, "string");
    assert.equal(typeof row.warnLedgers, "number");
    assert.equal(row.risk, risk);
    assert.equal(typeof row.missing, "boolean");
    assert.equal(typeof row.explorerUrl, "string");
    assert.ok(Array.isArray(row.entries));
    if (risk === "missing") {
      assert.equal(row.missing, true);
      assert.equal(row.ledgersRemaining, null);
      assert.equal(row.secondsRemaining, null);
      assert.equal(row.expiresAt, null);
    } else {
      assert.equal(row.missing, false);
      assert.equal(typeof row.ledgersRemaining, "number");
      assert.equal(typeof row.secondsRemaining, "number");
      assert.equal(typeof row.expiresAt, "string");
    }
  }
});
