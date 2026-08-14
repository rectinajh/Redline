# Redline Receipt — Technical Design and Reproduction Guide

**Version:** 1.0
**Status:** Hackathon MVP, live FDC path verified
**Target:** Coston2 (`114`), Bounty 1 — Interoperable Asset Products

## 1. Scope

Redline implements one small, auditable fact chain:

```text
User-authored limits
  → Receipt commitment on Coston2
  → external Sepolia swap
  → FDC EVMTransaction proof
  → FdcEvmTransactionVerifier
  → RedlineReceipt verdict
```

The MVP intentionally supports one controlled shape only:

- Source: Sepolia via FDC source ID `testETH`.
- Attestation type: `EVMTransaction`.
- Input: native ETH (`address(0)`) with non-zero transaction value.
- Output: an ERC-20 `Transfer` event whose recipient is the transaction source address.
- Router: `responseBody.receivingAddress`.
- Route: router `0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468`, Sepolia USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.

Unsupported proof shapes return `verified=false`; the Receipt contract then rejects them. The app does not generalize one known proof shape into a claim of universal swap support.

Out of scope: automated signing or execution, custody, upgradeable contracts, a multi-chain routing engine, production FAssets integration, FCC private compute, and multi-provider threat intelligence.

## 2. Architecture

```text
Web UI
  ├─ presets, deterministic checks, local Risk Capsule
  ├─ browser Coston2 Receipt publisher
  ├─ optional server-side structured AI explainer
  └─ on-chain evidence card and fixture replay

FDC scripts
  ├─ prepare request through verifier API
  ├─ submit to Coston2 FdcHub
  ├─ poll DA Layer for proof
  └─ ABI-pack Merkle proof and response bytes

Coston2 contracts
  ├─ FdcEvmTransactionVerifier: FDC proof → normalized external facts
  └─ RedlineReceipt: limits + facts → immutable verdict
```

The browser never holds a deployment private key. `.env` is local-only and ignored by Git. The browser uses the user's injected wallet only for the Coston2 `submitReceipt` transaction; deployment keys, FDC verifier keys, DA Layer keys, and the optional AI key remain server-side or local-only.

## 3. Data model

### Receipt

```solidity
struct Receipt {
    address trader;
    uint256 chainId;
    address router;
    address tokenIn;
    address tokenOut;
    uint256 maxInput;
    uint256 minOutput;
    uint256 maxPositionBps;
    uint64 expiry;
    bytes32 simulationHash;
    bytes32 riskAssessmentHash;
    bytes32 threatIntelSnapshotHash;
    uint256 nonce;
}
```

All quantities are integer base units. Long user notes and risk outputs remain off-chain; only content hashes are committed.

### Normalized external facts

```solidity
struct ExternalFacts {
    uint256 externalChainId;
    address router;
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint256 amountOut;
    bytes32 transactionHash;
}
```

`FdcEvmTransactionVerifier.verify(bytes)` receives `abi.encode(bytes32[] merkleProof, bytes responseBytes)`, calls Coston2 `FdcVerification.verifyEVMTransaction`, and returns these facts only when every controlled-shape check passes.

## 4. Contract behavior

### RedlineReceipt

The constructor fixes the external chain, verifier, router, token input, and token output. There is no administrator function that edits an existing Receipt or verdict.

`submitReceipt` checks the trader, external chain, expiry, position range, nonce, and fixed route. It creates a deterministic ID:

```text
receiptId = keccak256(abi.encode(all Receipt fields))
```

`verifyReceipt` enforces this order:

1. Reject missing or consumed Receipts.
2. Mark expired Receipts as `EXPIRED`.
3. Ask the verifier for normalized facts; reject invalid proofs.
4. Mark a chain, router, or asset mismatch as `MISMATCHED`.
5. Compare `amountIn <= maxInput` and `amountOut >= minOutput`.
6. Mark the Receipt consumed and emit `LINE_HELD` or `LINE_CROSSED`.

### Status values

| Code | Status | Meaning |
|---:|---|---|
| 0 | `NONE` | Receipt does not exist |
| 1 | `DRAFT` | Submitted, awaiting proof |
| 2 | `VERIFIED` | Reserved for future intermediate state |
| 3 | `LINE_HELD` | Verified facts meet limits |
| 4 | `LINE_CROSSED` | Verified facts violate a limit |
| 5 | `EXPIRED` | Receipt expired before verification |
| 6 | `MISMATCHED` | Verified facts do not match the committed route |
| 7 | `REPLAYED` | Reserved replay terminal state |

## 5. Deployed contracts and live smoke test

