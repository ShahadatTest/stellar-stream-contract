import { CLOSE_TIME_SECONDS, LEDGERS_PER_DAY } from "./network.ts";

/**
 * - `healthy`  more time left than the watch window
 * - `watch`    inside the watch window: plan a TTL extension
 * - `urgent`   a third of the window left
 * - `critical` a tenth of the window left: extend now
 * - `missing`  the entry is not live: archived (or never deployed)
 */
export type Risk = "healthy" | "watch" | "urgent" | "critical" | "missing";

export interface TtlProjection {
  liveUntilLedger: number;
  currentLedger: number;
  ledgersRemaining: number;
  secondsRemaining: number;
  /** ISO timestamp of the estimated archival moment, null when missing. */
  expiresAt: string | null;
  risk: Risk;
}

export interface ProjectTtlInput {
  liveUntilLedger: number;
  currentLedger: number;
  /** Warn when fewer than this many ledgers remain. 0 falls back to 1 day. */
  warnLedgers: number;
  /** Wall clock in epoch milliseconds; injectable for tests. */
  now?: number;
  closeTimeSeconds?: number;
}

/** Classify the remaining ledger budget against a per-contract warn window. */
export function classifyRisk(ledgersRemaining: number, warnLedgers: number): Risk {
  if (!Number.isFinite(ledgersRemaining) || ledgersRemaining <= 0) return "missing";
  const window = warnLedgers > 0 ? warnLedgers : LEDGERS_PER_DAY;
  if (ledgersRemaining <= Math.max(1, Math.ceil(window * 0.1))) return "critical";
  if (ledgersRemaining <= Math.max(2, Math.ceil(window * 0.33))) return "urgent";
  if (ledgersRemaining <= window) return "watch";
  return "healthy";
}

/** Turn a ledger-level TTL reading into a wall-clock forecast. */
export function projectTtl(input: ProjectTtlInput): TtlProjection {
  const closeTimeSeconds = input.closeTimeSeconds ?? CLOSE_TIME_SECONDS;
  const now = input.now ?? Date.now();
  const ledgersRemaining = input.liveUntilLedger - input.currentLedger;
  const secondsRemaining = ledgersRemaining * closeTimeSeconds;

  return {
    liveUntilLedger: input.liveUntilLedger,
    currentLedger: input.currentLedger,
    ledgersRemaining,
    secondsRemaining,
    expiresAt: secondsRemaining > 0 ? new Date(now + secondsRemaining * 1000).toISOString() : null,
    risk: classifyRisk(ledgersRemaining, input.warnLedgers),
  };
}

/** Human, coarse duration: "45m", "12h", "3d 4h", "198d". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "expired";
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${Math.max(1, totalMinutes)}m`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${totalHours}h` : `${totalHours}h ${minutes}m`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/** Convert a warn window expressed in days to ledgers. */
export function daysToLedgers(days: number): number {
  return Math.round(days * LEDGERS_PER_DAY);
}
