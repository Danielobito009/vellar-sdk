// Tests for the x402_session_budget MCP tool.
//
// Ensures the tool accurately reflects the current ledger state without
// exposing secrets, raw ceiling values, or other sensitive configuration.
// The tool bridges the ledger's internal per-asset tracking and renders it
// in a form the model can use to understand its spending progress.

import { describe, expect, it } from "vitest";
import { createSpendLedger, type SpendLedger } from "../src/ledger.js";
import { createMcpServer, type ServerDeps } from "../src/server.js";
import { ASSET_A, ASSET_B, PAYTO, testConfig } from "./helpers.js";

/** Extract text from an MCP tool result. */
function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.map((c) => c.text ?? "").join("\n");
}

/** Invoke a registered tool by reaching into the server's registry. */
async function callTool(
  server: ReturnType<typeof createMcpServer>,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const registered = (
    server as unknown as {
      _registeredTools: Record<string, { handler: (a: unknown, e: unknown) => unknown }>;
    }
  )._registeredTools[name];
  if (!registered) throw new Error(`tool ${name} is not registered`);
  const out = (await registered.handler(args, {})) as {
    content: Array<{ type: string; text?: string }>;
  };
  return textOf(out);
}

/** Create a minimal mock payer for testing. */
function mockPayer(address: string) {
  return {
    payerAddress: address,
    quote: async () => ({ requiresPayment: false }),
    pay: async () => ({ paid: false }),
  };
}

