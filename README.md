# Redline Receipt

> **Draw the line. Make the trade. Let Flare judge.**

Redline Receipt is a pre-trade decision guardrail for high-risk swaps. Before a user trades, they set limits for input, output, and expiry, then publish that boundary to Coston2. Redline explains the risk, but never executes the swap. After the trade, Flare Data Connector (FDC) verifies the external-chain facts and a Coston2 contract writes either `LINE_HELD` or `LINE_CROSSED`.

Redline is not a price-prediction bot, a custodian, or an auto-executor. AI explains risk. Flare verifies facts. The user stays in control.

## Live proof of the mechanic

The full path is deployed and verified:

```text
Sepolia ETH → USDC swap
  → FDC EVMTransaction / testETH proof
  → Coston2 FdcEvmTransactionVerifier
  → RedlineReceipt
  → LINE_HELD
```

| Item | Link / value |
|---|---|
| Bounty | Bounty 1: Interoperable Asset Products |
| Flare network | Coston2, Chain ID `114` |
| FDC adapter | [`0x0aeA…5693`](https://coston2-explorer.flare.network/address/0x0aeA880F18232fE82EdA800a874F5CbE99dd5693) |
| Receipt contract | [`0x01Dd…5B74`](https://coston2-explorer.flare.network/address/0x01Dd46c45c7d5fC805B93CD331d6FaA60C735B74) |
| Live Receipt | [`0x2118…ec24`](https://coston2-explorer.flare.network/tx/0xdafac332ea09369949906ae4ae14227d46d9469460e43972f30c7b345f3641e2) |
| Final verdict | [`LINE_HELD`](https://coston2-explorer.flare.network/tx/0xdafac332ea09369949906ae4ae14227d46d9469460e43972f30c7b345f3641e2) |
| External source transaction | [Sepolia transaction](https://sepolia.etherscan.io/tx/0xf85d179a409f364e3bfea157155484cec869f7b61df81784b60cdab84eb1dcb4) |
| FDC voting round | `1425147` |
| Verified facts | `0.001 ETH` in, `33.320629 USDC` out |

## One clear mechanic

```text
Set a redline → publish it on Coston2 → make a trade → let Flare judge
```

The Receipt binds:

1. A maximum input and/or maximum position size.
2. A minimum output.
3. The intended chain, router, assets, expiry, and nonce.

Only a verified FDC proof can produce a final on-chain verdict. Missing or unsupported evidence remains `UNVERIFIED`; the app never turns unknown facts into a safety claim.

## Why Flare is essential

Flare is the product mechanic, not background infrastructure:

1. FDC imports verifiable Sepolia transaction facts to Coston2.
2. `FdcEvmTransactionVerifier` verifies the FDC Merkle proof through Coston2's `FdcVerification` contract and normalizes the facts.
3. `RedlineReceipt` compares those facts with the user-authored Receipt, enforces expiry and replay protection, and writes the immutable verdict.
4. The public-facing evidence card can link users and judges to the external transaction and Coston2 verdict.

The controlled MVP supports one explicit shape: a successful Sepolia native ETH input with an ERC-20 `Transfer` output to the source address. Other shapes fail closed.

## Run locally

Prerequisites: Node.js, Foundry (`forge` and `cast`), and a Coston2-funded test wallet. Copy `.env.example` to `.env` and fill secrets locally. Never commit `.env`.

```bash
npm start
# http://localhost:4173

# Optional: enable the live AI evidence explainer locally.
# Keep OPENAI_API_KEY server-side; the contract verdict never depends on it.
OPENAI_API_KEY=... npm start

npm test
forge test
```

### Request and verify an FDC attestation

```bash
TX=0xf85d179a409f364e3bfea157155484cec869f7b61df81784b60cdab84eb1dcb4

REQ=$(npm run --silent fdc:prepare -- "$TX" 2>/dev/null | jq -r '.abiEncodedRequest')
npm run fdc:submit -- "$REQ"

# Use the votingRoundId printed by fdc:submit. This script resolves the current
# FlareSystemsManager parameters from Coston2 instead of hard-coding them.
PACKED_PROOF=$(npm run --silent fdc:proof -- 1425147 "$REQ" \
  | npm run --silent fdc:pack-proof -- -)
```

If the testnet fee configuration fails to resolve, make one explicit retry:

```bash
FDC_REQUEST_FEE=1ether npm run fdc:submit -- "$REQ"
```

### Deploy and create a Receipt

```bash
npm run deploy:coston2

npm run receipt:submit -- <redline-receipt-address>
npm run receipt:verify -- <redline-receipt-address> <receipt-id> "$PACKED_PROOF"
```

The deployment script deploys the FDC adapter first, then the immutable Receipt contract. The default route is Sepolia `0.001 ETH → USDC`, with a `30 USDC` minimum output.

## What is implemented

- Decision Receipt schema, canonicalization, expiry, nonce, and replay protection.
- Browser-side Coston2 `submitReceipt` publishing with transaction confirmation.
- Coston2 RPC reads for the deployed Receipt status and fields.
- Deterministic risk checks plus a local fallback Risk Capsule.
- Optional server-side structured AI explanation grounded only in Receipt and FDC facts.
- Presets for small probes, known routers, and cooling-off trades.
- A fixture `LINE_HELD` and `LINE_CROSSED` replay for the UI.
- A real `LIVE FDC` card for the deployed Coston2 `LINE_HELD` receipt.
- Solidity contracts and Foundry tests for held, crossed, mismatched, expired, and replay paths.
- Scripts for FDC request preparation, submission, proof polling, proof packing, deployment, Receipt submission, and verdict verification.

## Demo script (60–90 seconds)

1. Open Redline, connect a Coston2 wallet, and choose **Probe Position**.
2. Show the user-authored `0.001 ETH` maximum and USDC minimum output.
3. Click **Publish Redline on Coston2** and show the real `ReceiptCreated` transaction.
4. Open **LIVE FDC** and show the deployed Receipt state read from Coston2.
5. Show the verified Sepolia transaction facts and the Coston2 `LINE_HELD` verdict.
6. Click **Refresh risk brief** to request the optional live AI explanation; if no key is configured, show the explicit unavailable state.
7. Run the fixture `LINE_CROSSED` replay to demonstrate the failure state without claiming it is live evidence.

## Documentation

- [Product requirements](docs/PRD.md)
- [Technical design and reproduction guide](docs/TECHNICAL.md)
- [Product design and scope rationale](docs/design_en.md)

## Submission packet

| Field | Value |
|---|---|
| Project | Redline Receipt |
| Target users | DeFi traders who want pre-trade discipline without surrendering wallet control |
| Flare usage | FDC verifies external EVM facts; Coston2 contracts write the final Receipt verdict |
| New work | Receipt commitment, FDC adapter, proof packing, verdict contracts, risk UX, live proof card, public evidence model |
| GitHub | [rectinajh/Redline](https://github.com/rectinajh/Redline) |
| Public app | To be published |
| Demo video | To be recorded |

## Roadmap

1. Deploy the frontend and record the live Receipt publish/proof walkthrough.
2. Add a second, real crossed transaction path.
3. Support more FDC-verifiable EVM routes and non-smart-contract assets through FAssets.
4. Keep private trade reasons and richer risk logic inside FCC only when it adds a real privacy benefit.

## Disclaimer

Redline is a prototype and not financial, trading, or security advice. A `LINE_HELD` verdict only means that verified transaction facts met the specific Receipt limits. It does not mean that a trade is safe or profitable.
