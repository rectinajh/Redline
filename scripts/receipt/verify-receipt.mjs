import { execFileSync } from "node:child_process";

const [receiptAddress, receiptId, packedProof] = process.argv.slice(2);
if (!/^0x[\da-fA-F]{40}$/.test(receiptAddress || "") || !/^0x[\da-fA-F]{64}$/.test(receiptId || "") || !/^0x[\da-fA-F]+$/.test(packedProof || "")) {
  console.error("Usage: node scripts/receipt/verify-receipt.mjs <redline-receipt-address> <receipt-id> <packed-proof>");
  process.exit(1);
}

const rpcUrl = process.env.COSTON2_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
const privateKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
if (!privateKey) throw new Error("Missing PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env");

const statuses = ["NONE", "DRAFT", "VERIFIED", "LINE_HELD", "LINE_CROSSED", "EXPIRED", "MISMATCHED", "REPLAYED"];
const runCast = (args, json = false) => {
  const output = execFileSync("cast", args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return json ? JSON.parse(output) : output;
};

const sent = runCast([
  "send",
  receiptAddress,
  "verifyReceipt(bytes32,bytes)",
  receiptId,
  packedProof,
  "--rpc-url",
  rpcUrl,
  "--private-key",
  privateKey,
  "--json",
], true);
const transactionHash = sent.transactionHash || sent.hash;
if (!transactionHash) throw new Error(`cast send returned no transaction hash: ${JSON.stringify(sent)}`);
const receipt = runCast(["receipt", transactionHash, "--rpc-url", rpcUrl, "--json"], true);
const verdictLog = receipt.logs.find((log) => log.address.toLowerCase() === receiptAddress.toLowerCase() && log.topics?.[1]?.toLowerCase() === receiptId.toLowerCase());
const statusCode = verdictLog ? Number(BigInt(verdictLog.data)) : null;

console.log(JSON.stringify({
  receiptId,
  transactionHash,
  statusCode,
  status: statusCode === null ? "UNKNOWN" : statuses[statusCode] || "UNKNOWN",
  explorer: `https://coston2-explorer.flare.network/tx/${transactionHash}`,
}, null, 2));
