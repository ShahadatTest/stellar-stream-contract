import assert from "node:assert/strict";
import { test } from "node:test";
import { LEDGERS_PER_DAY } from "../src/network.ts";
import { classifyRisk, daysToLedgers, formatDuration, projectTtl } from "../src/ttl.ts";

test("projectTtl converts ledgers into a wall-clock deadline", () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const projection = projectTtl({
    liveUntilLedger: 1_000_000,
    currentLedger: 900_000,
    warnLedgers: daysToLedgers(30),
    now,
    closeTimeSeconds: 5,
  });

  assert.equal(projection.ledgersRemaining, 100_000);
  assert.equal(projection.secondsRemaining, 500_000);
  assert.equal(projection.expiresAt, new Date(now + 500_000_000).toISOString());
  // 100k ledgers is under a 518k warn window and below a third of it (171k).
  assert.equal(projection.risk, "urgent");
});

test("projectTtl reports missing for a lapsed entry", () => {
  const projection = projectTtl({ liveUntilLedger: 10, currentLedger: 20, warnLedgers: LEDGERS_PER_DAY });
  assert.equal(projection.ledgersRemaining, -10);
  assert.equal(projection.expiresAt, null);
  assert.equal(projection.risk, "missing");
});

test("classifyRisk follows the warn window", () => {
  const warn = 100_000;
  assert.equal(classifyRisk(500_000, warn), "healthy");
  assert.equal(classifyRisk(100_000, warn), "watch");
  assert.equal(classifyRisk(33_000, warn), "urgent");
  assert.equal(classifyRisk(10_000, warn), "critical");
  assert.equal(classifyRisk(0, warn), "missing");
  assert.equal(classifyRisk(-5, warn), "missing");
  assert.equal(classifyRisk(Number.NaN, warn), "missing");
});

test("classifyRisk treats a zero warn window as one day", () => {
  assert.equal(classifyRisk(LEDGERS_PER_DAY + 1, 0), "healthy");
  assert.equal(classifyRisk(1_000, 0), "critical");
});

test("formatDuration is coarse but readable", () => {
  assert.equal(formatDuration(0), "expired");
  assert.equal(formatDuration(-30), "expired");
  assert.equal(formatDuration(90), "1m");
  assert.equal(formatDuration(5_400), "1h 30m");
  assert.equal(formatDuration(3_600), "1h");
  assert.equal(formatDuration(86_400 * 3 + 3_600 * 4), "3d 4h");
  assert.equal(formatDuration(86_400 * 198), "198d");
});

test("daysToLedgers matches the 5s close time", () => {
  assert.equal(daysToLedgers(1), 17_280);
  assert.equal(daysToLedgers(30), 518_400);
  assert.equal(daysToLedgers(365), 6_307_200);
});
