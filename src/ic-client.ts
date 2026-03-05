/**
 * Direct IC canister client — calls MeneseSDK canister methods via @dfinity/agent.
 *
 * Two modes:
 * - Anonymous: for public read queries (getEvmAddressFor, balances)
 * - Authenticated: for write operations (send, swap, bridge, strategy)
 *   using a per-user Ed25519 identity stored as a 32-byte hex seed.
 */

import { HttpAgent, Actor } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import * as crypto from "node:crypto";
import type { MeneseConfig } from "./config.js";
import { EVM_CHAINS, type EvmChain } from "./chains.js";

// ── Candid Types ─────────────────────────────────────────────────────

const EvmAddressInfo = IDL.Record({
  evmAddress: IDL.Text,
  publicKeyHex: IDL.Text,
});

const SolanaAddressInfo = IDL.Record({
  address: IDL.Text,
  publicKeyBytes: IDL.Vec(IDL.Nat8),
  publicKeyHex: IDL.Text,
});

const AddressInfo = IDL.Record({
  bech32Address: IDL.Text,
  hash160Hex: IDL.Text,
  pubKeyHex: IDL.Text,
});

const TonAddressInfo = IDL.Record({
  bounceable: IDL.Text,
  nonBounceable: IDL.Text,
  publicKeyHex: IDL.Text,
  rawAddress: IDL.Text,
  stateInitBocBase64: IDL.Text,
});

const XrpAddressInfo = IDL.Record({
  accountIdBytes: IDL.Vec(IDL.Nat8),
  accountIdHex: IDL.Text,
  classicAddress: IDL.Text,
  publicKeyHex: IDL.Text,
});

const SuiAddressInfo = IDL.Record({
  publicKeyBytes: IDL.Vec(IDL.Nat8),
  publicKeyHex: IDL.Text,
  suiAddress: IDL.Text,
});

const CloakAddressInfo = IDL.Record({
  addressBytesHex: IDL.Text,
  base58Address: IDL.Text,
  hash160Hex: IDL.Text,
  pubKeyHex: IDL.Text,
});

const CardanoAddressInfo = IDL.Record({
  bech32Address: IDL.Text,
  addressBytesHex: IDL.Text,
  paymentPubKeyHex: IDL.Text,
  stakePubKeyHex: IDL.Text,
});

const TronAddressInfo = IDL.Record({
  base58Address: IDL.Text,
  hexAddress: IDL.Text,
  publicKeyHex: IDL.Text,
});

const AptosAddressInfo = IDL.Record({
  address: IDL.Text,
  publicKeyHex: IDL.Text,
});

const PubKeyInfo = IDL.Record({
  implicitAccountId: IDL.Text,
  publicKeyBase58: IDL.Text,
  publicKeyHex: IDL.Text,
});

const ResultNat64 = IDL.Variant({ ok: IDL.Nat64, err: IDL.Text });
const ResultText = IDL.Variant({ ok: IDL.Text, err: IDL.Text });
const ResultNat = IDL.Variant({ ok: IDL.Nat, err: IDL.Text });
const ResultVoid = IDL.Variant({ ok: IDL.Null, err: IDL.Text });

// ── Billing / Subscription Types ──
const Tier = IDL.Variant({
  Free: IDL.Null,
  Basic: IDL.Null,
  Developer: IDL.Null,
  Pro: IDL.Null,
  Enterprise: IDL.Null,
});

const UserAccount = IDL.Record({
  creditsMicroUsd: IDL.Nat,
  tier: Tier,
  actionsRemaining: IDL.Nat,
  subscriptionExpiry: IDL.Opt(IDL.Int),
  actionsUsed: IDL.Nat,
  totalDepositedMicroUsd: IDL.Nat,
  createdAt: IDL.Int,
});

const DepositReceipt = IDL.Record({
  amount: IDL.Nat,
  currency: IDL.Text,
  id: IDL.Nat,
  ledgerCanisterId: IDL.Text,
  timestamp: IDL.Int,
  usdValueMicroUsd: IDL.Nat,
  user: IDL.Principal,
});

const ResultUserAccount = IDL.Variant({ ok: UserAccount, err: IDL.Text });
const ResultDepositReceipt = IDL.Variant({ ok: DepositReceipt, err: IDL.Text });
const Balance = IDL.Record({ amount: IDL.Nat, denom: IDL.Text });

// Generic send result shapes (all follow { ok: Record, err: Text })
const SendResultGeneric = IDL.Variant({
  ok: IDL.Record({ txHash: IDL.Opt(IDL.Text) }),
  err: IDL.Text,
});

// Swap result
const SwapResult = IDL.Variant({
  ok: IDL.Record({
    amountIn: IDL.Nat,
    amountOut: IDL.Nat,
    txHash: IDL.Opt(IDL.Text),
  }),
  err: IDL.Text,
});

// Raydium swap result (Solana — NOT a variant, flat record)
const RaydiumApiSwapResult = IDL.Record({
  inputAmount: IDL.Text,
  outputAmount: IDL.Text,
  priceImpactPct: IDL.Text,
  txSignature: IDL.Text,
});

// Send result for CloakCoin
const SendResultCloak = IDL.Variant({
  ok: IDL.Record({ txHash: IDL.Text, txHex: IDL.Text, changeValue: IDL.Nat64 }),
  err: IDL.Text,
});

// Send result for XRP (flat record, NOT a variant)
const SendResultXrpFlat = IDL.Record({
  txHash: IDL.Text,
  explorerUrl: IDL.Text,
  message: IDL.Text,
  success: IDL.Bool,
  sequence: IDL.Nat32,
  ledgerUsed: IDL.Nat32,
});

// ICP DEX types
const DexId = IDL.Variant({ ICPSwap: IDL.Null, KongSwap: IDL.Null });
const SwapRequest = IDL.Record({
  tokenIn: IDL.Text,
  tokenOut: IDL.Text,
  amountIn: IDL.Nat,
  minAmountOut: IDL.Nat,
  slippagePct: IDL.Float64,
  preferredDex: IDL.Opt(DexId),
});
const SwapResultIcp = IDL.Variant({
  ok: IDL.Record({
    amountIn: IDL.Nat,
    amountOut: IDL.Nat,
    dex: DexId,
    fee: IDL.Nat,
    message: IDL.Text,
    success: IDL.Bool,
    txId: IDL.Nat,
  }),
  err: IDL.Text,
});

// SUI (Cetus) swap result (flat record)
const SwapResultSui = IDL.Record({
  success: IDL.Bool,
  txDigest: IDL.Text,
  amountOut: IDL.Text,
  error: IDL.Opt(IDL.Text),
});

// SUI network variant
const SuiNetwork = IDL.Variant({
  mainnet: IDL.Null,
  testnet: IDL.Null,
  devnet: IDL.Null,
});

// XRP swap types
const TokenAmount = IDL.Record({
  currency: IDL.Text,
  issuer: IDL.Text,
  value: IDL.Text,
});
const SwapResultXrp = IDL.Record({
  success: IDL.Bool,
  txHash: IDL.Text,
  explorerUrl: IDL.Text,
  message: IDL.Text,
  sourceAmount: IDL.Text,
  destinationAmount: IDL.Text,
});

