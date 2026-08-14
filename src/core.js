export const COSTON2_CHAIN_ID = 114;
export const SEPOLIA_CHAIN_ID = 11155111;
// The controlled MVP route is a real Sepolia ETH -> USDC transaction shape.
// Fixture replay remains explicitly labeled; these values also match Coston2 deploy defaults.
export const DEMO_ROUTER = "0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468";
export const DEMO_TOKEN_IN = "0x0000000000000000000000000000000000000000";
export const DEMO_TOKEN_OUT = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
export const INPUT_SYMBOL = "ETH";
export const OUTPUT_SYMBOL = "USDC";
export const INPUT_DECIMALS = 18;
export const OUTPUT_DECIMALS = 6;
export const DEMO_QUOTED_OUTPUT = 33_320_629; // 33.320629 Sepolia USDC units
export const LIVE_RECEIPT_ID = "0x21185fd8e0fccc729d85df9ad8aaa9e558bc7e70c1b06c8ea24ad98e5441ec24";
export const LIVE_VERDICT_TX = "0xdafac332ea09369949906ae4ae14227d46d9469460e43972f30c7b345f3641e2";
export const LIVE_EXTERNAL_TX = "0xf85d179a409f364e3bfea157155484cec869f7b61df81784b60cdab84eb1dcb4";

export const STATUS = Object.freeze({
  DRAFT: "DRAFT",
  SIGNED: "SIGNED",
  TRADE_SUBMITTED: "TRADE_SUBMITTED",
  PROOF_REQUESTED: "PROOF_REQUESTED",
  PROOF_FINALIZED: "PROOF_FINALIZED",
  VERIFIED: "VERIFIED",
  LINE_HELD: "LINE_HELD",
  LINE_CROSSED: "LINE_CROSSED",
  EXPIRED: "EXPIRED",
  MISMATCHED: "MISMATCHED",
  REPLAYED: "REPLAYED",
  UNVERIFIED: "UNVERIFIED",
});

export const CHECK_STATUS = Object.freeze({ OK: "OK", CAUTION: "CAUTION", BLOCKED: "BLOCKED", UNKNOWN: "UNKNOWN", STALE: "STALE" });

export const PRESETS = Object.freeze([
  {
    id: "probe",
    label: "Probe Position",
    eyebrow: "SMALL TEST",
    description: "先试探，不让一笔交易占满你的注意力。",
    maxPositionBps: 100,
    minOutputBps: 9800,
    expiryMinutes: 10,
    badge: "1% MAX",
  },
  {
    id: "trusted",
    label: "No Unknown Router",
    eyebrow: "KNOWN PATH",
    description: "只允许你明确认过的 router 和交易对。",
    maxPositionBps: 250,
    minOutputBps: 9900,
    expiryMinutes: 15,
    badge: "ALLOWLIST",
  },
  {
    id: "cooling",
    label: "Cooling-Off Trade",
    eyebrow: "PAUSE FIRST",
    description: "高波动、高风险时，先让冲动多等五分钟。",
    maxPositionBps: 50,
    minOutputBps: 9700,
    expiryMinutes: 5,
    badge: "5 MIN",
  },
]);

const nowIso = () => new Date().toISOString();
const randomHex = (bytes = 16) => {
  const values = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values.fill(7);
  return `0x${Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("")}`;
};

export function createDraft(preset = PRESETS[0]) {
  const expiry = Math.floor(Date.now() / 1000) + preset.expiryMinutes * 60;
  return {
    schemaVersion: "receipt.v1",
    trader: "0x0000000000000000000000000000000000000000",
    // The Receipt binds the external execution chain. The Receipt contract
    // and wallet session live on Coston2, which is tracked separately.
    chainId: SEPOLIA_CHAIN_ID,
    router: DEMO_ROUTER,
    tokenIn: DEMO_TOKEN_IN,
    tokenOut: DEMO_TOKEN_OUT,
    maxInput: "1000000000000000", // 0.001 Sepolia ETH
    minOutput: String(Math.floor(DEMO_QUOTED_OUTPUT * preset.minOutputBps / 10_000)),
    maxPositionBps: preset.maxPositionBps,
    expiry,
    simulationHash: randomHex(16),
    riskAssessmentHash: randomHex(16),
    threatIntelSnapshotHash: randomHex(16),
    nonce: randomHex(16),
    reason: "I am testing whether this trade deserves my attention and capital.",
  };
}

export function canonicalize(value) {
  const ordered = {
    schemaVersion: value.schemaVersion,
    trader: value.trader,
    chainId: Number(value.chainId),
    router: value.router.toLowerCase(),
    tokenIn: value.tokenIn.toLowerCase(),
    tokenOut: value.tokenOut.toLowerCase(),
    maxInput: String(value.maxInput),
    minOutput: String(value.minOutput),
    maxPositionBps: Number(value.maxPositionBps),
    expiry: Number(value.expiry),
    simulationHash: value.simulationHash,
    riskAssessmentHash: value.riskAssessmentHash,
    threatIntelSnapshotHash: value.threatIntelSnapshotHash,
    nonce: value.nonce,
  };
  return JSON.stringify(ordered);
}

