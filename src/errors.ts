/**
 * SDK error classification — mirrors MeneseAgent ErrorClassifier.mo.
 * Translates raw error strings into structured, user-friendly responses.
 */

export type ErrorCode =
  | "insufficient_funds"
  | "nonce_error"
  | "gas_estimation_failed"
  | "rate_limited"
  | "invalid_address"
  | "slippage_exceeded"
  | "insufficient_credits"
  | "unauthorized"
  | "network_error"
  | "contract_reverted"
  | "invalid_input"
  | "transient"
  | "unknown";

export interface ClassifiedError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  userMessage: string;
}

type Pattern = { substring: string; code: ErrorCode; userMessage: string; retryable: boolean };

// Ordered by priority — first match wins. Mirrors ErrorClassifier.mo patterns.
const PATTERNS: Pattern[] = [
  // Nonce issues — retryable via resync
  { substring: "nonce too low", code: "nonce_error", userMessage: "Transaction nonce conflict — retrying.", retryable: true },
  { substring: "noncetoolow", code: "nonce_error", userMessage: "Transaction nonce conflict — retrying.", retryable: true },
  { substring: "nonce too high", code: "nonce_error", userMessage: "Transaction nonce conflict — retrying.", retryable: true },
  { substring: "noncetoohigh", code: "nonce_error", userMessage: "Transaction nonce conflict — retrying.", retryable: true },
  { substring: "nonce_expired", code: "nonce_error", userMessage: "Transaction nonce expired — retrying.", retryable: true },
  { substring: "already known", code: "nonce_error", userMessage: "Transaction already submitted — retrying with fresh nonce.", retryable: true },
  { substring: "replacement transaction underpriced", code: "nonce_error", userMessage: "Transaction nonce conflict — retrying.", retryable: true },
  { substring: "nonce has already been used", code: "nonce_error", userMessage: "Transaction nonce conflict — retrying.", retryable: true },
  { substring: "pending transaction", code: "nonce_error", userMessage: "A transaction is already pending — retrying.", retryable: true },

  // Gas issues — retryable via re-preflight
  { substring: "gas quote stale", code: "gas_estimation_failed", userMessage: "Gas estimate expired — re-estimating.", retryable: true },
  { substring: "missing gas quote", code: "gas_estimation_failed", userMessage: "Gas estimation failed — try again.", retryable: true },
  { substring: "gas quote expired", code: "gas_estimation_failed", userMessage: "Gas estimate expired — re-estimating.", retryable: true },
  { substring: "maxfeepergas too low", code: "gas_estimation_failed", userMessage: "Gas price too low for current network conditions. Try again shortly.", retryable: true },
  { substring: "max fee per gas less than block base fee", code: "gas_estimation_failed", userMessage: "Gas price too low for current block. Try again shortly.", retryable: true },
  { substring: "intrinsic gas too low", code: "gas_estimation_failed", userMessage: "Gas limit too low for this transaction.", retryable: false },
  { substring: "gas required exceeds", code: "gas_estimation_failed", userMessage: "Transaction requires more gas than allowed.", retryable: false },

  // Billing/credits — not retryable
  { substring: "insufficient credits", code: "insufficient_credits", userMessage: "Menese gateway credits depleted. Please top up your account.", retryable: false },
  { substring: "insufficient gateway credits", code: "insufficient_credits", userMessage: "Menese gateway credits depleted. Please top up your account.", retryable: false },
  { substring: "insufficient allowance", code: "insufficient_credits", userMessage: "Menese gateway credits depleted. Please top up your account.", retryable: false },
  { substring: "no active package", code: "insufficient_credits", userMessage: "No active subscription. Please activate a package.", retryable: false },
  { substring: "credits depleted", code: "insufficient_credits", userMessage: "Menese gateway credits depleted. Please top up your account.", retryable: false },

  // Rate limits
  { substring: "429 too many requests", code: "rate_limited", userMessage: "Rate limit reached. Wait a moment before trying again.", retryable: true },
  { substring: "rate limit", code: "rate_limited", userMessage: "Rate limit reached. Wait a moment before trying again.", retryable: true },

  // Network/RPC issues — retryable
  { substring: "empty http response", code: "network_error", userMessage: "Network request failed — retrying.", retryable: true },
  { substring: "no response from", code: "network_error", userMessage: "Network request failed — retrying.", retryable: true },
  { substring: "http_request failed", code: "network_error", userMessage: "Network request failed — retrying with fallback.", retryable: true },
  { substring: "timeout expired", code: "network_error", userMessage: "Request timed out. Try again shortly.", retryable: true },
  { substring: "connection refused", code: "network_error", userMessage: "Could not reach the network. Check your relay connection.", retryable: true },
  { substring: "rpc error", code: "network_error", userMessage: "RPC node error — retrying with fallback.", retryable: true },
  { substring: "502 bad gateway", code: "network_error", userMessage: "Network gateway error — retrying.", retryable: true },
  { substring: "503 service unavailable", code: "network_error", userMessage: "Service temporarily unavailable. Try again shortly.", retryable: true },

  // Transient IC errors — retryable
  { substring: "canister temporarily unavailable", code: "transient", userMessage: "Service temporarily busy. Retrying.", retryable: true },
  { substring: "temporarilyunavailable", code: "transient", userMessage: "Service temporarily busy. Retrying.", retryable: true },
  { substring: "ic0503", code: "transient", userMessage: "Internet Computer canister error. Retrying.", retryable: true },
  { substring: "ic0515", code: "transient", userMessage: "Internet Computer canister error. Retrying.", retryable: true },
  { substring: "request timed out", code: "transient", userMessage: "Request timed out. Try again shortly.", retryable: true },

  // Insufficient funds — fatal
  { substring: "insufficient funds", code: "insufficient_funds", userMessage: "Not enough funds to complete this transaction.", retryable: false },
  { substring: "insufficientfunds", code: "insufficient_funds", userMessage: "Not enough funds to complete this transaction.", retryable: false },
  { substring: "insufficient balance", code: "insufficient_funds", userMessage: "Not enough balance to complete this transaction.", retryable: false },
  { substring: "balance too low", code: "insufficient_funds", userMessage: "Balance too low for this transaction.", retryable: false },

  // Contract reverts — fatal
  { substring: "execution reverted", code: "contract_reverted", userMessage: "Smart contract rejected the transaction.", retryable: false },
  { substring: "call_exception", code: "contract_reverted", userMessage: "Smart contract call failed.", retryable: false },
  { substring: "revert:", code: "contract_reverted", userMessage: "Smart contract rejected the transaction.", retryable: false },
  { substring: "out of gas", code: "contract_reverted", userMessage: "Transaction ran out of gas.", retryable: false },

  // Auth failures — fatal
  { substring: "invalid developer key", code: "unauthorized", userMessage: "Invalid developer key. Check your Menese configuration.", retryable: false },
  { substring: "not authorized", code: "unauthorized", userMessage: "Not authorized to perform this action.", retryable: false },
  { substring: "caller is not a controller", code: "unauthorized", userMessage: "Not authorized — caller is not a controller.", retryable: false },
  { substring: "unauthorized", code: "unauthorized", userMessage: "Not authorized to perform this action.", retryable: false },
  { substring: "invalid signature", code: "unauthorized", userMessage: "Invalid transaction signature.", retryable: false },
  { substring: "invalid sender", code: "unauthorized", userMessage: "Invalid sender for this transaction.", retryable: false },

  // Address validation — fatal
  { substring: "invalid address", code: "invalid_address", userMessage: "That address doesn't look right. Double-check it.", retryable: false },
  { substring: "base58 decode failed", code: "invalid_address", userMessage: "Invalid address format for this chain.", retryable: false },
  { substring: "invalid hex", code: "invalid_address", userMessage: "Invalid address format. Expected hex encoding.", retryable: false },
  { substring: "account not found", code: "invalid_address", userMessage: "Account not found on this chain.", retryable: false },

  // Slippage — fatal
  { substring: "slippage too high", code: "slippage_exceeded", userMessage: "Price moved too much. Try again or increase slippage tolerance.", retryable: false },

  // Input validation — fatal
  { substring: "missing required", code: "invalid_input", userMessage: "Missing required parameter.", retryable: false },
  { substring: "invalid amount", code: "invalid_input", userMessage: "Invalid amount specified.", retryable: false },
  { substring: "amount must be", code: "invalid_input", userMessage: "Invalid amount specified.", retryable: false },
  { substring: "dust amount", code: "invalid_input", userMessage: "Amount is below the minimum threshold for this chain.", retryable: false },
  { substring: "utxo not found", code: "invalid_input", userMessage: "UTXO not found — insufficient Bitcoin inputs.", retryable: false },
  { substring: "memo too long", code: "invalid_input", userMessage: "Memo exceeds maximum length for this chain.", retryable: false },
];

export function classifySdkError(raw: unknown): ClassifiedError {
  const message = raw instanceof Error ? raw.message : String(raw ?? "Unknown error");
  const lower = message.toLowerCase();

  for (const p of PATTERNS) {
    if (lower.includes(p.substring)) {
      return { code: p.code, message, retryable: p.retryable, userMessage: p.userMessage };
    }
  }

  return {
    code: "unknown",
    message,
    retryable: false,
    userMessage: `Operation failed: ${message}`,
  };
}