// Quote types
const SwapQuoteIcp = IDL.Record({
  amountIn: IDL.Nat,
  amountOut: IDL.Nat,
  dex: DexId,
  fee: IDL.Nat,
  minAmountOut: IDL.Nat,
  poolId: IDL.Opt(IDL.Text),
  priceImpactPct: IDL.Text,
  rawData: IDL.Text,
  route: IDL.Vec(IDL.Text),
  success: IDL.Bool,
  tokenIn: IDL.Text,
  tokenOut: IDL.Text,
});
const AggregatedQuote = IDL.Record({
  best: SwapQuoteIcp,
  icpswapQuote: IDL.Opt(SwapQuoteIcp),
  kongswapQuote: IDL.Opt(SwapQuoteIcp),
  timestamp: IDL.Int,
});
const SwapQuoteSui = IDL.Record({
  amountIn: IDL.Text,
  amountOut: IDL.Text,
  estimatedGas: IDL.Nat64,
  priceImpact: IDL.Float64,
  routerData: IDL.Text,
});
const RaydiumQuote = IDL.Record({
  inputAmount: IDL.Text,
  minOutputAmount: IDL.Text,
  outputAmount: IDL.Text,
  priceImpactPct: IDL.Text,
  routeInfo: IDL.Text,
  success: IDL.Bool,
});
const MinswapQuote = IDL.Variant({
  ok: IDL.Record({
    aggregator_fee: IDL.Text,
    amount_in: IDL.Text,
    amount_out: IDL.Text,
    avg_price_impact: IDL.Text,
    min_amount_out: IDL.Text,
    paths_json: IDL.Text,
    rawJson: IDL.Text,
    success: IDL.Bool,
    token_in: IDL.Text,
    token_out: IDL.Text,
    total_dex_fee: IDL.Text,
    total_lp_fee: IDL.Text,
  }),
  err: IDL.Text,
});
const EvmQuote = IDL.Variant({
  ok: IDL.Record({
    amountIn: IDL.Nat,
    amountOut: IDL.Nat,
    fromToken: IDL.Text,
    toToken: IDL.Text,
    path: IDL.Vec(IDL.Text),
  }),
  err: IDL.Text,
});
const XrpPathsResult = IDL.Record({
  destinationAmount: TokenAmount,
  message: IDL.Text,
  paths: IDL.Text,
  sourceAmount: TokenAmount,
  success: IDL.Bool,
});

// Strategy Rule types
const ChainType = IDL.Variant({
  Bitcoin: IDL.Null, Litecoin: IDL.Null, Ethereum: IDL.Null,
  Arbitrum: IDL.Null, Base: IDL.Null, Polygon: IDL.Null,
  BNB: IDL.Null, Optimism: IDL.Null, Solana: IDL.Null,
  Sui: IDL.Null, TON: IDL.Null, Tron: IDL.Null,
  XRP: IDL.Null, Aptos: IDL.Null, Cardano: IDL.Null,
  NEAR: IDL.Null, ICP: IDL.Null, CloakCoin: IDL.Null,
  Thorchain: IDL.Null,
});

const RuleType = IDL.Variant({
  StopLoss: IDL.Null, TakeProfit: IDL.Null, DCA: IDL.Null,
  Rebalance: IDL.Null, LiquidityProvision: IDL.Null,
  VolatilityTrigger: IDL.Null, Scheduled: IDL.Null,
  APYMigration: IDL.Null,
});

const RuleStatus = IDL.Variant({
  Active: IDL.Null, Cancelled: IDL.Null, Confirmed: IDL.Null,
  Draft: IDL.Null, Executed: IDL.Null, Executing: IDL.Null,
  Failed: IDL.Null, Paused: IDL.Null, Ready: IDL.Null,
});

const DCAConfig = IDL.Record({
  intervalSeconds: IDL.Nat64,
  maxExecutions: IDL.Opt(IDL.Nat),
});

const Rule = IDL.Record({
  apyMigrationConfig: IDL.Opt(IDL.Reserved),
  chainType: ChainType,
  createdAt: IDL.Int,
  dcaConfig: IDL.Opt(DCAConfig),
  id: IDL.Nat,
  lpConfig: IDL.Opt(IDL.Reserved),
  positionId: IDL.Nat,
  ruleType: RuleType,
  scheduledConfig: IDL.Opt(IDL.Reserved),
  sizePct: IDL.Nat,
  status: RuleStatus,
  swapAmountDrops: IDL.Opt(IDL.Nat64),
  swapAmountLamports: IDL.Opt(IDL.Nat64),
  swapAmountWei: IDL.Opt(IDL.Nat),
  triggerPrice: IDL.Nat64,
  volatilityConfig: IDL.Opt(IDL.Reserved),
});

