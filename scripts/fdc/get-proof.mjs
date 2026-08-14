import { proofUrl } from "./canonical-path.mjs";

const [roundId, requestBytes] = process.argv.slice(2);
if (!roundId || !requestBytes) {
  console.error("Usage: node scripts/fdc/get-proof.mjs <voting-round-id> <abi-encoded-request>");
  process.exit(1);
}

const headers = { "Content-Type": "application/json" };
const apiKey = process.env.COSTON2_DA_LAYER_API_KEY || process.env.FDC_DA_LAYER_API_KEY;
if (apiKey) headers["X-API-KEY"] = apiKey;

const timeoutMs = Number(process.env.FDC_PROOF_TIMEOUT_MS || 60_000);
const intervalMs = Number(process.env.FDC_PROOF_POLL_MS || 3_000);
const startedAt = Date.now();

while (Date.now() - startedAt <= timeoutMs) {
  const response = await fetch(proofUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({ votingRoundId: Number(roundId), requestBytes }),
  });
  const payload = await response.json();
  if (response.ok && !payload.error) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }
  if (payload.error !== "attestation request not found") {
    throw new Error(`DA Layer proof request failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

throw new Error(`FDC proof is not available after ${timeoutMs / 1000}s; keep the same round and request bytes, then retry.`);
