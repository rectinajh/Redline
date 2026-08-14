import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const receiptAddress = process.argv[2];
if (!/^0x[\da-fA-F]{40}$/.test(receiptAddress || "")) {
  console.error("Usage: node scripts/receipt/submit-receipt.mjs <redline-receipt-address> [expiry-unix]");
  process.exit(1);
}

const rpcUrl = process.env.COSTON2_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
const privateKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
if (!privateKey) throw new Error("Missing PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env");

const router = process.env.REDLINE_ROUTER || "0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468";
const tokenIn = process.env.REDLINE_TOKEN_IN || "0x0000000000000000000000000000000000000000";
const tokenOut = process.env.REDLINE_TOKEN_OUT || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const externalChainId = process.env.REDLINE_EXTERNAL_CHAIN_ID || "11155111";
const expiry = process.argv[3] || String(Math.floor(Date.now() / 1000) + 30 * 60);
const maxInput = process.env.REDLINE_MAX_INPUT || "1000000000000000"; // 0.001 Sepolia ETH
const minOutput = process.env.REDLINE_MIN_OUTPUT || "30000000"; // 30 Sepolia USDC (6 decimals)
const maxPositionBps = process.env.REDLINE_MAX_POSITION_BPS || "100";

const runCast = (args, json = false) => {
  const output = execFileSync("cast", args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return json ? JSON.parse(output) : output;
};
const bytes32 = () => `0x${randomBytes(32).toString("hex")}`;
const trader = runCast(["wallet", "address", "--private-key", privateKey]);
const draft = {
  trader,
  chainId: externalChainId,
  router,
  tokenIn,
  tokenOut,
  maxInput,
  minOutput,
  maxPositionBps,
  expiry,
  simulationHash: bytes32(),
  riskAssessmentHash: bytes32(),
  threatIntelSnapshotHash: bytes32(),
  nonce: BigInt(`0x${randomBytes(16).toString("hex")}`).toString(),
};
const tuple = `(${Object.values(draft).join(",")})`;
const sent = runCast([
  "send",
  receiptAddress,
  "submitReceipt((address,uint256,address,address,address,uint256,uint256,uint256,uint64,bytes32,bytes32,bytes32,uint256))",
  tuple,
  "--rpc-url",
  rpcUrl,
  "--private-key",
  privateKey,
  "--json",
], true);
const transactionHash = sent.transactionHash || sent.hash;
if (!transactionHash) throw new Error(`cast send returned no transaction hash: ${JSON.stringify(sent)}`);
const receipt = runCast(["receipt", transactionHash, "--rpc-url", rpcUrl, "--json"], true);
const created = receipt.logs.find((log) => log.address.toLowerCase() === receiptAddress.toLowerCase());
const receiptId = created?.topics?.[1];
if (!receiptId) throw new Error(`ReceiptCreated event missing from ${transactionHash}`);

console.log(JSON.stringify({
  receiptId,
  transactionHash,
  contract: receiptAddress,
  draft,
  explorer: `https://coston2-explorer.flare.network/tx/${transactionHash}`,
}, null, 2));