// ── IDL Factory ──────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: _IDL }) => {
  return IDL.Service({
    // ── Read: Address methods (take principal, return address info) ──
    getEvmAddressFor: IDL.Func([IDL.Principal], [EvmAddressInfo], []),
    getSolanaAddressFor: IDL.Func([IDL.Principal], [SolanaAddressInfo], []),
    getBitcoinAddressFor: IDL.Func([IDL.Principal], [AddressInfo], []),
    getLitecoinAddressFor: IDL.Func([IDL.Principal], [AddressInfo], []),
    getTonAddressFor: IDL.Func([IDL.Principal], [TonAddressInfo], []),
    getXrpAddressFor: IDL.Func([IDL.Principal], [XrpAddressInfo], []),
    getSuiAddressFor: IDL.Func([IDL.Principal], [SuiAddressInfo], []),
    getCloakAddressFor: IDL.Func([IDL.Principal], [CloakAddressInfo], []),

    // ── Read: Batch address (authenticated, all chains in one call) ──
    getAllAddresses: IDL.Func([], [IDL.Record({
      aptos: AptosAddressInfo,
      bitcoin: AddressInfo,
      cardano: CardanoAddressInfo,
      evm: EvmAddressInfo,
      litecoin: AddressInfo,
      near: PubKeyInfo,
      solana: SolanaAddressInfo,
      sui: SuiAddressInfo,
      thorchain: AddressInfo,
      ton: TonAddressInfo,
      tron: TronAddressInfo,
      xrp: XrpAddressInfo,
    })], []),

    // ── Read: Balance methods ──
    getICPBalanceFor: IDL.Func([IDL.Principal], [ResultNat64], []),
    getSolanaBalance: IDL.Func([IDL.Text], [ResultNat64], []),
    getEvmBalance: IDL.Func([IDL.Text, IDL.Text], [IDL.Opt(IDL.Nat)], []),
    getBitcoinBalanceFor: IDL.Func([IDL.Text], [IDL.Nat64], []),
    getLitecoinBalanceFor: IDL.Func([IDL.Text], [IDL.Nat64], []),
    getSuiBalanceFor: IDL.Func([IDL.Text], [IDL.Nat64], []),
    getTonBalanceFor: IDL.Func([IDL.Text], [ResultNat64], []),
    getCloakBalance: IDL.Func([], [IDL.Variant({
      ok: IDL.Record({ address: IDL.Text, balance: IDL.Nat64, utxoCount: IDL.Nat }),
      err: IDL.Text,
    })], []),
    getThorBalanceFor: IDL.Func([IDL.Text], [IDL.Vec(Balance)], []),
    getMyXrpBalance: IDL.Func([], [ResultText], []),
    getCardanoBalance: IDL.Func([], [ResultNat64], []),
    getAptosBalance: IDL.Func([], [ResultNat64], []),
    getMyNearBalance: IDL.Func([], [IDL.Nat], []),
    getTrxBalance: IDL.Func([IDL.Text], [ResultNat64], []),

    // ── Read: Batch balance (authenticated, non-EVM chains) ──
    getAllBalances: IDL.Func([], [IDL.Record({
      aptos: ResultNat64,
      bitcoin: IDL.Nat64,
      cardano: ResultNat64,
      icp: ResultNat64,
      litecoin: IDL.Nat64,
      near: IDL.Nat,
      solana: ResultNat64,
      thorchain: IDL.Vec(Balance),
      ton: ResultNat64,
      xrp: ResultText,
    })], []),

    // ── Read: ICRC-1 token balance ──
    getICRC1Balance: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Nat, err: IDL.Text })], []),
    getSupportedICPTokens: IDL.Func([], [IDL.Vec(IDL.Record({
      name: IDL.Text, symbol: IDL.Text, canisterId: IDL.Text,
      type_: IDL.Text, category: IDL.Text,
    }))], ["query"]),

    // ── Write: Send methods (caller-signed) ──
    sendEvmNativeTokenAutonomous: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Text, IDL.Nat, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    sendBitcoin: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendSolTransaction: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendICP: IDL.Func([IDL.Principal, IDL.Nat64], [SendResultGeneric], []),
    sendSui: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendTonSimple: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendXrpAutonomous: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Opt(IDL.Nat32)],
      [SendResultXrpFlat], [],
    ),
    sendICRC1: IDL.Func(
      [IDL.Principal, IDL.Nat, IDL.Text],
      [SendResultGeneric], [],
    ),
    sendLitecoin: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendCardanoTransaction: IDL.Func([IDL.Text, IDL.Nat64], [ResultText], []),
    sendTrx: IDL.Func([IDL.Text, IDL.Nat64], [ResultText], []),
    sendAptos: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendNearTransfer: IDL.Func([IDL.Text, IDL.Nat], [ResultText], []),
    sendCloak: IDL.Func([IDL.Text, IDL.Nat64], [SendResultCloak], []),
    sendThor: IDL.Func([IDL.Text, IDL.Nat64, IDL.Text], [ResultText], []),

    // ── Write: Swap methods ──
    swapTokens: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Nat, IDL.Bool, IDL.Text],
      [SwapResult], [],
    ),
    swapRaydiumApiUser: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat64, IDL.Nat64, IDL.Bool, IDL.Bool, IDL.Opt(IDL.Text), IDL.Opt(IDL.Text)],
      [RaydiumApiSwapResult], [],
    ),
    executeICPDexSwap: IDL.Func([SwapRequest], [SwapResultIcp], []),
    executeSuiSwap: IDL.Func(
      [SuiNetwork, IDL.Text, IDL.Text, IDL.Text, IDL.Text],
      [SwapResultSui], [],
    ),
    executeMinswapSwap: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat64, IDL.Float64],
      [ResultText], [],
    ),
    xrpSwap: IDL.Func(
      [TokenAmount, TokenAmount, IDL.Text, IDL.Nat],
      [SwapResultXrp], [],
    ),

    // ── Swap Quotes (FREE) ──
    getRaydiumQuote: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat64, IDL.Nat64],
      [RaydiumQuote], [],
    ),
    getICPDexQuote: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat, IDL.Float64],
      [AggregatedQuote], [],
    ),
    getSuiSwapQuote: IDL.Func(
      [SuiNetwork, IDL.Text, IDL.Text, IDL.Text, IDL.Nat64],
      [IDL.Opt(SwapQuoteSui)], [],
    ),
    getMinswapQuote: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat64, IDL.Float64],
      [MinswapQuote], [],
    ),
    getTokenQuote: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat, IDL.Text],
      [EvmQuote], [],
    ),
    xrpFindPaths: IDL.Func(
      [TokenAmount, IDL.Vec(TokenAmount)],
      [XrpPathsResult], [],
    ),

    // ── Write: Strategy methods ──
    addStrategyRule: IDL.Func([Rule], [ResultNat], []),
    deleteStrategyRule: IDL.Func([IDL.Nat], [ResultVoid], []),
    getMyStrategyRules: IDL.Func([], [IDL.Vec(Rule)], []),
    updateStrategyRuleStatus: IDL.Func([IDL.Nat, RuleStatus], [ResultVoid], []),

    // ── Billing / Subscription ──
    getMyGatewayAccount: IDL.Func([], [UserAccount], []),
    depositGatewayCredits: IDL.Func(
      [IDL.Text, IDL.Nat],
      [ResultDepositReceipt], [],
    ),
    purchaseGatewayPackage: IDL.Func(
      [Tier, IDL.Text],
      [ResultUserAccount], [],
    ),

    // ── Write: Staking/Lending ──
    stakeEthForStEth: IDL.Func(
      [IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    aaveSupplyEth: IDL.Func(
      [IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    aaveSupplyToken: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    aaveWithdrawEth: IDL.Func(
      [IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    aaveWithdrawToken: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
  });
};

// ── EVM RPC Endpoints ────────────────────────────────────────────────

const EVM_RPC: Record<EvmChain, string> = {
  ethereum: "https://eth.llamarpc.com",
  polygon: "https://polygon-rpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  base: "https://mainnet.base.org",
  optimism: "https://mainnet.optimism.io",
  bnb: "https://bscrpc.com",
};

// ── Solana Token Mints ───────────────────────────────────────────────

const SOLANA_MINTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  PYTH: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
};

// ── Chain Decimals (single source of truth) ─────────────────────────

export const CHAIN_DECIMALS: Record<string, number> = {
  ethereum: 18, polygon: 18, arbitrum: 18, base: 18, optimism: 18, bnb: 18,
  solana: 9, bitcoin: 8, litecoin: 8, icp: 8, sui: 9, ton: 9,
  xrp: 6, cardano: 6, tron: 6, aptos: 8, near: 24, cloakcoin: 6, thorchain: 8,
};

export const CHAIN_SYMBOL: Record<string, string> = {
  ethereum: "ETH", polygon: "MATIC", arbitrum: "ETH", base: "ETH", optimism: "ETH", bnb: "BNB",
  solana: "SOL", bitcoin: "BTC", litecoin: "LTC", icp: "ICP", sui: "SUI", ton: "TON",
  xrp: "XRP", cardano: "ADA", tron: "TRX", aptos: "APT", near: "NEAR",
  cloakcoin: "CLOAK", thorchain: "RUNE",
};

// ── Actor Cache ──────────────────────────────────────────────────────

let cachedActor: ReturnType<typeof Actor.createActor> | null = null;
let cachedCanisterId: string | null = null;

function getActor(config: MeneseConfig) {
  if (cachedActor && cachedCanisterId === config.sdkCanisterId) {
    return cachedActor;
  }

  const agent = HttpAgent.createSync({ host: "https://icp-api.io" });
  cachedActor = Actor.createActor(idlFactory, {
    agent,
    canisterId: config.sdkCanisterId,
  });
  cachedCanisterId = config.sdkCanisterId;
  return cachedActor;
}

// ── Address Cache ────────────────────────────────────────────────────
// Addresses are deterministic per principal — cache permanently.

const addressCache = new Map<string, ChainAddresses>();

export interface ChainAddresses {
  evm?: { evmAddress: string; publicKeyHex: string };
  solana?: { address: string };
  bitcoin?: { bech32Address: string };
  litecoin?: { bech32Address: string };
  ton?: { bounceable: string; nonBounceable: string };
  xrp?: { classicAddress: string };
  sui?: { suiAddress: string };
  cloakcoin?: { base58Address: string };
  cardano?: { bech32Address: string };
  tron?: { base58Address: string };
  aptos?: { address: string };
  near?: { implicitAccountId: string };
  thorchain?: { bech32Address: string };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get all derived addresses for a principal (cached after first call).
 * Uses batch getAllAddresses when seed is provided, per-chain fallback otherwise.
 */
export async function getAllAddresses(
  config: MeneseConfig,
  principalText: string,
  seed?: string,
): Promise<{ ok: true; data: ChainAddresses } | { ok: false; error: string }> {
  const cached = addressCache.get(principalText);
  if (cached) return { ok: true, data: cached };

  try {
    // Batch call if we have a seed (authenticated — returns all 12 chain families)
    if (seed) {
      const actor = getAuthenticatedActor(config, seed);
      const raw = (await actor.getAllAddresses()) as {
        aptos: { address: string };
        bitcoin: { bech32Address: string };
        cardano: { bech32Address: string };
        evm: { evmAddress: string; publicKeyHex: string };
        litecoin: { bech32Address: string };
        near: { implicitAccountId: string };
        solana: { address: string };
        sui: { suiAddress: string };
        thorchain: { bech32Address: string };
        ton: { bounceable: string; nonBounceable: string };
        tron: { base58Address: string };
        xrp: { classicAddress: string };
      };
      const result: ChainAddresses = {
        evm: { evmAddress: raw.evm.evmAddress, publicKeyHex: raw.evm.publicKeyHex },
        solana: { address: raw.solana.address },
        bitcoin: { bech32Address: raw.bitcoin.bech32Address },
        litecoin: { bech32Address: raw.litecoin.bech32Address },
        ton: { bounceable: raw.ton.bounceable, nonBounceable: raw.ton.nonBounceable },
        xrp: { classicAddress: raw.xrp.classicAddress },
        sui: { suiAddress: raw.sui.suiAddress },
        cloakcoin: undefined, // not in batch — uses same key as bitcoin
        cardano: { bech32Address: raw.cardano.bech32Address },
        tron: { base58Address: raw.tron.base58Address },
        aptos: { address: raw.aptos.address },
        near: { implicitAccountId: raw.near.implicitAccountId },
        thorchain: { bech32Address: raw.thorchain.bech32Address },
      };
      // Fetch CloakCoin address separately (not in batch)
      try {
        const anonActor = getActor(config) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
        const p = Principal.fromText(principalText);
        const cloak = (await anonActor.getCloakAddressFor(p)) as { base58Address: string };
        result.cloakcoin = { base58Address: cloak.base58Address };
      } catch { /* CloakCoin address derivation optional */ }

      addressCache.set(principalText, result);
      return { ok: true, data: result };
    }

    // Fallback: per-chain calls (anonymous, using principal)
    const actor = getActor(config) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const p = Principal.fromText(principalText);

    const [evm, sol, btc, ltc, ton, xrp, sui, cloak] = await Promise.all([
      actor.getEvmAddressFor(p) as Promise<{ evmAddress: string; publicKeyHex: string }>,
      actor.getSolanaAddressFor(p) as Promise<{ address: string }>,
      actor.getBitcoinAddressFor(p) as Promise<{ bech32Address: string }>,
      actor.getLitecoinAddressFor(p) as Promise<{ bech32Address: string }>,
      actor.getTonAddressFor(p) as Promise<{ bounceable: string; nonBounceable: string }>,
      actor.getXrpAddressFor(p) as Promise<{ classicAddress: string }>,
      actor.getSuiAddressFor(p) as Promise<{ suiAddress: string }>,
      actor.getCloakAddressFor(p) as Promise<{ base58Address: string }>,
    ]);

    const result: ChainAddresses = {
      evm: { evmAddress: evm.evmAddress, publicKeyHex: evm.publicKeyHex },
      solana: { address: sol.address },
      bitcoin: { bech32Address: btc.bech32Address },
      litecoin: { bech32Address: ltc.bech32Address },
      ton: { bounceable: ton.bounceable, nonBounceable: ton.nonBounceable },
      xrp: { classicAddress: xrp.classicAddress },
      sui: { suiAddress: sui.suiAddress },
      cloakcoin: { base58Address: cloak.base58Address },
    };

    addressCache.set(principalText, result);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: `Failed to fetch addresses: ${err}` };
  }
}

/**
 * Get the derived address for a specific chain.
 */
export async function getChainAddress(
  config: MeneseConfig,
  principalText: string,
  chain: string,
  seed?: string,
): Promise<string | null> {
  const res = await getAllAddresses(config, principalText, seed);
  if (!res.ok) return null;
  const a = res.data;
  const evmChains = EVM_CHAINS as readonly string[];

  if (evmChains.includes(chain)) return a.evm?.evmAddress ?? null;
  if (chain === "solana") return a.solana?.address ?? null;
  if (chain === "bitcoin") return a.bitcoin?.bech32Address ?? null;
  if (chain === "litecoin") return a.litecoin?.bech32Address ?? null;
  if (chain === "ton") return a.ton?.bounceable ?? null;
  if (chain === "xrp") return a.xrp?.classicAddress ?? null;
  if (chain === "sui") return a.sui?.suiAddress ?? null;
  if (chain === "cloakcoin") return a.cloakcoin?.base58Address ?? null;
  if (chain === "cardano") return a.cardano?.bech32Address ?? null;
  if (chain === "tron") return a.tron?.base58Address ?? null;
  if (chain === "aptos") return a.aptos?.address ?? null;
  if (chain === "near") return a.near?.implicitAccountId ?? null;
  if (chain === "thorchain") return a.thorchain?.bech32Address ?? null;
  if (chain === "icp") return principalText; // ICP uses principal directly
  return null;
}

/**
 * Result type for balance queries.
 */
export interface BalanceResult {
  chain: string;
  address: string;
  balance: string;
  decimals: number;
  symbol: string;
}

/**
 * Get balance for a specific chain.
 */
export async function getChainBalance(
  config: MeneseConfig,
  principalText: string,
  chain: string,
): Promise<{ ok: true; data: BalanceResult } | { ok: false; error: string }> {
  try {
    const actor = getActor(config) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const evmChains = EVM_CHAINS as readonly string[];

    // ICP uses principal directly
    if (chain === "icp") {
      const p = Principal.fromText(principalText);
      const res = (await actor.getICPBalanceFor(p)) as { ok?: bigint; err?: string };
      if ("err" in res && res.err) return { ok: false, error: res.err };
      const raw = res.ok ?? 0n;
      return {
        ok: true,
        data: {
          chain: "icp",
          address: principalText,
          balance: formatBalance(raw, 8),
          decimals: 8,
          symbol: "ICP",
        },
      };
    }

    // Get the address first
    const address = await getChainAddress(config, principalText, chain);
    if (!address) {
      return { ok: false, error: `Cannot derive address for chain: ${chain}` };
    }

    // EVM chains
    if (evmChains.includes(chain)) {
      const rpc = EVM_RPC[chain as EvmChain];
      const res = (await actor.getEvmBalance(address, rpc)) as [bigint] | [];
      const raw = res[0] ?? 0n;
      const symbol = chain === "bnb" ? "BNB" : chain === "polygon" ? "MATIC" : "ETH";
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(raw, 18), decimals: 18, symbol },
      };
    }

    // Solana
    if (chain === "solana") {
      const res = (await actor.getSolanaBalance(address)) as { ok?: bigint; err?: string };
      if ("err" in res && res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(res.ok ?? 0n, 9), decimals: 9, symbol: "SOL" },
      };
    }

    // Bitcoin
    if (chain === "bitcoin") {
      const raw = (await actor.getBitcoinBalanceFor(address)) as bigint;
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(raw, 8), decimals: 8, symbol: "BTC" },
      };
    }

    // Litecoin
    if (chain === "litecoin") {
      const raw = (await actor.getLitecoinBalanceFor(address)) as bigint;
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(raw, 8), decimals: 8, symbol: "LTC" },
      };
    }

    // Sui
    if (chain === "sui") {
      const raw = (await actor.getSuiBalanceFor(address)) as bigint;
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(raw, 9), decimals: 9, symbol: "SUI" },
      };
    }

    // TON
    if (chain === "ton") {
      const res = (await actor.getTonBalanceFor(address)) as { ok?: bigint; err?: string };
      if ("err" in res && res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(res.ok ?? 0n, 9), decimals: 9, symbol: "TON" },
      };
    }

    // Cloakcoin and Tron are authenticated — handled in getChainBalanceAuthenticated

    // The following chains require authenticated calls — use seed if available
    return { ok: false, error: `Balance query not supported for chain: ${chain}` };
  } catch (err) {
    return { ok: false, error: `Balance query failed: ${err}` };
  }
}

