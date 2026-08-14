import { buildEvmTransactionRequest, prepareRequestUrl } from "./canonical-path.mjs";

const transactionHash = process.argv[2];
if (!transactionHash) {
  console.error("Usage: node scripts/fdc/prepare-request.mjs <sepolia-tx-hash>");
  process.exit(1);
}

const apiKey = process.env.FDC_VERIFIER_API_KEY || process.env.VERIFIER_API_KEY_TESTNET;
if (!apiKey) {
  console.error("Missing FDC_VERIFIER_API_KEY (or VERIFIER_API_KEY_TESTNET). Keep it in your shell/.env, never in Git.");
  process.exit(1);
}

const response = await fetch(prepareRequestUrl(), {
  method: "POST",
  headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
  body: JSON.stringify(buildEvmTransactionRequest(transactionHash)),
});
const payload = await response.json();
if (!response.ok || payload.status !== "VALID") {
  throw new Error(`FDC verifier rejected request (${response.status}): ${JSON.stringify(payload)}`);
}
console.log(JSON.stringify(payload, null, 2));
