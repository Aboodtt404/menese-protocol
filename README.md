# Menese Protocol — OpenClaw Plugin

Multi-chain crypto operations across **19 blockchains** from your AI assistant, powered by [Menese SDK](https://github.com/Menese-Protocol/MeneseSDK-V0) on the Internet Computer.

## What it does

Talk to your OpenClaw AI naturally to manage crypto:

- **Send** tokens on any chain
- **Swap** via DEXs (Uniswap, Raydium, ICPSwap, etc.)
- **Bridge** cross-chain (CCTP, Ultrafast)
- **Create strategies** (DCA, TP/SL, volatility triggers)
- **Scheduled jobs** via on-chain agent canister (recurring DCA, conditional sells)
- **Check balances**, prices, portfolio

## Supported Chains

Ethereum, Polygon, Arbitrum, Base, Optimism, BNB, Solana, Bitcoin, Litecoin, ICP, Sui, TON, XRP, Cardano, TRON, Aptos, NEAR, CloakCoin, THORChain

## Install

```bash
openclaw plugins install @menese_protocol/openclaw
```

Or from a local clone:

```bash
git clone https://github.com/Aboodtt404/menese-protocol
openclaw plugins install ./menese-protocol
```

## Setup

### For Users

1. Install the plugin on your OpenClaw instance
2. Run `/setup` in chat — the bot creates a wallet for you automatically
3. Start using natural language: "Send 0.1 ETH to 0x..." or "What's my portfolio?"

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

The `developerKey` authenticates SDK relay calls and handles billing for all users on your instance. Get one by calling `registerDeveloperCanister()` on the MeneseSDK canister.

### Config Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `developerKey` | string | — | Menese developer API key (`msk_...`) |
| `sdkCanisterId` | string | `urs2a-...` (prod SDK) | MeneseSDK canister ID |
| `relayUrl` | string | `http://localhost:18791` | VPS relay endpoint |
| `autoApproveThreshold` | number | `0` | USD threshold for auto-approve (0 = always confirm) |
| `factoryCanisterId` | string | — | MeneseAgent factory canister ID (for `/deploy-agent`) |
| `factoryAdminSeed` | string | — | Ed25519 hex seed for factory admin (for spawning agents) |
| `testMode` | boolean | `false` | Use test SDK canister instead of production |

## Commands

| Command | Description |
|---------|-------------|
| `/setup` | Create a bot-managed wallet |
| `/setup import <seed>` | Import an existing Ed25519 identity |
| `/verify` | Check wallet status and agent connection |
| `/deploy-agent` | View agent tiers and deployment status |
| `/deploy-agent <tier>` | Get deposit address for a tier (starter/professional/enterprise) |
| `/deploy-agent check` | Verify ICP deposit |
| `/deploy-agent create` | Spawn agent canister after deposit |
| `/deploy-agent link <id>` | Link an existing agent canister |
| `/deploy-agent unlink` | Disconnect agent canister |

## Agent Canister (Optional)

For on-chain automation (DCA, TP/SL, scheduled jobs), users can deploy a MeneseAgent canister:

1. `/deploy-agent starter` — get deposit address (0.5 ICP)
2. Send ICP to the deposit address
3. `/deploy-agent check` — verify deposit arrived
4. `/deploy-agent create` — factory spawns your agent canister

Once linked, DCA/take-profit/stop-loss strategies automatically route to the agent canister for persistent on-chain scheduling. Without an agent, strategies use SDK's built-in rule engine.

**Tiers:** Starter (0.5 ICP), Professional (2 ICP), Enterprise (5 ICP) — ICP is converted to cycles to power the canister.

## How it Works

```
You (chat) → OpenClaw AI → Plugin Tools → ICP Canister Calls
    → MeneseSDK → Threshold ECDSA → Blockchain
```

1. You chat naturally ("Swap 1 ETH for USDC")
2. The AI picks the right tool (`menese_swap`)
3. Transaction guard enforces quote-then-execute for safety
4. Plugin makes Candid calls to the SDK canister on ICP
5. SDK signs via threshold ECDSA (chain-key cryptography)
6. Transaction is broadcast to the target blockchain

No private keys exported. No seed phrases for users to manage.

## Architecture

```
menese-protocol/
├── index.ts                    # Plugin entry point
├── openclaw.plugin.json        # Manifest + config schema
└── src/
    ├── config.ts               # Config parsing + defaults
    ├── store.ts                # Identity store (principal + seed + agent)
    ├── ic-client.ts            # Candid actor client for MeneseSDK
    ├── agent-client.ts         # Candid actor client for MeneseAgent
    ├── factory-client.ts       # Factory canister client (deploy agents)
    ├── cache.ts                # In-memory TTL cache (prices/balances)
    ├── chains.ts               # 19 supported chains
    ├── canisters.ts            # Canister IDs (prod/test)
    ├── tools/                  # AI tools
    │   ├── send.ts, swap.ts, bridge.ts
    │   ├── quote.ts, strategy.ts, jobs.ts
    │   ├── balance.ts, portfolio.ts, prices.ts
    │   └── _helpers.ts
    ├── hooks/
    │   ├── transaction-guard.ts  # Quote-then-execute + rate limits
    │   └── audit-logger.ts       # JSONL audit trail
    ├── commands/
    │   ├── setup.ts, verify.ts, deploy-agent.ts
    │   └── index.ts
    └── http/
        └── webhook.ts          # Async callback receiver
```

## License

MIT