/**
 * Get balance for chains that require authenticated calls (XRP, Cardano, Aptos, Near, Tron).
 */
export async function getChainBalanceAuthenticated(
  config: MeneseConfig,
  seed: string,
  chain: string,
): Promise<{ ok: true; data: BalanceResult } | { ok: false; error: string }> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const principalText = getPrincipalFromSeed(seed);
    const address = await getChainAddress(config, principalText, chain, seed) ?? principalText;

    if (chain === "xrp") {
      const res = (await actor.getMyXrpBalance()) as { ok?: string; err?: string };
      if (res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: { chain, address, balance: res.ok ?? "0", decimals: 6, symbol: "XRP" },
      };
    }

    if (chain === "cardano") {
      const res = (await actor.getCardanoBalance()) as { ok?: bigint; err?: string };
      if (res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(res.ok ?? 0n, 6), decimals: 6, symbol: "ADA" },
      };
    }

    if (chain === "aptos") {
      const res = (await actor.getAptosBalance()) as { ok?: bigint; err?: string };
      if (res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(res.ok ?? 0n, 8), decimals: 8, symbol: "APT" },
      };
    }

    if (chain === "near") {
      const raw = (await actor.getMyNearBalance()) as bigint;
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(raw, 24), decimals: 24, symbol: "NEAR" },
      };
    }

    if (chain === "tron") {
      const tronAddr = await getChainAddress(config, principalText, chain, seed);
      if (!tronAddr) return { ok: false, error: "Cannot derive Tron address" };
      const res = (await actor.getTrxBalance(tronAddr)) as { ok?: bigint; err?: string };
      if (res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: { chain, address: tronAddr, balance: formatBalance(res.ok ?? 0n, 6), decimals: 6, symbol: "TRX" },
      };
    }

    if (chain === "cloakcoin") {
      const res = (await actor.getCloakBalance()) as { ok?: { address: string; balance: bigint; utxoCount: bigint }; err?: string };
      if (res.err) return { ok: false, error: res.err };
      const data = res.ok!;
      return {
        ok: true,
        data: { chain, address: data.address, balance: formatBalance(data.balance, 6), decimals: 6, symbol: "CLOAK" },
      };
    }

    if (chain === "thorchain") {
      const btcAddr = await getChainAddress(config, principalText, "bitcoin", seed);
      if (!btcAddr) return { ok: false, error: "Cannot derive Thorchain address (needs bitcoin address)" };
      const anonActor = getActor(config) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const balances = (await anonActor.getThorBalanceFor(btcAddr)) as Array<{ amount: bigint; denom: string }>;
      const rune = balances.find((b) => b.denom === "rune");
      return {
        ok: true,
        data: { chain, address: btcAddr, balance: formatBalance(rune?.amount ?? 0n, 8), decimals: 8, symbol: "RUNE" },
      };
    }

    return { ok: false, error: `Authenticated balance not supported for chain: ${chain}` };
  } catch (err) {
    return { ok: false, error: `Balance query failed: ${err}` };
  }
}

