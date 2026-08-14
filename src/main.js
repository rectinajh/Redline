import {
  CHECK_STATUS,
  COSTON2_CHAIN_ID,
  DEMO_QUOTED_OUTPUT,
  INPUT_DECIMALS,
  INPUT_SYMBOL,
  LIVE_CROSSED_RECEIPT_ID,
  LIVE_RECEIPT_ID,
  OUTPUT_DECIMALS,
  OUTPUT_SYMBOL,
  PRESETS,
  STATUS,
  createDraft,
  createLiveEvidence,
  createRiskCapsule,
  evaluateVerdict,
  runDeterministicChecks,
  shortAddress,
} from "./core.js";
import { connectInjectedWallet, publishReceipt, readReceipt } from "./chain.js";
import { FixtureAdapter, LiveFdcAdapter } from "./evidence.js";

const app = document.querySelector("#app");
const state = {
  preset: PRESETS[0],
  draft: createDraft(PRESETS[0]),
  checks: [],
  capsule: null,
  status: STATUS.DRAFT,
  evidence: null,
  verdict: null,
  wallet: { address: null, chainId: null, mode: "DEMO" },
  receiptId: null,
  receiptTx: null,
  aiBrief: null,
  aiError: null,
  activeTab: "held",
  toast: null,
};
const publicReceiptId = location.pathname.startsWith("/receipt/") ? decodeURIComponent(location.pathname.slice("/receipt/".length)) : null;

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const utf8Hex = (value) => `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
const formatBps = (bps) => `${(Number(bps) / 100).toFixed(2)}%`;
const formatTime = (seconds) => `${Math.max(0, Math.round((Number(seconds) - Date.now() / 1000) / 60))} min`;
const formatUnits = (value, decimals, symbol, precision = 6) => {
  const amount = Number(value || 0) / 10 ** decimals;
  return `${amount.toFixed(precision).replace(/\.?(0+)$/, "")} ${symbol}`;
};
const formatInput = (value) => formatUnits(value, INPUT_DECIMALS, INPUT_SYMBOL);
const formatOutput = (value) => formatUnits(value, OUTPUT_DECIMALS, OUTPUT_SYMBOL);

function showToast(message, tone = "neutral") {
  state.toast = { message, tone };
  render();
  window.setTimeout(() => {
    state.toast = null;
    render();
  }, 3200);
}

function syncRisk() {
  state.checks = runDeterministicChecks(state.draft);
  state.capsule = createRiskCapsule(state.draft, state.checks, "LOCAL");
  state.aiBrief = null;
  state.aiError = null;
}

async function requestRiskBrief() {
  state.aiError = null;
  showToast("Requesting a live evidence explanation…", "info");
  try {
    const response = await fetch("/api/risk-brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: state.draft.reason,
        receipt: state.draft,
        deterministicChecks: state.checks,
        verifiedFacts: state.evidence,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "AI explanation unavailable");
    state.aiBrief = payload;
    state.capsule = { ...state.capsule, ai: payload };
    showToast("Live AI explanation received · facts remain authoritative", "success");
  } catch (error) {
    state.aiError = error?.message || "AI explanation unavailable";
    showToast(`AI unavailable · deterministic checks remain authoritative`, "warning");
  }
  render();
}

function selectPreset(id) {
  state.preset = PRESETS.find((preset) => preset.id === id) || PRESETS[0];
  state.draft = createDraft(state.preset);
  if (state.wallet.address) state.draft.trader = state.wallet.address;
  state.status = STATUS.DRAFT;
  state.evidence = null;
  state.verdict = null;
  state.receiptId = null;
  state.receiptTx = null;
  state.aiBrief = null;
  state.aiError = null;
  syncRisk();
  render();
}

async function connectWallet() {
  try {
    const { address, chainId } = await connectInjectedWallet();
    state.wallet = { address, chainId, mode: "WALLET" };
    state.draft.trader = address;
    showToast(`Wallet connected · ${shortAddress(address)} · Coston2`, "success");
    syncRisk();
    render();
  } catch (error) {
    showToast(`Wallet connection failed · ${error?.message || "user rejected"}`, "danger");
  }
}

async function publishOnchainReceipt() {
  if (state.checks.some((check) => check.status === CHECK_STATUS.BLOCKED)) {
    showToast("A deterministic check is blocked. Fix the line before publishing.", "danger");
    return;
  }
  if (state.wallet.mode !== "WALLET" || !state.wallet.address) {
    showToast("Connect a real Coston2 wallet to publish this Receipt", "warning");
    return;
  }
  state.status = STATUS.PUBLISHING;
  render();
  try {
    const result = await publishReceipt(state.draft, state.wallet.address);
    state.receiptId = result.receiptId;
    state.receiptTx = result.transactionHash;
    state.status = STATUS.ONCHAIN_PUBLISHED;
    showToast("Redline published on Coston2 · wallet remains in control", "success");
  } catch (error) {
    state.status = STATUS.DRAFT;
    showToast(`Receipt publish failed · ${error?.message || "wallet rejected"}`, "danger");
  }
  render();
}

function replay(kind) {
  state.activeTab = kind;
  state.status = STATUS.TRADE_SUBMITTED;
  state.evidence = null;
  state.verdict = null;
  render();
  window.setTimeout(() => {
    state.status = STATUS.PROOF_REQUESTED;
    render();
  }, 360);
  window.setTimeout(() => {
    state.status = STATUS.PROOF_FINALIZED;
    render();
  }, 760);
  window.setTimeout(async () => {
    state.status = STATUS.VERIFIED;
    state.evidence = await new FixtureAdapter(kind).getEvidence(state.draft);
    state.verdict = evaluateVerdict(state.draft, state.evidence);
    state.status = state.verdict.status;
    render();
  }, 1160);
}

function showLiveReceipt(kind = "held") {
  const isCrossed = kind === "crossed";
  state.activeTab = isCrossed ? "live-crossed" : "live";
  state.status = STATUS.PROOF_FINALIZED;
  const receiptId = isCrossed ? LIVE_CROSSED_RECEIPT_ID : LIVE_RECEIPT_ID;
  new LiveFdcAdapter({ receiptId }).getEvidence(state.draft).then((evidence) => {
    state.evidence = evidence;
    state.verdict = evaluateVerdict(state.draft, evidence);
    state.status = state.verdict.status;
    render();
    requestRiskBrief();
  }).catch((error) => {
    state.status = STATUS.UNVERIFIED;
    showToast(`Coston2 Receipt read failed · ${error?.message || "try again"}`, "danger");
  });
  render();
}

function updateField(field, value) {
  if (field === "maxPositionBps") state.draft[field] = Number(value);
  else state.draft[field] = value;
  syncRisk();
  state.status = STATUS.DRAFT;
  state.verdict = null;
  render();
}

function checkRow(check) {
  const tone = check.status.toLowerCase();
  return `<div class="check-row"><span class="check-dot ${tone}"></span><span class="check-name">${escapeHtml(check.label)}</span><span class="check-detail">${escapeHtml(check.detail)}</span><span class="check-status ${tone}">${escapeHtml(check.status)}</span></div>`;
}

function renderPresets() {
  return PRESETS.map((preset) => `<button class="preset ${state.preset.id === preset.id ? "selected" : ""}" data-preset="${preset.id}">
    <span class="preset-top"><span class="preset-eyebrow">${preset.eyebrow}</span><span class="preset-badge">${preset.badge}</span></span>
    <strong>${preset.label}</strong><span>${preset.description}</span>
  </button>`).join("");
}

function renderStatusLine() {
  const stages = ["DRAFT", "ONCHAIN_PUBLISHED", "TRADE_SUBMITTED", "PROOF_REQUESTED", "VERIFIED"];
  const currentIndex = state.status === STATUS.LINE_HELD || state.status === STATUS.LINE_CROSSED ? 4 : Math.max(0, stages.indexOf(state.status));
  return stages.map((stage, index) => `<div class="status-stage ${index <= currentIndex ? "done" : ""} ${stage === state.status ? "current" : ""}"><span>${index + 1}</span><small>${stage.replaceAll("_", " ")}</small></div>`).join("<i></i>");
}

function renderRiskBrief() {
  if (!state.capsule) return "";
  const capsule = state.capsule;
  const ai = state.aiBrief || capsule.ai;
  const aiLive = ai?.status === "LIVE";
  const score = aiLive && Number.isFinite(Number(ai.score)) ? Number(ai.score) : capsule.score;
  const riskLevel = aiLive && ai.riskLevel ? ai.riskLevel : capsule.riskLevel;
  const scoreSource = aiLive ? "AI SCORE" : "LOCAL FALLBACK";
  const levelClass = `level-${String(riskLevel).toLowerCase()}`;
  return `<section class="panel risk-panel" id="risk-panel">
    <div class="panel-heading"><div><span class="section-kicker">02 · SEE THE RISK</span><h2>Risk Capsule</h2></div><div class="risk-score ${levelClass}"><span>${score}</span><small>/ 100</small><b>${escapeHtml(riskLevel)}</b><small>${scoreSource}</small></div></div>
    <div class="risk-summary"><div class="signal-ring ${levelClass}"><span>${score}</span></div><div><strong>${escapeHtml(ai.summary)}</strong><p>${(ai.reasons || []).map(escapeHtml).join(" · ") || "No model explanation is available yet."}</p>${ai.action ? `<p class="ai-action">${escapeHtml(ai.action)}</p>` : ""}</div><span class="source-pill ${aiLive ? "live" : "fixture"}">AI BRIEF · ${escapeHtml(ai.status)}</span></div>
    <div class="checks">${capsule.deterministicChecks.map(checkRow).join("")}</div>
    <div class="intel-strip"><span class="source-pill fixture">THREAT SIGNALS · ${capsule.threatIntel.status}</span><span>${escapeHtml(capsule.threatIntel.source)}</span><span>fresh for 5 min</span>${ai.unknowns?.length ? `<span>unknowns ${ai.unknowns.length}</span>` : ""}</div>
    <div class="security-note"><span>◈</span><p><strong>Safety boundary</strong> AI scores and explains the risk. Deterministic checks can block. Only verified FDC facts create the final verdict.</p></div>
  </section>`;
}

function renderEvidence() {
  if (!state.evidence) return `<div class="empty-proof"><span class="empty-icon">↗</span><div><strong>Flare is waiting for a transaction</strong><p>Open LIVE FDC to read the deployed Coston2 Receipt, or use a clearly labeled replay.</p></div></div>`;
  const evidence = state.evidence;
  const verdict = state.verdict;
  const isHeld = verdict?.status === STATUS.LINE_HELD;
  const isCrossed = verdict?.status === STATUS.LINE_CROSSED;
  return `<div class="proof-result ${isHeld ? "held" : isCrossed ? "crossed" : "unknown"}">
    <div class="proof-verdict"><span class="verdict-mark">${isHeld ? "✓" : isCrossed ? "×" : "?"}</span><div><span class="section-kicker">FINAL FACT JUDGE · ${escapeHtml(evidence.provenance)}</span><h3>${escapeHtml(verdict?.status || STATUS.UNVERIFIED).replaceAll("_", " ")}</h3><p>${escapeHtml(verdict?.reasons?.[0] || evidence.reason || "Awaiting verification")}</p></div></div>
    <div class="proof-grid"><div><small>PROOF SOURCE</small><strong>${escapeHtml(evidence.source)}</strong></div><div><small>EXTERNAL TX</small><strong class="mono">${evidence.externalTxUrl ? `<a href="${evidence.externalTxUrl}" target="_blank" rel="noreferrer">${escapeHtml(evidence.transactionHash).slice(0, 18)}…</a>` : `${escapeHtml(evidence.transactionHash || "—").slice(0, 18)}…`}</strong></div><div><small>AMOUNT IN</small><strong>${formatInput(evidence.amountIn)}</strong></div><div><small>AMOUNT OUT</small><strong>${formatOutput(evidence.amountOut)}</strong></div></div>
    <div class="provenance-line"><span class="source-pill ${evidence.provenance.toLowerCase()}">${escapeHtml(evidence.provenance)}</span><span>${escapeHtml(evidence.verificationStatus)}</span><span class="mono">proof: ${escapeHtml(evidence.proofReference || "pending")}</span>${evidence.verdictUrl ? `<a href="${evidence.verdictUrl}" target="_blank" rel="noreferrer">View Coston2 verdict ↗</a>` : ""}</div>
  </div>`;
}

function renderAccountability() {
  if (!state.verdict || !state.evidence) return "";
  const evidence = state.evidence;
  const committedMaxInput = evidence.committedMaxInput || state.draft.maxInput;
  const openButton = state.receiptId ? `<button class="text-button" data-action="open-receipt">Open receipt ↗</button>` : "";
  return `<section class="panel accountability"><div class="panel-heading"><div><span class="section-kicker">06 · KEEP THE RECORD</span><h2>Accountability Card</h2></div>${openButton}</div>
    <div class="comparison"><div><small>YOUR LINE</small><strong>Max input</strong><span>${formatInput(committedMaxInput)}</span></div><div class="comparison-arrow">→</div><div><small>VERIFIED FACT</small><strong>Actual input</strong><span>${formatInput(evidence.amountIn)}</span></div><div class="comparison-result ${state.verdict.status === STATUS.LINE_HELD ? "good" : "bad"}">${state.verdict.status === STATUS.LINE_HELD ? "MATCH" : "CROSSED"}</div></div>
    <div class="receipt-meta"><span><b>Receipt</b> ${escapeHtml((evidence.receiptId || state.draft.nonce).slice(0, 18))}…</span><span><b>Network</b> Coston2 · 114</span><span><b>Source</b> ${escapeHtml(evidence.provenance)}</span></div>
  </section>`;
}

function renderPublishedReceipt() {
  if (!state.receiptId || !state.receiptTx) return "";
  return `<div class="onchain-proof"><span class="source-pill live">ONCHAIN COMMITMENT</span><span>Receipt ${escapeHtml(state.receiptId.slice(0, 18))}… is published on Coston2.</span><a href="https://coston2-explorer.flare.network/tx/${encodeURIComponent(state.receiptTx)}" target="_blank" rel="noreferrer">View transaction ↗</a><button class="text-button" data-action="open-receipt">Open receipt ↗</button></div>`;
}

function renderPublicReceipt(receiptId, onchain, evidence) {
  const receipt = onchain.receipt || {};
  const status = onchain.status || "UNKNOWN";
  const isHeld = status === "LINE_HELD";
  const isCrossed = status === "LINE_CROSSED";
  const hasVerdict = isHeld || isCrossed;
  const mark = isHeld ? "✓" : isCrossed ? "×" : "?";
  const title = isHeld ? "held." : isCrossed ? "crossed." : status.toLowerCase() + ".";
  const kicker = hasVerdict ? `ON-CHAIN VERDICT · ${status.replace("_", " ")}` : `ON-CHAIN STATUS · ${status.replace("_", " ")}`;
  const intro = hasVerdict
    ? "A wallet-free view of the committed line and the FDC-verified facts behind the verdict."
    : "A wallet-free view of the committed line. Verified facts appear once FDC finalizes.";
  const statusText = hasVerdict
    ? evidence.resultReason
    : status === "DRAFT"
      ? "This Receipt is published and waiting for an FDC-verified verdict."
      : status === "EXPIRED"
        ? "This Receipt expired before an FDC verdict was consumed."
        : status === "MISMATCHED"
          ? "Verified facts did not match the committed trader, chain, router, or assets."
          : "This Receipt has not been verified.";
  const comparison = hasVerdict
    ? `<section class="public-card commitments"><div class="section-kicker">COMMITMENTS VS FACTS</div><div class="public-row"><span>Max input</span><b>${formatInput(receipt.maxInput)}</b><i>Actual ${formatInput(evidence.amountIn)} · ${isCrossed ? "CROSSED" : "MATCH"}</i></div><div class="public-row"><span>Minimum output</span><b>${formatOutput(receipt.minOutput)}</b><i>Actual ${formatOutput(evidence.amountOut)} · ${isCrossed ? "CROSSED" : "MATCH"}</i></div><div class="public-row"><span>Router</span><b class="mono">${escapeHtml((receipt.router || "").slice(0, 12))}…</b><i>${isCrossed ? "CROSSED" : "MATCH"}</i></div></section>`
    : `<section class="public-card commitments"><div class="section-kicker">COMMITTED LIMITS</div><div class="public-row"><span>Max input</span><b>${formatInput(receipt.maxInput)}</b><i>committed</i></div><div class="public-row"><span>Minimum output</span><b>${formatOutput(receipt.minOutput)}</b><i>committed</i></div></section>`;
  const externalLinks = [
    evidence.verdictUrl ? `<a class="primary-button" href="${evidence.verdictUrl}" target="_blank" rel="noreferrer">View Coston2 verdict ↗</a>` : "",
    evidence.externalTxUrl ? `<a class="primary-button" href="${evidence.externalTxUrl}" target="_blank" rel="noreferrer">View verified transaction ↗</a>` : "",
  ].join("");
  return `<div class="public-shell"><header class="topbar"><a class="brand" href="/"><span class="brand-mark">/</span><span>REDLINE<em>RECEIPT</em></span></a><span class="source-pill ${hasVerdict ? "live" : "unverified"}">PUBLIC RECEIPT · ${hasVerdict ? "LIVE" : "ONCHAIN"}</span></header><main class="public-main"><div class="public-kicker">READ-ONLY VERIFICATION</div><h1>Receipt <i>${title}</i></h1><p class="public-intro">${intro}</p><section class="public-verdict"><div class="verdict-mark">${mark}</div><div><span class="section-kicker">${kicker}</span><h2>${status.replaceAll("_", " ")}</h2><p>${escapeHtml(statusText)}</p></div></section><section class="public-grid"><div class="public-card"><small>RECEIPT ID</small><strong class="mono">${escapeHtml(receiptId.slice(0, 24))}…</strong><span>Immutable Coston2 receipt</span></div><div class="public-card"><small>NETWORK</small><strong>Coston2 · 114</strong><span>Flare network</span></div><div class="public-card"><small>PROOF SOURCE</small><strong>${escapeHtml(evidence.source)}</strong><span>${escapeHtml(evidence.verificationStatus)}</span></div><div class="public-card"><small>EXPIRY</small><strong>${formatTime(receipt.expiry)}</strong><span>${Number(receipt.expiry) > Date.now() / 1000 ? "still open" : "past expiry"}</span></div></section>${comparison}<section class="public-warning"><strong>What this page proves</strong><p>The final verdict is produced only by the Coston2 contract after consuming a verified FDC proof. This page reads that on-chain state and never claims an unverified result as a safety outcome.</p></section>${externalLinks}<a class="primary-button" href="/">Create your own Receipt <span>↗</span></a></main><footer class="footer"><span>REDLINE RECEIPT · Public Receipt</span><a href="https://dev.flare.network/fdc/overview" target="_blank" rel="noreferrer">Verify FDC integration ↗</a></footer></div>`;
}

async function loadPublicReceipt(receiptId) {
  const showError = (message) => {
    app.innerHTML = `<div class="public-shell"><header class="topbar"><a class="brand" href="/"><span class="brand-mark">/</span><span>REDLINE<em>RECEIPT</em></span></a><span class="source-pill unverified">PUBLIC RECEIPT · UNAVAILABLE</span></header><main class="public-main"><div class="public-kicker">READ-ONLY VERIFICATION</div><h1>Receipt <i>unavailable.</i></h1><p class="public-intro">${escapeHtml(message)}</p><a class="primary-button" href="/">Create your own Receipt <span>↗</span></a></main></div>`;
  };
  try {
    const onchain = await readReceipt(receiptId);
    if (!onchain.receipt) {
      showError("No Receipt exists on Coston2 for this identifier.");
      return;
    }
    const evidence = createLiveEvidence({ receiptId, onchain });
    app.innerHTML = renderPublicReceipt(receiptId, onchain, evidence);
  } catch (error) {
    showError(`Could not load this Receipt · ${error?.message || "try again"}`);
  }
}

function render() {
  const walletLabel = state.wallet.address ? shortAddress(state.wallet.address) : "Connect wallet";
  const verdictClass = state.verdict?.status === STATUS.LINE_HELD ? "held" : state.verdict?.status === STATUS.LINE_CROSSED ? "crossed" : "";
  app.innerHTML = `<div class="shell">
    <header class="topbar"><a class="brand" href="/"><span class="brand-mark">/</span><span>REDLINE<em>RECEIPT</em></span></a><div class="top-actions"><span class="network"><i></i> COSTON2 · 114</span><button class="wallet-button" data-action="connect">${walletLabel}<span>↗</span></button></div></header>
    <main>
      <section class="hero"><div class="hero-copy"><span class="hero-kicker">FLARE SUMMER SIGNAL · BOUNTY 1</span><h1>Don’t trade<br /><i>past your line.</i></h1><p>Redline makes your own trading limits explicit before you sign — then lets Flare verify whether you kept them.</p><div class="hero-actions"><a class="primary-button" href="#flow">Draw your line <span>↓</span></a><span class="hero-caption"><span class="pulse"></span> AI explains · Flare verifies</span></div></div><div class="hero-art"><div class="crosshair"><span></span><b>REDLINE</b></div><div class="floating-note note-one"><span>01</span> set your limit</div><div class="floating-note note-two"><span>02</span> let the chain judge</div></div></section>
      <section class="principles"><div><span>01</span><strong>SELF-AUTHORED</strong><p>Your rule, not a bot’s.</p></div><div><span>02</span><strong>EXPLAINABLE</strong><p>Every warning has a reason.</p></div><div><span>03</span><strong>VERIFIABLE</strong><p>Facts land on Flare.</p></div></section>
      <section id="flow" class="flow-wrap"><div class="flow-header"><div><span class="section-kicker">THE DECISION LOOP</span><h2>Draw the line.<br /><span>Make the trade.</span></h2></div><div class="flow-status"><span class="live-dot"></span> SESSION ${state.status.replaceAll("_", " ")}</div></div><div class="status-line">${renderStatusLine()}</div>
        <section class="panel line-panel"><div class="panel-heading"><div><span class="section-kicker">01 · DRAW THE LINE</span><h2>What are you willing to risk?</h2></div><span class="source-pill">USER AUTHORED</span></div><div class="preset-grid">${renderPresets()}</div><div class="limits-grid"><label>MAX POSITION <span>your wallet %</span><input data-field="maxPositionBps" type="range" min="25" max="500" step="25" value="${state.draft.maxPositionBps}" /><output>${formatBps(state.draft.maxPositionBps)}</output></label><label>MINIMUM OUTPUT <span>vs 33.320629 USDC quote</span><input data-field="minOutputBps" type="range" min="9500" max="9950" step="50" value="${state.preset.minOutputBps}" /><output>${formatOutput(state.draft.minOutput)}</output></label><label>RECEIPT EXPIRES <span>time to decide</span><select data-field="expiryMinutes"><option value="5">in 5 minutes</option><option value="10" selected>in 10 minutes</option><option value="15">in 15 minutes</option></select><output>${formatTime(state.draft.expiry)}</output></label></div><label class="reason-field">WHY THIS TRADE? <span>trade rationale · shared with the AI brief</span><textarea data-field="reason" maxlength="140">${escapeHtml(state.draft.reason)}</textarea></label><div class="line-footer"><div class="commitment"><span class="lock">⌁</span><span><b>Your rule becomes a commitment.</b><small>hashed into Receipt v1 · nonce ${state.draft.nonce.slice(0, 10)}…</small></span></div><button class="secondary-button" data-action="refresh-risk">Refresh risk brief <span>↻</span></button></div></section>
        ${renderRiskBrief()}
        <section class="panel sign-panel"><div class="panel-heading"><div><span class="section-kicker">03 · PUBLISH THE LINE</span><h2>Put your boundary on Flare.</h2></div><span class="source-pill">COSTON2 WRITE</span></div><div class="sign-copy"><div class="sign-quote">“I know what would make this trade a bad idea — and I’m choosing this line anyway.”</div><div class="sign-details"><span><b>MAX INPUT</b>${formatInput(state.draft.maxInput)}</span><span><b>MIN OUTPUT</b>${formatOutput(state.draft.minOutput)}</span><span><b>EXPIRES</b>${formatTime(state.draft.expiry)}</span></div></div><div class="sign-footer"><p>Redline cannot sign or execute the swap.<br /><strong>Your wallet publishes the commitment on Coston2.</strong></p><button class="primary-button" data-action="publish" ${state.status === STATUS.PUBLISHING ? "disabled" : ""}>${state.status === STATUS.ONCHAIN_PUBLISHED ? "Redline published ✓" : state.status === STATUS.PUBLISHING ? "Publishing…" : "Publish Redline on Coston2"} <span>↗</span></button></div>${renderPublishedReceipt()}</section>
        <section class="panel proof-panel"><div class="panel-heading"><div><span class="section-kicker">04 · LET FLARE JUDGE</span><h2>Proof, not vibes.</h2></div><div class="proof-tabs"><button class="${state.activeTab === "held" ? "active" : ""}" data-replay="held">HELD</button><button class="${state.activeTab === "crossed" ? "active" : ""}" data-replay="crossed">CROSSED</button><button class="${state.activeTab === "live" ? "active" : ""}" data-action="live">LIVE FDC</button><button class="${state.activeTab === "live-crossed" ? "active" : ""}" data-action="live-crossed">LIVE CROSSED</button></div></div>${renderEvidence()}<div class="proof-actions"><button class="secondary-button" data-replay="held">Replay held line <span>↗</span></button><button class="danger-button" data-replay="crossed">Replay crossed line <span>↗</span></button></div></section>
        ${renderAccountability()}
      </section>
    </main>
    <footer class="footer"><span>REDLINE RECEIPT · Coston2 prototype</span><span>AI explains. Flare verifies. You decide.</span><a href="https://dev.flare.network/fdc/overview" target="_blank" rel="noreferrer">FDC docs ↗</a></footer>
    ${state.toast ? `<div class="toast ${state.toast.tone}">${escapeHtml(state.toast.message)}</div>` : ""}
  </div>`;
}

app.addEventListener("click", (event) => {
  const preset = event.target.closest("[data-preset]");
  if (preset) return selectPreset(preset.dataset.preset);
  const replayButton = event.target.closest("[data-replay]");
  if (replayButton) return replay(replayButton.dataset.replay);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "connect") return connectWallet();
  if (action === "publish") return publishOnchainReceipt();
  if (action === "live") return showLiveReceipt();
  if (action === "live-crossed") return showLiveReceipt("crossed");
  if (action === "refresh-risk") { syncRisk(); requestRiskBrief(); return; }
  if (action === "open-receipt") {
    if (!state.receiptId) {
      showToast("Only published receipts can be opened", "warning");
      return;
    }
    window.open(`${location.origin}/receipt/${encodeURIComponent(state.receiptId)}`, "_blank", "noopener,noreferrer");
    return;
  }
});

app.addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  if (!field) return;
  if (field === "maxPositionBps") updateField(field, event.target.value);
  if (field === "reason") updateField(field, event.target.value);
});

app.addEventListener("change", (event) => {
  const field = event.target.dataset.field;
  if (field === "minOutputBps") {
    state.preset = { ...state.preset, minOutputBps: Number(event.target.value) };
    state.draft.minOutput = String(Math.floor(DEMO_QUOTED_OUTPUT * Number(event.target.value) / 10_000));
    syncRisk();
    render();
  }
  if (field === "expiryMinutes") {
    state.draft.expiry = Math.floor(Date.now() / 1000) + Number(event.target.value) * 60;
    render();
  }
});

if (publicReceiptId) {
  loadPublicReceipt(publicReceiptId);
} else {
  syncRisk();
  render();
}
