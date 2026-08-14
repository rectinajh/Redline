import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const proofFile = process.argv[2];
if (!proofFile) {
  console.error("Usage: node scripts/fdc/pack-proof.mjs <proof-json-file|->");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(proofFile === "-" ? 0 : proofFile, "utf8"));
if (!Array.isArray(payload.proof) || typeof payload.response_hex !== "string") {
  throw new Error("Expected DA Layer raw response with proof[] and response_hex");
}

const proofNodes = `[${payload.proof.join(",")}]`;
const packed = execFileSync(
  "cast",
  ["abi-encode", "f(bytes32[],bytes)", proofNodes, payload.response_hex],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
).trim();

console.log(packed);