/**
 * Get portfolio — balances across all supported chains.
 * Pass seed to also fetch authenticated-only chains (XRP, Cardano, Aptos, Near, Tron, CloakCoin).
 */
export async function getPortfolio(
  config: MeneseConfig,
  principalText: string,
  seed?: string,
): Promise<{ ok: true; data: BalanceResult[]; errors?: Array<{ chain: string; error: string }> } | { ok: false; error: string }> {
  // Pre-populate address cache with all 12 chain families if we have seed
  if (seed) {
    await getAllAddresses(config, principalText, seed).catch(() => {});
  }

  // Anonymous chains (address-based queries)
  const anonChains = [
    "icp", "ethereum", "solana", "bitcoin", "polygon", "arbitrum",
    "base", "optimism", "bnb", "sui", "ton", "litecoin",
  ];
  // Authenticated chains (caller-signed queries)
  const authChains = ["xrp", "cardano", "aptos", "near", "tron", "cloakcoin", "thorchain"];

  const anonResults = await Promise.allSettled(
    anonChains.map((chain) => getChainBalance(config, principalText, chain)),
  );
  const authResults = seed
    ? await Promise.allSettled(
        authChains.map((chain) => getChainBalanceAuthenticated(config, seed, chain)),
      )
    : [];

  const results = [...anonResults, ...authResults];

  const allChains = [...anonChains, ...(seed ? authChains : [])];
  const balances: BalanceResult[] = [];
  const errors: Array<{ chain: string; error: string }> = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value.ok) {
      balances.push(r.value.data);
    } else {
      const errMsg = r.status === "rejected"
        ? String(r.reason)
        : (r.value as { ok: false; error: string }).error;
      errors.push({ chain: allChains[i], error: errMsg });
    }
  }

  return { ok: true, data: balances, errors: errors.length > 0 ? errors : undefined };
}

// ── ICRC-1 Token Balances ────────────────────────────────────────────

export interface ICPToken {
  name: string;
  symbol: string;
  canisterId: string;
  type_: string;
  category: string;
}

export interface TokenBalance {
  symbol: string;
  canisterId: string;
  balance: string;
  decimals: number;
}

/** Well-known ICP ecosystem tokens with their decimals. */
const KNOWN_ICP_TOKENS: Record<string, number> = {
  ckUSDC: 6, ckUSDT: 6, ckBTC: 8, ckETH: 18,
  CHAT: 8, SNS1: 8, GHOST: 8, MOD: 8, HOT: 8, CAT: 8,
  ICS: 8, BOOM: 8, ICX: 8, NUA: 8, SONIC: 8, EXE: 8,
};

