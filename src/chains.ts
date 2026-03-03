/**
 * Supported chains — mirrors MeneseAgent Types.mo ChainId variants.
 */
export const SUPPORTED_CHAINS = [
  "ethereum",
  "polygon",
  "arbitrum",
  "base",
  "optimism",
  "bnb",
  "solana",
  "bitcoin",
  "litecoin",
  "icp",
  "sui",
  "ton",
  "xrp",
  "cardano",
  "tron",
  "aptos",
  "near",
  "cloakcoin",
  "thorchain",
] as const;

export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export const EVM_CHAINS = [
  "ethereum",
  "polygon",
  "arbitrum",
  "base",
  "optimism",
  "bnb",
] as const;

export type EvmChain = (typeof EVM_CHAINS)[number];

export function isEvmChain(chain: string): chain is EvmChain {
  return (EVM_CHAINS as readonly string[]).includes(chain);
}