describe("x402_session_budget tool", () => {
  describe("happy path — zero spend", () => {
    it("reports all assets at their configured ceiling with zero spent", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      expect(output).toContain(`Payer address: ${PAYTO}`);
      expect(output).toContain("Network: testnet");
      expect(output).toContain(`${ASSET_A}: 0 spent of 1000000, 1000000 remaining`);
      expect(output).toContain(`${ASSET_B}: 0 spent of 500, 500 remaining`);
    });

    it("emphasizes process-level enforcement and non-security boundary", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      expect(output).toContain("enforced by this process, NOT on-chain");
      expect(output).toContain("reset when it restarts");
      expect(output).toContain("Do not report this as an on-chain limit");
    });
  });

  describe("after spending", () => {
    it("reflects spend-to-date on a single asset after record", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      ledger.record(ASSET_A, 100n);

      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      expect(output).toContain(`${ASSET_A}: 100 spent of 1000000, 999900 remaining`);
      // ASSET_B untouched.
      expect(output).toContain(`${ASSET_B}: 0 spent of 500, 500 remaining`);
    });

    it("tracks multiple assets independently", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      ledger.record(ASSET_A, 250_000n);
      ledger.record(ASSET_B, 100n);

      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      expect(output).toContain(`${ASSET_A}: 250000 spent of 1000000, 750000 remaining`);
      expect(output).toContain(`${ASSET_B}: 100 spent of 500, 400 remaining`);
    });

    it("never reports negative remaining — floors at zero", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      // Spend the entire budget and then some (edge case from ledger tests).
      ledger.record(ASSET_A, 900_000n);
      ledger.record(ASSET_A, 900_000n);

      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      // After over-recording, remaining is floored at 0.
      expect(output).toContain(`${ASSET_A}: 1800000 spent of 1000000, 0 remaining`);
    });

    it("represents ceiling exhaustion clearly", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      // Spend exactly the ceiling on ASSET_B (500 base units).
      ledger.record(ASSET_B, 500n);

      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      expect(output).toContain(`${ASSET_B}: 500 spent of 500, 0 remaining`);
      expect(output).toContain("Per-asset session ceilings");
    });
  });

  describe("sequence of payments", () => {
    it("reflects cumulative spend accurately after multiple payments on one asset", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);

      // Simulate three sequential payments.
      const payments = [100_000n, 250_000n, 150_000n];
      let cumulative = 0n;
      for (const amount of payments) {
        ledger.record(ASSET_A, amount);
        cumulative += amount;
      }

      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});
      const remaining = 1_000_000n - cumulative;

      expect(output).toContain(`${ASSET_A}: ${cumulative} spent of 1000000, ${remaining} remaining`);
    });

    it("tracks interleaved spending on multiple assets", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);

      // Interleave: A, B, A, B pattern
      ledger.record(ASSET_A, 100_000n);
      ledger.record(ASSET_B, 50n);
      ledger.record(ASSET_A, 200_000n);
      ledger.record(ASSET_B, 200n);

      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      expect(output).toContain(`${ASSET_A}: 300000 spent of 1000000, 700000 remaining`);
      expect(output).toContain(`${ASSET_B}: 250 spent of 500, 250 remaining`);
    });
  });

  describe("security — no sensitive data exposed", () => {
    it("reports the payer's PUBLIC address, never a secret key", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      // Public addresses start with G… (keypair) or C… (smart account).
      expect(output).toContain(`Payer address: ${PAYTO}`);
      expect(PAYTO).toMatch(/^G/);
      // Never contains an S… key.
      expect(output).not.toMatch(/\bS[A-Z0-9]{55}\b/);
    });

    it("never exposes the allowlist as a list of asset IDs", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      // Assets appear ONLY in the per-asset breakdown line.
      const lines = output.split("\n");
      const assetLines = lines.filter((l) => l.includes(ASSET_A) || l.includes(ASSET_B));
      expect(assetLines.length).toBeGreaterThanOrEqual(2);
      // Each appearance is in the context of a breakdown (spent/ceiling/remaining).
      for (const line of assetLines) {
        expect(line).toMatch(/spent of|remaining/);
      }
    });

    it("formats output as human text, not a JSON structure the model might parse", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      // Human-readable lines, not JSON.
      expect(() => JSON.parse(output)).toThrow();
      // Contains narrative and guiding text.
      expect(output).toMatch(/Payer address:/);
      expect(output).toMatch(/Network:/);
      expect(output).toMatch(/Per-asset session ceilings/);
    });
  });

  describe("ledger integration", () => {
    it("matches the ledger's snapshot structure exactly", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);

      ledger.record(ASSET_A, 50_000n);
      ledger.record(ASSET_B, 100n);

      const snapshot = ledger.snapshot();
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      // Each snapshot entry must appear in the output.
      for (const snap of snapshot) {
        const expected = `${snap.asset}: ${snap.spent} spent of ${snap.ceiling}, ${snap.remaining} remaining`;
        expect(output).toContain(expected);
      }
    });

    it("handles a custom configuration with different assets and ceilings", async () => {
      const config = testConfig({
        assets: `${ASSET_A}:5000000,${ASSET_B}:10000`,
      });
      const ledger = createSpendLedger(config.ceilings);

      ledger.record(ASSET_A, 1_000_000n);
      ledger.record(ASSET_B, 5_000n);

      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      expect(output).toContain(`${ASSET_A}: 1000000 spent of 5000000, 4000000 remaining`);
      expect(output).toContain(`${ASSET_B}: 5000 spent of 10000, 5000 remaining`);
    });

    it("lists all configured assets, including those with zero spend", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);

      // Spend only on ASSET_A; ASSET_B remains untouched.
      ledger.record(ASSET_A, 100_000n);

      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      // Both assets must appear in output, even if one is zero.
      expect(output).toContain(`${ASSET_A}: 100000 spent of 1000000, 900000 remaining`);
      expect(output).toContain(`${ASSET_B}: 0 spent of 500, 500 remaining`);
    });
  });

  describe("output formatting and clarity", () => {
    it("includes all required sections", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      const sections = [
        "Payer address:",
        "Network:",
        "Per-asset session ceilings",
        "enforced by this process, NOT on-chain",
        "reset when it restarts",
      ];
      for (const section of sections) {
        expect(output).toContain(section);
      }
    });

    it("is concise enough to fit in a single model response", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const output = await callTool(server, "x402_session_budget", {});

      // Rough heuristic: under 2KiB for a simple budget report.
      expect(output.length).toBeLessThan(2048);
    });
  });

  describe("error cases", () => {
    it("accepts no arguments (schema requires empty inputSchema)", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      // This should not throw even with null/undefined args.
      const output = await callTool(server, "x402_session_budget", {});
      expect(output.length).toBeGreaterThan(0);
    });

    it("is read-only and produces no side effects", async () => {
      const config = testConfig();
      const ledger = createSpendLedger(config.ceilings);
      const server = createMcpServer({
        payer: mockPayer(PAYTO),
        config,
        ledger,
      });

      const before = await callTool(server, "x402_session_budget", {});

      // Call again with no intervening spend.
      const after = await callTool(server, "x402_session_budget", {});

      expect(before).toBe(after);
    });
  });
});
