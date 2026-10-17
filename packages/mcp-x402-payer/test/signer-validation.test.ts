import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Keypair, rpc, Address, StrKey } from "@stellar/stellar-sdk";
import {
  validateSignerAccount,
  SignerAccountNotFoundError,
  SignerValidationRpcError,
} from "../src/signer-validation.js";
import { testConfig, testEnv } from "./helpers.js";

// Valid contract address for testing smart accounts
const TEST_WALLET = "CAFIATCEAZJTGQQKFL3N2YB6VMCUN2UYX4QD5A3FALDRU7UJJ6OWBKOW";

describe("signer validation — happy path", () => {
  it("validates a keypair signer that exists on the network", async () => {
    const keypair = Keypair.random();
    const config = testConfig();

    // Mock the RPC Server
    const mockGetLedgerEntries = vi.fn().mockResolvedValue({
      entries: [{ ledgerEntryData: "mock-account-data" }],
    });

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      await expect(
        validateSignerAccount(config, keypair.publicKey()),
      ).resolves.toBeUndefined();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("validates a smart account signer that exists on the network", async () => {
    const config = testConfig();

    const mockGetLedgerEntries = vi.fn().mockResolvedValue({
      entries: [{ ledgerEntryData: "mock-contract-data" }],
    });

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      await expect(validateSignerAccount(config, TEST_WALLET)).resolves.toBeUndefined();
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("signer validation — account not found", () => {
  it("throws SignerAccountNotFoundError when keypair account does not exist", async () => {
    const keypair = Keypair.random();
    const config = testConfig();

    const mockGetLedgerEntries = vi.fn().mockResolvedValue({
      entries: [], // Empty entries means account not found
    });

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      await expect(
        validateSignerAccount(config, keypair.publicKey()),
      ).rejects.toMatchObject({
        name: "SignerAccountNotFoundError",
        address: keypair.publicKey(),
        network: "testnet",
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("throws SignerAccountNotFoundError when smart account contract does not exist", async () => {
    const config = testConfig();

    const mockGetLedgerEntries = vi.fn().mockResolvedValue({
      entries: [null], // Null entry means not found
    });

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      await expect(validateSignerAccount(config, TEST_WALLET)).rejects.toMatchObject({
        name: "SignerAccountNotFoundError",
        address: TEST_WALLET,
        network: "testnet",
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("includes helpful guidance in the error message", async () => {
    const keypair = Keypair.random();
    const config = testConfig();

    const mockGetLedgerEntries = vi.fn().mockResolvedValue({
      entries: [],
    });

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      try {
        await validateSignerAccount(config, keypair.publicKey());
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SignerAccountNotFoundError);
        expect((err as Error).message).toMatch(/does not exist/);
        expect((err as Error).message).toMatch(/secret is correct/);
        expect((err as Error).message).toMatch(/network configuration/);
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("signer validation — RPC failures", () => {
  it("throws SignerValidationRpcError when RPC is unreachable", async () => {
    const keypair = Keypair.random();
    const config = testConfig();
    const rpcError = new Error("Connection refused");

    const mockGetLedgerEntries = vi.fn().mockRejectedValue(rpcError);

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      await expect(
        validateSignerAccount(config, keypair.publicKey()),
      ).rejects.toMatchObject({
        name: "SignerValidationRpcError",
        address: keypair.publicKey(),
        network: "testnet",
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("includes the original error cause in the RpcError", async () => {
    const keypair = Keypair.random();
    const config = testConfig();
    const originalError = new Error("Timeout after 30s");

    const mockGetLedgerEntries = vi.fn().mockRejectedValue(originalError);

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      try {
        await validateSignerAccount(config, keypair.publicKey());
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SignerValidationRpcError);
        expect((err as SignerValidationRpcError).originalError).toBe(originalError);
        expect((err as Error).message).toContain("Timeout after 30s");
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("includes the RPC URL in the error for debugging", async () => {
    const keypair = Keypair.random();
    const customRpcUrl = "https://custom.rpc.example.com";
    const env = testEnv();
    env.VELLAR_X402_RPC_URL = customRpcUrl;
    const config = testConfig();

    const rpcError = new Error("Invalid request");

    const mockGetLedgerEntries = vi.fn().mockRejectedValue(rpcError);

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      try {
        await validateSignerAccount(config, keypair.publicKey());
        expect.unreachable("should have thrown");
      } catch (err) {
        expect((err as SignerValidationRpcError).rpcUrl).toContain("https");
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("suggests checking RPC configuration in the error message", async () => {
    const keypair = Keypair.random();
    const config = testConfig();
    const rpcError = new Error("RPC server error");

    const mockGetLedgerEntries = vi.fn().mockRejectedValue(rpcError);

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      try {
        await validateSignerAccount(config, keypair.publicKey());
        expect.unreachable("should have thrown");
      } catch (err) {
        expect((err as Error).message).toMatch(/RPC is reachable/);
        expect((err as Error).message).toMatch(/configured correctly/);
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("signer validation — edge cases", () => {
  it("rejects an invalid address format", async () => {
    const config = testConfig();

    const mockGetLedgerEntries = vi.fn();

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      await expect(validateSignerAccount(config, "INVALID_ADDRESS")).rejects.toThrow(
        /Invalid address format/,
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("distinguishes NotFound from RPC errors by exception type", async () => {
    const keypair = Keypair.random();
    const config = testConfig();

    // First test: account not found
    let mockGetLedgerEntries = vi.fn().mockResolvedValue({ entries: [] });

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      try {
        await validateSignerAccount(config, keypair.publicKey());
      } catch (err) {
        expect(err).toBeInstanceOf(SignerAccountNotFoundError);
      }
    } finally {
      vi.restoreAllMocks();
    }

    // Second test: RPC error
    mockGetLedgerEntries = vi.fn().mockRejectedValue(new Error("RPC error"));

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      try {
        await validateSignerAccount(config, keypair.publicKey());
      } catch (err) {
        expect(err).toBeInstanceOf(SignerValidationRpcError);
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("validates both keypair (G…) and smart account (C…) addresses", async () => {
    const keypair = Keypair.random();
    const config = testConfig();

    const mockGetLedgerEntries = vi.fn().mockResolvedValue({
      entries: [{ ledgerEntryData: "mock" }],
    });

    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(mockGetLedgerEntries);

    try {
      // Test with keypair (G…)
      await expect(validateSignerAccount(config, keypair.publicKey())).resolves.toBeUndefined();

      // Test with smart account (C…)
      await expect(validateSignerAccount(config, TEST_WALLET)).resolves.toBeUndefined();

      // Verify both were called
      expect(mockGetLedgerEntries).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