/** Get list of supported ICP tokens from the SDK. */
export async function getSupportedICPTokens(
  config: MeneseConfig,
): Promise<ICPToken[]> {
  try {
    const actor = getActor(config) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    return (await actor.getSupportedICPTokens()) as ICPToken[];
  } catch {
    return [];
  }
}

/** Get ICRC-1 token balance. Requires seed (authenticated). */
export async function getICRC1TokenBalance(
  config: MeneseConfig,
  seed: string,
  canisterId: string,
  symbol: string,
): Promise<{ ok: true; data: TokenBalance } | { ok: false; error: string }> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const res = (await actor.getICRC1Balance(canisterId)) as { ok?: bigint; err?: string };
    if (res.err) return { ok: false, error: res.err };
    const decimals = KNOWN_ICP_TOKENS[symbol] ?? 8;
    return {
      ok: true,
      data: { symbol, canisterId, balance: formatBalance(res.ok ?? 0n, decimals), decimals },
    };
  } catch (err) {
    return { ok: false, error: `ICRC-1 balance failed: ${err}` };
  }
}

/** Get all ICRC-1 token balances. Returns non-zero tokens only. */
export async function getAllICRC1Balances(
  config: MeneseConfig,
  seed: string,
): Promise<TokenBalance[]> {
  const tokens = await getSupportedICPTokens(config);
  if (tokens.length === 0) return [];

  const results = await Promise.allSettled(
    tokens.map((t) => getICRC1TokenBalance(config, seed, t.canisterId, t.symbol)),
  );

  const balances: TokenBalance[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok && r.value.data.balance !== "0") {
      balances.push(r.value.data);
    }
  }
  return balances;
}

// ── Identity Management ──────────────────────────────────────────────

/** Generate a new 32-byte random seed (returned as 64-char hex). */
export function generateSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Derive an ICP principal text from a 32-byte hex seed. */
export function getPrincipalFromSeed(seed: string): string {
  const identity = Ed25519KeyIdentity.fromSecretKey(hexToBytes(seed));
  return identity.getPrincipal().toText();
}

/** Create an authenticated Actor for the SDK canister using a user's seed. */
function getAuthenticatedActor(config: MeneseConfig, seed: string) {
  const identity = Ed25519KeyIdentity.fromSecretKey(hexToBytes(seed));
  const agent = HttpAgent.createSync({ host: "https://icp-api.io", identity });
  return Actor.createActor(idlFactory, {
    agent,
    canisterId: config.sdkCanisterId,
  }) as Record<string, (...args: unknown[]) => Promise<unknown>>;
}

// ── Generic result type for write operations ─────────────────────────

export type SdkWriteResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function parseResult<T>(raw: unknown): SdkWriteResult<T> {
  const r = raw as { ok?: T; err?: string };
  if (r.err !== undefined) return { ok: false, error: r.err };
  return { ok: true, data: r.ok as T };
}

// ── EVM Chain IDs ────────────────────────────────────────────────────

const EVM_CHAIN_ID: Record<EvmChain, bigint> = {
  ethereum: 1n,
  polygon: 137n,
  arbitrum: 42161n,
  base: 8453n,
  optimism: 10n,
  bnb: 56n,
};

// ── Write: Send ──────────────────────────────────────────────────────

export async function sendToken(
  config: MeneseConfig,
  seed: string,
  chain: string,
  to: string,
  amount: string,
  opts?: { token?: string; memo?: string },
): Promise<SdkWriteResult> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const evmChains = EVM_CHAINS as readonly string[];

    if (evmChains.includes(chain)) {
      const weiAmount = parseUnits(amount, 18);
      const chainId = EVM_CHAIN_ID[chain as EvmChain];
      const rpc = EVM_RPC[chain as EvmChain];
      const res = await actor.sendEvmNativeTokenAutonomous(to, weiAmount, rpc, chainId, []);
      return parseResult(res);
    }
    if (chain === "bitcoin") {
      const sats = parseUnits(amount, 8);
      const res = await actor.sendBitcoin(to, sats);
      return parseResult(res);
    }
    if (chain === "solana") {
      const lamports = parseUnits(amount, 9);
      const res = await actor.sendSolTransaction(to, lamports);
      return parseResult(res);
    }
    if (chain === "icp") {
      const e8s = parseUnits(amount, 8);
      const res = await actor.sendICP(Principal.fromText(to), e8s);
      return parseResult(res);
    }
    if (chain === "sui") {
      const mist = parseUnits(amount, 9);
      const res = await actor.sendSui(to, mist);
      return parseResult(res);
    }
    if (chain === "ton") {
      const nanoton = parseUnits(amount, 9);
      const res = await actor.sendTonSimple(to, nanoton);
      return parseResult(res);
    }
    if (chain === "xrp") {
      const res = await actor.sendXrpAutonomous(to, amount, []);
      return parseResult(res);
    }
    if (chain === "litecoin") {
      const sats = parseUnits(amount, 8);
      const res = await actor.sendLitecoin(to, sats);
      return parseResult(res);
    }
    if (chain === "cardano") {
      const lovelace = parseUnits(amount, 6);
      const res = await actor.sendCardanoTransaction(to, lovelace);
      return parseResult(res);
    }
    if (chain === "tron") {
      const sun = parseUnits(amount, 6);
      const res = await actor.sendTrx(to, sun);
      return parseResult(res);
    }
    if (chain === "aptos") {
      const octas = parseUnits(amount, 8);
      const res = await actor.sendAptos(to, octas);
      return parseResult(res);
    }
    if (chain === "near") {
      const yocto = parseUnits(amount, 24);
      const res = await actor.sendNearTransfer(to, yocto);
      return parseResult(res);
    }
    if (chain === "cloakcoin") {
      const units = parseUnits(amount, 6); // CloakCoin = 6 decimals
      const res = await actor.sendCloak(to, units);
      return parseResult(res);
    }
    if (chain === "thorchain") {
      const units = parseUnits(amount, 8);
      const memo = opts?.memo ?? "";
      const res = await actor.sendThor(to, units, memo);
      return parseResult(res);
    }
    return { ok: false, error: `Send not supported for chain: ${chain}` };
  } catch (err) {
    return { ok: false, error: `Send failed: ${err}` };
  }
}

// ── Write: Swap ──────────────────────────────────────────────────────

