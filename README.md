# Menese Protocol — OpenClaw Plugin

Multi-chain crypto operations across **19 blockchains** from your AI assistant, powered by [Menese SDK](https://github.com/Menese-Protocol/MeneseSDK-V0) on the Internet Computer.

## What it does

Talk to your OpenClaw AI naturally to manage crypto:

- **Send** tokens on any chain
- **Swap** via DEXs (Uniswap, Raydium, ICPSwap, etc.)
- **Bridge** cross-chain (CCTP, Ultrafast)
- **Stake** (Lido, Aave)
- **Lend/Borrow** (Aave V3)
- **Manage liquidity** pools
- **Create strategies** (DCA, TP/SL, volatility triggers)
- **Check balances**, prices, portfolio, history

## Supported Chains

Ethereum, Polygon, Arbitrum, Base, Optimism, BNB, Solana, Bitcoin, Litecoin, ICP, Sui, TON, XRP, Cardano, TRON, Aptos, NEAR, CloakCoin, THORChain

## Install

```bash
openclaw plugins install @menese/menese-protocol
```

Or from this repo:

```bash
openclaw plugins install https://github.com/Aboodtt404/menese-protocol
```

## Setup

### For Users

Just install the plugin and run `/setup` in chat — it walks you through linking your ICP wallet. That's it.

### For Operators (OpenClaw admins)

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "menese-protocol": {
        "enabled": true,
        "config": {
          "developerKey": "msk_YOUR_KEY_HERE"
        }
      }
    }
  }
}
```

The `developerKey` is an operator-level credential — it authenticates SDK relay calls and handles billing for all users on your instance. End users never see or need this key. Get one by calling `registerDeveloperCanister()` on the MeneseSDK canister.

### Config Options (operator)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `developerKey` | string | — | Menese developer API key (`msk_...`). Authenticates relay calls and handles billing. |
| `relayUrl` | string | auto | VPS relay endpoint |
| `sdkCanisterId` | string | `ewcc5-...` (agent) | MeneseAgent canister ID |
| `autoApproveThreshold` | number | `0` | USD threshold below which transactions auto-approve (0 = always confirm) |
| `testMode` | boolean | `false` | Use test canister instead of production |

## Commands

| Command | Description |
|---------|-------------|
| `/setup` | Onboarding — connect your ICP wallet |
| `/link-wallet <principal>` | Link/unlink wallet directly |
| `/portfolio` | View balances across all chains |
| `/history [count]` | Transaction history (last N operations) |
| `/strategy` | View active strategy rules |
| `/subscribe [tier]` | View or purchase a subscription plan |

## How it Works

```
You (chat) → OpenClaw AI → Plugin Tools → VPS Relay → MeneseAgent Canister
    → MeneseSDK → Threshold ECDSA → Blockchain
```

1. You chat naturally with OpenClaw ("Swap 1 ETH for USDC")
2. The AI picks the right tool (`menese_swap`)
3. Transaction guard enforces quote-then-execute for safety
4. Plugin calls the VPS relay → MeneseAgent canister on ICP
5. MeneseAgent routes to MeneseSDK which signs via threshold ECDSA
6. Transaction is broadcast to the target blockchain

No private keys. No seed phrases. ICP's chain-key cryptography handles signing.

## Architecture

```
extensions/menese-protocol/
├── index.ts                    # Plugin entry point
├── openclaw.plugin.json        # Manifest + config schema
└── src/
    ├── config.ts               # Config parsing + defaults
    ├── store.ts                # userId → ICP principal mapping
    ├── sdk-client.ts           # HTTP client (rate limits, timeouts, errors)
    ├── chains.ts               # 19 supported chains
    ├── canisters.ts            # Canister IDs (prod/test/dev)
    ├── errors.ts               # 50+ error patterns from ErrorClassifier
    ├── tools/                  # 13 AI tools
    │   ├── send.ts, swap.ts, stake.ts, lend.ts, bridge.ts
    │   ├── quote.ts, liquidity.ts, strategy.ts
    │   ├── balance.ts, portfolio.ts, history.ts, jobs.ts, prices.ts
    │   └── _helpers.ts
    ├── hooks/
    │   ├── transaction-guard.ts  # Quote-then-execute + rate limits
    │   └── audit-logger.ts       # JSONL audit trail
    ├── commands/                # 6 slash commands
    │   ├── setup.ts, link-wallet.ts, portfolio.ts
    │   ├── history.ts, strategy.ts, subscribe.ts
    │   └── index.ts
    └── http/
        └── webhook.ts          # Async callback receiver
```

## License

MIT
