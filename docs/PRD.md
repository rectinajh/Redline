# Redline Receipt — Product Requirements Document

**Version:** 1.0
**Status:** Hackathon MVP
**Bounty:** Bounty 1 — Interoperable Asset Products
**Flare network:** Coston2, Chain ID `114`

## 1. Product definition

Redline Receipt is a pre-trade decision guardrail. A trader writes their own limits before a high-risk swap, reviews a risk brief, and signs a Decision Receipt. The trader still executes the swap directly with their wallet. Afterward, Flare verifies external-chain facts with FDC and judges whether the user kept their own line.

> Redline is not an AI trading bot that predicts price. It makes self-deception harder before signing and proves rule-following after the trade.

## 2. Target users and problem

**Target users** are DeFi traders who use volatile DEX routes, tend to chase trades or expand a position, and do not want to delegate signing authority to a bot or policy wallet.

Existing warnings usually describe a contract risk but do not bind a trader's own limits to the final transaction. A handwritten plan is not verifiable. A transaction simulator predicts an outcome but does not prove whether the user followed their stated rule.

## 3. Goals and non-goals

### Goals

1. Explain the mechanic in ten seconds: “Draw a redline, make a trade, let Flare judge.”
2. Give the user a useful pause before a risky signature.
3. Demonstrate one complete FDC-backed, on-chain verdict path.
4. Keep fixture replays clearly labeled and never present them as live FDC evidence.
5. Deliver a public repository, deployed contracts, a public web app, and a 60–90 second video.

### Non-goals

- Price prediction, buy/sell advice, or profit guarantees.
- Auto-signing, auto-execution, custody, or private-key storage.
- Support for every chain, router, asset, or wallet.
- A production threat-intelligence platform or FCC implementation in this MVP.

## 4. Core mechanic

```text
Draw the line → see the risk → sign the Receipt → make the trade → let Flare judge
```

The minimum Receipt binds:

```text
trader, chainId, router, tokenIn, tokenOut,
maxInput, minOutput, maxPositionBps, expiry,
simulationHash, riskAssessmentHash, threatIntelSnapshotHash, nonce
```

Long private text is not stored on-chain. The MVP stores hashes and exposes only the minimum public evidence.

## 5. User experience

### Before the trade

The trader chooses a preset or writes limits. The screen displays the route, the maximum position, the minimum output, a deterministic safety checklist, and a clearly labeled Risk Capsule.

The fixed MVP presets are:

- **Probe Position:** a small position with a 1% maximum-position framing.
- **No Unknown Router:** an allowlist boundary for the controlled router.
- **Cooling-Off Trade:** a short expiry that forces a re-check before action.

### Risk brief and signing boundary

The Risk Capsule shows route, network, expected asset delta, simulation state, allowance surface, source labels, and AI explanation. Its boundary is explicit: deterministic rules may block, AI can only explain, and the wallet is the only signer.

### After the trade

FDC verifies the chosen external transaction. The Receipt contract checks the proof, chain, router, assets, amounts, expiry, nonce, and replay state. It writes one final status:

- `LINE_HELD`: verified facts meet the Receipt limits.
- `LINE_CROSSED`: verified facts exceed a limit.
- `MISMATCHED`, `EXPIRED`, or `REPLAYED`: the evidence cannot be accepted for that Receipt.
- `UNVERIFIED`: the frontend must not claim a verdict when proof is absent or unsupported.

## 6. Trust and safety principles

1. The user never gives Redline a private key or execution authority.
2. AI is an explanation layer, never a safety oracle.
3. Deterministic checks may block a route; AI cannot override them.
4. Only a Coston2 contract that consumed verified FDC evidence can create the final verdict.
5. All live, fixture, mock, and unverified data must be visibly labeled.
6. Receipts use an expiry, a trader nonce, and a consumed flag to prevent replay.

## 7. Live MVP evidence

The controlled demonstration has completed one real path:

| Evidence | Value |
|---|---|
| External chain | Sepolia, `11155111` |
| Attestation | `EVMTransaction` / `testETH` |
| FDC round | `1425147` |
| External swap | [0xf85d…dcb4](https://sepolia.etherscan.io/tx/0xf85d179a409f364e3bfea157155484cec869f7b61df81784b60cdab84eb1dcb4) |
| Verified input | `0.001 ETH` |
| Verified output | `33.320629 USDC` |
| Receipt verdict | [`LINE_HELD`](https://coston2-explorer.flare.network/tx/0xdafac332ea09369949906ae4ae14227d46d9469460e43972f30c7b345f3641e2) |

## 8. Acceptance criteria

### P0

- [x] Coston2 contracts and explorer links exist.
- [x] An FDC request reaches a verified on-chain adapter.
- [x] A Receipt has produced `LINE_HELD` from verified facts.
- [x] Receipt limits, expiry, mismatch, and replay paths have contract tests.
- [x] Fixture states are visibly distinguished from the live evidence card.

### P1

- [ ] Publish a non-localhost app URL.
- [ ] Record the 60–90 second demo video.
- [ ] Add a second live transaction that produces `LINE_CROSSED`.

## 9. Demo outline

1. Set a limit for the controlled ETH → USDC route.
2. Show the risk brief and explicit wallet boundary.
3. Show the signed Decision Receipt.
4. Open LIVE FDC and the Sepolia transaction.
5. Open the Coston2 `LINE_HELD` verdict.
6. Replay an explicitly labeled crossed fixture.

## 10. Submission copy

**Project:** Redline Receipt
**Bounty:** Bounty 1 — Interoperable Asset Products
**Summary:** A user-authored pre-trade Receipt becomes an on-chain accountability record. FDC verifies the external swap and Flare writes whether the user held or crossed their own line.
**Target users:** DeFi traders seeking discipline without giving up wallet control.
**How Flare is used:** FDC imports verifiable external EVM facts; Coston2 contracts compare them with the Receipt and write the verdict.
**New work:** FDC proof adapter, immutable Receipt contract, proof-packing scripts, risk UX, live evidence card, fixture replays, and replay protection.
**Contracts:** [adapter](https://coston2-explorer.flare.network/address/0x0aeA880F18232fE82EdA800a874F5CbE99dd5693), [Receipt](https://coston2-explorer.flare.network/address/0x01Dd46c45c7d5fC805B93CD331d6FaA60C735B74).
**Short-term roadmap:** publish the app, add a real crossed path, then extend supported FDC routes and consider privacy-sensitive logic with FCC.