export function shortAddress(address) {
  if (!address || address.length < 12) return "not connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function runDeterministicChecks(draft) {
  const minimumOutputBps = Math.floor(Number(draft.minOutput) * 10_000 / DEMO_QUOTED_OUTPUT);
  const checks = [
    {
      id: "network",
      label: "Network",
      status: Number(draft.chainId) === SEPOLIA_CHAIN_ID ? CHECK_STATUS.OK : CHECK_STATUS.BLOCKED,
      detail: Number(draft.chainId) === SEPOLIA_CHAIN_ID ? "Sepolia · Chain ID 11155111" : "Wrong execution network",
    },
    {
      id: "router",
      label: "Router allowlist",
      status: draft.router.toLowerCase() === DEMO_ROUTER ? CHECK_STATUS.OK : CHECK_STATUS.BLOCKED,
      detail: draft.router.toLowerCase() === DEMO_ROUTER ? "Known demo route" : "Router is not allowlisted",
    },
    {
      id: "slippage",
      label: "Minimum output",
      status: minimumOutputBps >= 9900 ? CHECK_STATUS.OK : CHECK_STATUS.CAUTION,
      detail: `${((1 - minimumOutputBps / 10_000) * 100).toFixed(2)}% below the 33.320629 USDC quote`,
    },
    {
      id: "approval",
      label: "Approval surface",
      status: CHECK_STATUS.CAUTION,
      detail: "Exact amount approval · no unlimited allowance",
    },
    {
      id: "simulation",
      label: "Swap simulation",
      status: CHECK_STATUS.OK,
      detail: "No revert in controlled path",
    },
    {
      id: "asset-change",
      label: "Asset change",
      status: CHECK_STATUS.OK,
      detail: "ETH → USDC · expected balance delta",
    },
  ];
  return checks;
}

export function createRiskCapsule(draft, checks, mode = "FIXTURE") {
  const blocked = checks.some((check) => check.status === CHECK_STATUS.BLOCKED);
  const cautionCount = checks.filter((check) => check.status === CHECK_STATUS.CAUTION).length;
  const score = Math.min(96, 42 + cautionCount * 10 + (blocked ? 35 : 0));
  const riskLevel = blocked ? "BLOCKED" : score >= 70 ? "ELEVATED" : "WATCH";
  return {
    schemaVersion: "risk_capsule.v1",
    generatedAt: nowIso(),
    provenance: mode,
    score,
    riskLevel,
    deterministicChecks: checks,
    threatIntel: {
      source: "Redline Threat Snapshot v1",
      status: mode === "FIXTURE" ? "FIXTURE" : "UNKNOWN",
      retrievedAt: nowIso(),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      confidence: 0.78,
      note: "Single auditable snapshot; absence of evidence is not SAFE.",
    },
    ai: {
      status: mode === "FIXTURE" ? "FIXTURE" : "AI_UNAVAILABLE",
      modelVersion: "redline-explain-v1",
      summary: blocked
        ? "The transaction crosses a hard boundary before signing. Stop and inspect the route."
        : "Your line is doing useful work: the size is contained, the path is known, and the remaining concern is execution quality.",
      reasons: blocked
        ? ["A deterministic check is blocked.", "AI cannot override the router or network boundary."]
        : ["Position size is bounded by your preset.", "The final output and approval surface still deserve attention."],
      confidence: 0.74,
    },
    simulationHash: draft.simulationHash,
  };
}

export function createEvidence(draft, kind = "held") {
  const held = kind === "held";
  return {
    schemaVersion: "evidence.v1",
    provenance: "FIXTURE",
    source: "Redline Demo Replay",
    verificationStatus: "VERIFIED",
    retrievedAt: nowIso(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    externalChainId: 11155111,
    transactionHash: held
      ? "0x7f5a4c9c7f5a4c9c7f5a4c9c7f5a4c9c7f5a4c9c7f5a4c9c7f5a4c9c7f5a4c9c"
      : "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    router: draft.router,
    tokenIn: draft.tokenIn,
    tokenOut: draft.tokenOut,
    amountIn: held ? draft.maxInput : "1200000000000000",
    amountOut: held ? "33320629" : "29900000",
    proofReference: held ? "0xfixture-held-proof" : "0xfixture-crossed-proof",
    resultReason: held ? "All committed limits matched." : "Actual input exceeded maxInput and output missed minOutput.",
  };
}

export function evaluateVerdict(draft, evidence) {
  if (!evidence || evidence.verificationStatus !== "VERIFIED") return { status: STATUS.UNVERIFIED, reasons: ["Evidence is not verified."] };
  if (evidence.router.toLowerCase() !== draft.router.toLowerCase()) return { status: STATUS.MISMATCHED, reasons: ["Router does not match the Receipt."] };
  const crossed = BigInt(evidence.amountIn) > BigInt(draft.maxInput) || BigInt(evidence.amountOut) < BigInt(draft.minOutput);
  return crossed
    ? { status: STATUS.LINE_CROSSED, reasons: [evidence.resultReason] }
    : { status: STATUS.LINE_HELD, reasons: [evidence.resultReason] };
}

export function createLiveEvidence() {
  return {
    schemaVersion: "evidence.v1",
    provenance: "LIVE",
    source: "Coston2 FDC verified Receipt",
    verificationStatus: "ONCHAIN_LINE_HELD",
    retrievedAt: nowIso(),
    externalChainId: SEPOLIA_CHAIN_ID,
    transactionHash: LIVE_EXTERNAL_TX,
    router: DEMO_ROUTER,
    tokenIn: DEMO_TOKEN_IN,
    tokenOut: DEMO_TOKEN_OUT,
    amountIn: "1000000000000000",
    amountOut: "33320629",
    receiptId: LIVE_RECEIPT_ID,
    verdictUrl: `https://coston2-explorer.flare.network/tx/${LIVE_VERDICT_TX}`,
    externalTxUrl: `https://sepolia.etherscan.io/tx/${LIVE_EXTERNAL_TX}`,
    proofReference: "FDC round 1425147 · 3 Merkle proof nodes",
    resultReason: "Coston2 consumed the FDC proof and emitted LINE HELD.",
  };
}