| Component | Address / transaction |
|---|---|
| `FdcEvmTransactionVerifier` | [`0x0aeA880F18232fE82EdA800a874F5CbE99dd5693`](https://coston2-explorer.flare.network/address/0x0aeA880F18232fE82EdA800a874F5CbE99dd5693) |
| `RedlineReceipt` | [`0x01Dd46c45c7d5fC805B93CD331d6FaA60C735B74`](https://coston2-explorer.flare.network/address/0x01Dd46c45c7d5fC805B93CD331d6FaA60C735B74) |
| Adapter deployment | [`0x6d58…90e1`](https://coston2-explorer.flare.network/tx/0x6d580b2467d81d87195783a7fcbea40392f3e1e769f6e80b3243d85d611390e1) |
| Receipt deployment | [`0x2806…9dcf`](https://coston2-explorer.flare.network/tx/0x280699f42164faf3636326b57e445367d41948102a8e025b95247aab25999dcf) |
| Source swap | [Sepolia `0xf85d…dcb4`](https://sepolia.etherscan.io/tx/0xf85d179a409f364e3bfea157155484cec869f7b61df81784b60cdab84eb1dcb4) |
| Receipt and verdict | [Coston2 `0xdafa…41e2`](https://coston2-explorer.flare.network/tx/0xdafac332ea09369949906ae4ae14227d46d9469460e43972f30c7b345f3641e2) |

The verified proof came from FDC round `1425147` and contained three Merkle nodes. The adapter returned:

```text
verified          true
externalChainId   11155111
router            0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468
tokenIn           0x0000000000000000000000000000000000000000
tokenOut          0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
amountIn          1000000000000000      (0.001 ETH)
amountOut         33320629               (33.320629 USDC)
```

The Receipt committed `maxInput=1000000000000000` and `minOutput=30000000`, so the contract emitted `LINE_HELD` with status code `3`.

## 6. FDC workflow

### Prepare

`scripts/fdc/prepare-request.mjs` posts the selected transaction hash to the testnet verifier endpoint:

```text
POST /verifier/eth/EVMTransaction/prepareRequest
```

The canonical request sets `requiredConfirmations=1`, `provideInput=true`, `listEvents=true`, and an empty `logIndices` list.

### Submit

`scripts/fdc/submit-request.mjs` dynamically resolves `FdcHub`, `FdcRequestFeeConfigurations`, and `FlareSystemsManager` from the Coston2 Contract Registry. It reads the actual request fee and computes the voting round from the request block timestamp plus live system parameters. It does not rely on a hard-coded epoch start.

### Fetch and pack

`scripts/fdc/get-proof.mjs` polls:

```text
POST https://ctn2-data-availability.flare.network/api/v1/fdc/proof-by-request-round-raw
```

The script preserves the same voting round and encoded request while the DA Layer returns `attestation request not found`. `scripts/fdc/pack-proof.mjs` converts the raw `proof[]` and `response_hex` into the ABI input expected by the adapter. It accepts a JSON file or `-` for standard input.

## 7. Commands

```bash
# Local quality checks
npm test
forge test

# Prepare an FDC request
npm run fdc:prepare -- <sepolia-tx-hash>

# Submit it to Coston2 and print the dynamically calculated voting round
npm run fdc:submit -- <abi-encoded-request>

# Obtain and pack a finalized proof
npm run fdc:proof -- <voting-round-id> <abi-encoded-request> \
  | npm run fdc:pack-proof -- -

# Deploy the two Coston2 contracts
npm run deploy:coston2

# Create and verify a Receipt
npm run receipt:submit -- <receipt-contract>
npm run receipt:verify -- <receipt-contract> <receipt-id> <packed-proof>
```

Environment keys are documented in `.env.example`. Real values belong only in `.env` or the shell environment.

## 8. Security boundaries

- Validate EVM addresses, hashes, integer base units, expiry, and allowed routes before creating a Receipt.
- Do not accept a frontend boolean, server database record, or fixture as FDC evidence.
- The browser's `LIVE FDC` view reads the Receipt status and fields from the public Coston2 RPC; it does not treat a local fixture as chain state.
- Fail closed if FDC proof verification or the controlled proof-shape checks fail.
- Use a user nonce and a consumed flag to prevent a Receipt from being evaluated twice.
- Never log, publish, or commit private keys, verifier keys, or DA Layer keys.
- Label fixture data, mock data, and unavailable live data at every presentation boundary.

## 9. Tests

| Layer | Coverage |
|---|---|
| Node tests | canonical request construction, evidence verdicts, blocked routers, and fail-closed unverified evidence |
| Foundry | held, crossed, mismatch, replay, native ETH-to-ERC20 extraction, and invalid-proof failure |
| Live smoke | verifier proof retrieval, adapter read-only verification, and Coston2 `LINE_HELD` transaction |

Run all local tests with `npm test && forge test`.

## 10. Known limitations and next steps

The live path is intentionally narrow. A second real crossed path, a hosted frontend, and a video are still required for the strongest submission. Future work can support more FDC transaction shapes, additional external networks, FAssets-based assets, and privacy-sensitive rule evaluation through FCC.

## References

- [Flare FDC getting started](https://dev.flare.network/fdc/getting-started)
- [Flare EVMTransaction guide](https://dev.flare.network/fdc/guides/hardhat/evm-transaction)
- [Flare IEVMTransaction reference](https://dev.flare.network/fdc/reference/IEVMTransaction)
