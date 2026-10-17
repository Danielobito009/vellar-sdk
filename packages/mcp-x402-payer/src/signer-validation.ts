// Startup validation of the configured signer.
//
// If the signer key is malformed, unfunded, or on the wrong network, fail
// fast at startup rather than waiting for the first payment attempt. This
// check validates that the account exists on the configured network's RPC.
//
// For keypairs (layer 1): the signer address must exist as an account.
// For smart accounts (layer 2): the wallet contract must exist.
//
// Account-not-found and RPC failures are distinguished so the operator
// gets actionable diagnostics. A not-found is a configuration error
// (wrong key, wrong network). An RPC failure could be transient (retry
// is reasonable) or persistent (RPC is misconfigured, down, or blocked).

import { Address, Keypair, StrKey, rpc, xdr } from "@stellar/stellar-sdk";
import type { PayerConfig } from "./config.js";

/** Raised when the signer account does not exist on the configured network. */
export class SignerAccountNotFoundError extends Error {
  constructor(
    readonly address: string,
    readonly network: string,
  ) {
    super(
      `Signer account ${address} does not exist on ${network}. ` +
        `Verify the secret is correct and the network configuration is right.`,
    );
    this.name = "SignerAccountNotFoundError";
  }
}

/** Raised when the RPC cannot be reached or returned an error. */
export class SignerValidationRpcError extends Error {
  constructor(
    readonly address: string,
    readonly network: string,
    readonly rpcUrl: string,
    readonly originalError: Error,
  ) {
    super(
      `Failed to validate signer account ${address} on ${network} ` +
        `(RPC: ${rpcUrl}): ${originalError.message}. ` +
        `Check that the RPC is reachable and configured correctly.`,
    );
    this.name = "SignerValidationRpcError";
    this.cause = originalError;
  }
}

/**
 * Validate that the configured signer resolves to an account on the network.
 *
 * For keypairs (layer 1): checks that an account with the signer's public key exists.
 * For smart accounts (layer 2): checks that the wallet contract exists.
 *
 * @throws SignerAccountNotFoundError if the account/contract does not exist
 * @throws SignerValidationRpcError if the RPC call fails
 */
export async function validateSignerAccount(
  config: PayerConfig,
  signerAddress: string,
): Promise<void> {
  // Select the RPC URL. For smart accounts, use the configured URL or the default.
  // For keypairs, layer 1 accounts are on Horizon (classic), but we still validate
  // using Soroban RPC by checking if the contract (for smart account) or account
  // (for keypair) entry exists in the ledger.
  const rpcUrl = config.rpcUrl ?? getDefaultRpcUrl(config.network);

  try {
    const server = new rpc.Server(rpcUrl);

    // Both G… (accounts) and C… (contracts) are addressable in Soroban ledger.
    // For keypairs: check that the account entry exists.
    // For smart accounts: check that the contract entry exists.
    const address = new Address(signerAddress);

    // Create a ledger key for the account/contract.
    let ledgerKey: xdr.LedgerKey;
    if (StrKey.isValidEd25519PublicKey(signerAddress)) {
      // Classic account (G…): create account entry ledger key
      const kp = Keypair.fromPublicKey(signerAddress);
      ledgerKey = xdr.LedgerKey.account(
        new xdr.LedgerKeyAccount({
          accountId: kp.xdrAccountId(),
        }),
      );
    } else if (StrKey.isValidContract(signerAddress)) {
      // Smart contract (C…): create contract instance ledger key
      ledgerKey = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: address.toScAddress(),
          key: xdr.ScVal.scvLedgerKeyContractInstance(),
          durability: xdr.ContractDataDurability.persistent(),
        }),
      );
    } else {
      throw new Error(`Invalid address format: ${signerAddress}`);
    }

    // Query the ledger for the account/contract entry
    const entries = await server.getLedgerEntries(ledgerKey);

    // If entries array is empty or all entries are null, the account doesn't exist
    if (!entries.entries || entries.entries.length === 0 || entries.entries[0] === null) {
      throw new SignerAccountNotFoundError(signerAddress, config.network);
    }
  } catch (err) {
    // If it's already our custom error, rethrow it
    if (err instanceof SignerAccountNotFoundError) {
      throw err;
    }

    // Otherwise, it's an RPC error
    const rpcUrl = config.rpcUrl ?? getDefaultRpcUrl(config.network);
    const originalError = err instanceof Error ? err : new Error(String(err));
    throw new SignerValidationRpcError(signerAddress, config.network, rpcUrl, originalError);
  }
}

/**
 * Get the default Soroban RPC URL for a network.
 *
 * Matches the defaults used by the signer creation functions.
 */
function getDefaultRpcUrl(network: "testnet" | "mainnet"): string {
  const defaults: Record<string, string> = {
    testnet: "https://soroban-testnet.stellar.org",
    mainnet: "https://mainnet.sorobanrpc.com",
  };
  return defaults[network]!;
}