export async function swapTokensOnChain(
  config: MeneseConfig,
  seed: string,
  params: {
    chain: string;
    fromToken: string;
    toToken: string;
    amount: string;
    slippageBps?: number;
  },
): Promise<SdkWriteResult> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const evmChains = EVM_CHAINS as readonly string[];

    if (evmChains.includes(params.chain)) {
      const amountWei = parseUnits(params.amount, 18);
      const rpc = EVM_RPC[params.chain as EvmChain];
      const slippage = BigInt(params.slippageBps ?? 250);
      // quoteId is empty — SDK will auto-quote
      const res = await actor.swapTokens(
        "", params.fromToken, params.toToken,
        amountWei, slippage, false, rpc,
      );
      return parseResult(res);
    }

    if (params.chain === "solana") {
      const inputMint = SOLANA_MINTS[params.fromToken.toUpperCase()] ?? params.fromToken;
      const outputMint = SOLANA_MINTS[params.toToken.toUpperCase()] ?? params.toToken;
      const amountLamports = parseUnits(params.amount, 9); // SOL = 9 decimals
      const slippage = BigInt(params.slippageBps ?? 250);
      const wrapSol = inputMint === SOLANA_MINTS.SOL;
      const unwrapSol = outputMint === SOLANA_MINTS.SOL;
      const res = (await actor.swapRaydiumApiUser(
        inputMint, outputMint, amountLamports, slippage, wrapSol, unwrapSol, [], [],
      )) as { inputAmount: string; outputAmount: string; priceImpactPct: string; txSignature: string };
      return {
        ok: true,
        data: {
          txSignature: res.txSignature,
          inputAmount: res.inputAmount,
          outputAmount: res.outputAmount,
          priceImpact: res.priceImpactPct,
        },
      };
    }

    // ICP DEX swap (ICPSwap + KongSwap auto-routing)
    if (params.chain === "icp") {
      const amountRaw = parseUnits(params.amount, 8); // ICP tokens = 8 decimals
      const slippagePct = (params.slippageBps ?? 250) / 100; // bps → percent
      const req = {
        tokenIn: params.fromToken,
        tokenOut: params.toToken,
        amountIn: amountRaw,
        minAmountOut: 0n,
        slippagePct,
        preferredDex: [],
      };
      const res = await actor.executeICPDexSwap(req);
      return parseResult(res);
    }

    // SUI swap (Cetus DEX)
    if (params.chain === "sui") {
      const amountIn = parseUnits(params.amount, 9).toString();
      const res = (await actor.executeSuiSwap(
        { mainnet: null }, params.fromToken, params.toToken, amountIn, "0",
      )) as { success: boolean; txDigest: string; amountOut: string; error: [string] | [] };
      if (!res.success) return { ok: false, error: res.error[0] ?? "SUI swap failed" };
      return { ok: true, data: { txDigest: res.txDigest, amountOut: res.amountOut } };
    }

    // Cardano swap (Minswap)
    if (params.chain === "cardano") {
      const amountLovelace = parseUnits(params.amount, 6);
      const slippagePct = (params.slippageBps ?? 250) / 100;
      const res = await actor.executeMinswapSwap(
        params.fromToken, params.toToken, amountLovelace, slippagePct,
      );
      return parseResult(res);
    }

    // XRP DEX swap
    if (params.chain === "xrp") {
      const destAmount: { currency: string; issuer: string; value: string } = {
        currency: params.toToken,
        issuer: "", // user should provide issuer in token string or we default
        value: "999999999", // max — let the DEX determine best rate
      };
      const sendMax: { currency: string; issuer: string; value: string } = {
        currency: params.fromToken,
        issuer: "",
        value: params.amount,
      };
      const slippage = BigInt(params.slippageBps ?? 250);
      const res = (await actor.xrpSwap(destAmount, sendMax, "", slippage)) as {
        success: boolean; txHash: string; explorerUrl: string;
        message: string; sourceAmount: string; destinationAmount: string;
      };
      if (!res.success) return { ok: false, error: res.message };
      return { ok: true, data: res };
    }

    return { ok: false, error: `Swap not yet supported for chain: ${params.chain}` };
  } catch (err) {
    return { ok: false, error: `Swap failed: ${err}` };
  }
}

// ── Write: Staking/Lending ───────────────────────────────────────────

export async function stakeOrLend(
  config: MeneseConfig,
  seed: string,
  params: {
    action: string;  // "supply" | "withdraw" | "stake"
    protocol: string; // "aave" | "lido"
    chain: string;
    asset?: string;
    amount: string;
  },
): Promise<SdkWriteResult> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const evmChains = EVM_CHAINS as readonly string[];
    if (!evmChains.includes(params.chain)) {
      return { ok: false, error: `Staking/lending not supported for chain: ${params.chain}` };
    }
    const rpc = EVM_RPC[params.chain as EvmChain];
    const amountWei = parseUnits(params.amount, 18);

    if (params.protocol === "lido" && params.action === "stake") {
      const res = await actor.stakeEthForStEth(amountWei, rpc, []);
      return parseResult(res);
    }
    if (params.protocol === "aave") {
      if (params.action === "supply" && (!params.asset || params.asset.toUpperCase() === "ETH")) {
        const res = await actor.aaveSupplyEth(amountWei, rpc, []);
        return parseResult(res);
      }
      if (params.action === "supply" && params.asset) {
        const res = await actor.aaveSupplyToken(params.asset, amountWei, rpc, []);
        return parseResult(res);
      }
      if (params.action === "withdraw" && (!params.asset || params.asset.toUpperCase() === "ETH")) {
        const res = await actor.aaveWithdrawEth(amountWei, rpc, []);
        return parseResult(res);
      }
      if (params.action === "withdraw" && params.asset) {
        const res = await actor.aaveWithdrawToken(params.asset, amountWei, rpc, []);
        return parseResult(res);
      }
    }
    return { ok: false, error: `Unsupported staking/lending: ${params.protocol} ${params.action}` };
  } catch (err) {
    return { ok: false, error: `Staking/lending failed: ${err}` };
  }
}

// ── Write: Strategy ──────────────────────────────────────────────────

export async function addStrategy(
  config: MeneseConfig,
  seed: string,
  rule: Record<string, unknown>,
): Promise<SdkWriteResult<bigint>> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const res = await actor.addStrategyRule(rule);
    return parseResult(res);
  } catch (err) {
    return { ok: false, error: `Add strategy failed: ${err}` };
  }
}

export async function listStrategies(
  config: MeneseConfig,
  seed: string,
): Promise<SdkWriteResult<unknown[]>> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const res = await actor.getMyStrategyRules();
    return { ok: true, data: res as unknown[] };
  } catch (err) {
    return { ok: false, error: `List strategies failed: ${err}` };
  }
}

export async function deleteStrategy(
  config: MeneseConfig,
  seed: string,
  ruleId: number,
): Promise<SdkWriteResult> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const res = await actor.deleteStrategyRule(BigInt(ruleId));
    return parseResult(res);
  } catch (err) {
    return { ok: false, error: `Delete strategy failed: ${err}` };
  }
}

// ── Billing / Subscription ────────────────────────────────────────────

export interface GatewayAccount {
  tier: string;
  creditsMicroUsd: bigint;
  actionsRemaining: bigint;
  actionsUsed: bigint;
  subscriptionExpiry: bigint | null;
  totalDepositedMicroUsd: bigint;
  createdAt: bigint;
}

function parseTier(raw: Record<string, null>): string {
  for (const k of Object.keys(raw)) return k.toLowerCase();
  return "free";
}

export async function getGatewayAccount(
  config: MeneseConfig,
  seed: string,
): Promise<SdkWriteResult<GatewayAccount>> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const raw = (await actor.getMyGatewayAccount()) as {
      tier: Record<string, null>;
      creditsMicroUsd: bigint;
      actionsRemaining: bigint;
      actionsUsed: bigint;
      subscriptionExpiry: [bigint] | [];
      totalDepositedMicroUsd: bigint;
      createdAt: bigint;
    };
    return {
      ok: true,
      data: {
        tier: parseTier(raw.tier),
        creditsMicroUsd: raw.creditsMicroUsd,
        actionsRemaining: raw.actionsRemaining,
        actionsUsed: raw.actionsUsed,
        subscriptionExpiry: raw.subscriptionExpiry[0] ?? null,
        totalDepositedMicroUsd: raw.totalDepositedMicroUsd,
        createdAt: raw.createdAt,
      },
    };
  } catch (err) {
    return { ok: false, error: `Failed to fetch account: ${err}` };
  }
}

