/**
 * Production canister IDs for the Menese ecosystem on the Internet Computer.
 */

/** MeneseAgent — autonomous DeFi agent with SDK bridge, job scheduling, strategy engine */
export const AGENT_CANISTER_ID = "ewcc5-fiaaa-aaaab-afafq-cai";

/** MeneseSDK — multi-chain DeFi payment gateway (129 functions, 19 chains) */
export const SDK_CANISTER_ID = "urs2a-ziaaa-aaaad-aembq-cai";
export const SDK_TEST_STAGING_CANISTER_ID = "33mu4-naaaa-aaaab-aelga-cai";
export const SDK_DEV_TEST_CANISTER_ID = "xjjgf-naaaa-aaaab-aenvq-cai";

/** MeneseProtocolV0 — cross-chain routing, execution, and telemetry */
export const PROTOCOL_BACKEND_CANISTER_ID = "cxa6p-xiaaa-aaaad-aczda-cai";

/** Enigma — encryption/signing service */
export const ENIGMA_CANISTER_ID = "vulqw-yiaaa-aaaad-adtxa-cai";

/** MenesePool — liquidity pool canister */
export const POOL_CANISTER_ID = "flo5f-aaaaa-aaaaj-a4kwq-cai";

/** ICP ↔ SOL swap canister */
export const ICP_SOL_SWAP_CANISTER_ID = "w2vjc-2yaaa-aaaab-ae6zq-cai";

/** Users management canister */
export const USERS_MANAGEMENT_CANISTER_ID = "yyhzc-myaaa-aaaad-adbuq-cai";

/** Mercatura Chat canister */
export const CHAT_CANISTER_ID = "q2y3a-lqaaa-aaaac-qee4q-cai";

// -- MENES Token --
export const MENES_LEDGER_CANISTER_ID = "drgmr-ayaaa-aaaab-aereq-cai";
export const MENES_INDEX_CANISTER_ID = "dyfhn-wqaaa-aaaab-aerfa-cai";
export const MENES_SALE_CANISTER_ID = "d7ebz-3iaaa-aaaab-aerfq-cai";
export const MINTING_PROXY_CANISTER_ID = "ftmr2-maaaa-aaaab-aersa-cai";

// -- Mercx Exchange --
export const MERCX_BACKEND_CANISTER_ID = "zoa6c-riaaa-aaaan-qzmta-cai";
export const ORDERBOOK_CANISTER_ID = "ta52z-faaaa-aaaan-qzz5q-cai";
export const KYC_CANISTER_ID = "x2lku-6yaaa-aaaan-qzvia-cai";

// -- Token Ledgers (ICRC-1) --
export const MERCX_ICRC1_LEDGER_CANISTER_ID = "7p6gu-biaaa-aaaap-aknta-cai";
export const MERCX_ICRC1_INDEX_CANISTER_ID = "7i7aa-mqaaa-aaaap-akntq-cai";
export const TOMMY_ICRC1_LEDGER_CANISTER_ID = "j47wy-ciaaa-aaaan-qzqyq-cai";
export const TOMMY_ICRC1_INDEX_CANISTER_ID = "jv45e-uaaaa-aaaan-qzqza-cai";
export const FXMX_ICRC1_LEDGER_CANISTER_ID = "b7p2k-giaaa-aaaan-qzwta-cai";
export const FXMX_ICRC1_INDEX_CANISTER_ID = "lfuhg-eaaaa-aaaan-qzxkq-cai";
export const EGX30_ICRC1_LEDGER_CANISTER_ID = "lnaqc-daaaa-aaaan-qz42a-cai";
export const GBX_ICRC1_LEDGER_CANISTER_ID = "lkbww-oyaaa-aaaan-qz42q-cai";

/**
 * The primary SDK canister — this is what the relay talks to for all
 * wallet operations (balances, sends, swaps, bridges, staking, strategies).
 */
export const DEFAULT_SDK_CANISTER_ID = AGENT_CANISTER_ID;
