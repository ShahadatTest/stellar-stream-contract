import type { ScanResult } from "./scan.ts";
import { formatDuration } from "./ttl.ts";
import type { Risk } from "./ttl.ts";

const ANSI: Record<Risk, string> = {
  healthy: "\u001b[32m",
  watch: "\u001b[33m",
  urgent: "\u001b[33m",
  critical: "\u001b[31m",
  missing: "\u001b[31m",
};
const RESET = "\u001b[0m";
const DIM = "\u001b[2m";

export function paint(text: string, risk: Risk, color: boolean): string {
  return color ? `${ANSI[risk]}${text}${RESET}` : text;
}

export function dim(text: string, color: boolean): string {
  return color ? `${DIM}${text}${RESET}` : text;
}

function riskLabel(risk: Risk): string {
  switch (risk) {
    case "missing":
      return "ARCHIVED";
    case "critical":
      return "CRITICAL";
    case "urgent":
      return "URGENT";
    case "watch":
      return "WATCH";
    default:
      return "OK";
  }
}

/** Fixed-width table of the scan result, sized for an 100-column terminal. */
export function renderText(result: ScanResult, options: { color?: boolean } = {}): string {
  const color = options.color ?? process.stdout.isTTY === true;
  const rows = result.contracts.map((contract) => {
    const expiry = contract.expiresAt ? contract.expiresAt.slice(0, 16).replace("T", " ") : "unknown";
    return {
      risk: contract.risk,
      cells: [
        riskLabel(contract.risk).padEnd(8),
        (contract.label || "(unnamed)").slice(0, 28).padEnd(28),
        contract.contractId.slice(0, 12).padEnd(12),
        (contract.secondsRemaining === null ? "?" : formatDuration(contract.secondsRemaining)).padStart(10),
        expiry,
        String(contract.ledgersRemaining ?? "?"),
      ],
    };
  });

  const header = [
    "STATE".padEnd(8),
    "LABEL".padEnd(28),
    "CONTRACT".padEnd(12),
    "EXPIRES IN".padStart(10),
    "ESTIMATED EXPIRY",
    "LEDGERS",
  ].join("  ");

  const lines = [
    `${dim(`Soroban Sentinel · ${result.network} · ledger ${result.latestLedger}`, color)}`,
    "",
    dim(header, color),
    dim("-".repeat(header.length), color),
    ...rows.map((row) => {
      const colored = [paint(row.cells[0], row.risk, color), ...row.cells.slice(1)];
      return colored.join("  ");
    }),
  ];

  const { summary } = result;
  lines.push("");
  lines.push(
    [
      `${summary.healthy} healthy`,
      `${summary.watch} watch`,
      `${summary.urgent} urgent`,
      `${summary.critical} critical`,
      `${summary.missing} archived`,
    ].join(" · "),
  );

  if (summary.missing > 0) {
    lines.push("");
    lines.push(
      "Archived means the entry is not live on this network: it was either never deployed or its footprint has been reclaimed and needs a RestoreFootprint transaction.",
    );
  }

  return lines.join("\n");
}

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}