const TIER_VARIANT: Record<string, Record<string, null>> = {
  basic: { Basic: null },
  developer: { Developer: null },
  pro: { Pro: null },
  enterprise: { Enterprise: null },
};

export async function purchaseSubscription(
  config: MeneseConfig,
  seed: string,
  tier: string,
  currency: string,
): Promise<SdkWriteResult<GatewayAccount>> {
  const variant = TIER_VARIANT[tier.toLowerCase()];
  if (!variant) return { ok: false, error: `Unknown tier: ${tier}. Valid: basic, developer, pro, enterprise` };
  try {
    const actor = getAuthenticatedActor(config, seed);
    const raw = (await actor.purchaseGatewayPackage(variant, currency)) as { ok?: unknown; err?: string };
    if (raw.err) return { ok: false, error: raw.err };
    const acct = raw.ok as {
      tier: Record<string, null>;
      creditsMicroUsd: bigint;
      actionsRemaining: bigint;
      actionsUsed: bigint;
      subscriptionExpiry: [bigint] | [];
      totalDepositedMicroUsd: bigint;
      createdAt: bigint;
    };
    return {
      ok: true,
      data: {
        tier: parseTier(acct.tier),
        creditsMicroUsd: acct.creditsMicroUsd,
        actionsRemaining: acct.actionsRemaining,
        actionsUsed: acct.actionsUsed,
        subscriptionExpiry: acct.subscriptionExpiry[0] ?? null,
        totalDepositedMicroUsd: acct.totalDepositedMicroUsd,
        createdAt: acct.createdAt,
      },
    };
  } catch (err) {
    return { ok: false, error: `Purchase failed: ${err}` };
  }
}

export async function depositCredits(
  config: MeneseConfig,
  seed: string,
  currency: string,
  amount: bigint,
): Promise<SdkWriteResult<{ id: bigint; usdValueMicroUsd: bigint }>> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const res = (await actor.depositGatewayCredits(currency, amount)) as { ok?: { id: bigint; usdValueMicroUsd: bigint }; err?: string };
    if (res.err) return { ok: false, error: res.err };
    return { ok: true, data: { id: res.ok!.id, usdValueMicroUsd: res.ok!.usdValueMicroUsd } };
  } catch (err) {
    return { ok: false, error: `Deposit failed: ${err}` };
  }
}

// ── Swap Quotes (FREE — no action cost) ──────────────────────────────

export interface QuoteResult {
  amountOut: string;
  priceImpact?: string;
  route?: string;
}

export async function getSwapQuote(
  config: MeneseConfig,
  seed: string,
  params: {
    chain: string;
    fromToken: string;
    toToken: string;
    amount: string;
  },
): Promise<SdkWriteResult<QuoteResult>> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const evmChains = EVM_CHAINS as readonly string[];

    // Solana — Raydium quote
    if (params.chain === "solana") {
      const inputMint = SOLANA_MINTS[params.fromToken.toUpperCase()] ?? params.fromToken;
      const outputMint = SOLANA_MINTS[params.toToken.toUpperCase()] ?? params.toToken;
      const amount = parseUnits(params.amount, 9);
      const slippage = 250n;
      const res = (await actor.getRaydiumQuote(inputMint, outputMint, amount, slippage)) as {
        outputAmount: string; priceImpactPct: string; routeInfo: string; success: boolean;
      };
      if (!res.success) return { ok: false, error: "Raydium quote failed" };
      return { ok: true, data: { amountOut: res.outputAmount, priceImpact: res.priceImpactPct, route: res.routeInfo } };
    }

    // ICP — aggregated ICPSwap + KongSwap quote
    if (params.chain === "icp") {
      const amountRaw = parseUnits(params.amount, 8);
      const res = (await actor.getICPDexQuote(params.fromToken, params.toToken, amountRaw, 1.0)) as {
        best: { amountOut: bigint; priceImpactPct: string; route: string[] };
      };
      return {
        ok: true,
        data: {
          amountOut: res.best.amountOut.toString(),
          priceImpact: res.best.priceImpactPct,
          route: res.best.route?.join(" → "),
        },
      };
    }

    // SUI — Cetus quote
    if (params.chain === "sui") {
      const amountIn = parseUnits(params.amount, 9).toString();
      const slippage = BigInt(250);
      const res = (await actor.getSuiSwapQuote(
        { mainnet: null }, params.fromToken, params.toToken, amountIn, slippage,
      )) as [{ amountOut: string; priceImpact: number }] | [];
      if (!res[0]) return { ok: false, error: "No SUI swap route found" };
      return { ok: true, data: { amountOut: res[0].amountOut, priceImpact: String(res[0].priceImpact) } };
    }

    // Cardano — Minswap quote
    if (params.chain === "cardano") {
      const amountLovelace = parseUnits(params.amount, 6);
      const res = (await actor.getMinswapQuote(params.fromToken, params.toToken, amountLovelace, 1.0)) as {
        ok?: { amount_out: string; avg_price_impact: string; paths_json: string };
        err?: string;
      };
      if (res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: {
          amountOut: res.ok!.amount_out,
          priceImpact: res.ok!.avg_price_impact,
          route: res.ok!.paths_json,
        },
      };
    }

    // EVM — Uniswap V3 quote
    if (evmChains.includes(params.chain)) {
      const amountWei = parseUnits(params.amount, 18);
      const rpc = EVM_RPC[params.chain as EvmChain];
      const res = (await actor.getTokenQuote(params.fromToken, params.toToken, amountWei, rpc)) as {
        ok?: { amountOut: bigint; path: string[] };
        err?: string;
      };
      if (res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: {
          amountOut: formatBalance(res.ok!.amountOut, 18),
          route: res.ok!.path?.join(" → "),
        },
      };
    }

    // XRP — find paths
    if (params.chain === "xrp") {
      const dest = { currency: params.toToken, issuer: "", value: params.amount };
      const source = [{ currency: params.fromToken, issuer: "", value: "" }];
      const res = (await actor.xrpFindPaths(dest, source)) as {
        success: boolean; sourceAmount: { value: string }; paths: string; message: string;
      };
      if (!res.success) return { ok: false, error: res.message };
      return { ok: true, data: { amountOut: res.sourceAmount.value, route: res.paths } };
    }

    return { ok: false, error: `Quote not available for chain: ${params.chain}` };
  } catch (err) {
    return { ok: false, error: `Quote failed: ${err}` };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Parse a decimal string to smallest unit (e.g. "1.5" with 18 decimals → bigint). */
function parseUnits(value: string, decimals: number): bigint {
  const parts = value.split(".");
  const whole = parts[0] ?? "0";
  let frac = parts[1] ?? "";
  if (frac.length > decimals) frac = frac.slice(0, decimals);
  frac = frac.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);
}

function formatBalance(raw: bigint | number, decimals: number): string {
  const n = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = n / divisor;
  const frac = n % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
