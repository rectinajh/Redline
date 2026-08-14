import { execFileSync } from "node:child_process";

const requestBytes = process.argv[2];
if (!requestBytes || !/^0x[0-9a-fA-F]+$/.test(requestBytes)) {
  console.error("Usage: node scripts/fdc/submit-request.mjs <abi-encoded-request>");
  process.exit(1);
}

const rpcUrl = process.env.COSTON2_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
const privateKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
if (!privateKey) {
  console.error("Missing PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env.");
  process.exit(1);
}

const registryAddress = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

function cast(args, { json = false } = {}) {
  const output = execFileSync("cast", args, {
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!json) return output;
  return JSON.parse(output);
}

const common = ["--rpc-url", rpcUrl];
const fdcHub = cast([
  "call",
  registryAddress,
  "getContractAddressByName(string)(address)",
  "FdcHub",
  ...common,
]);
const flareSystemsManager = cast([
  "call",
  registryAddress,
  "getContractAddressByName(string)(address)",
  "FlareSystemsManager",
  ...common,
]);
const feeConfig = cast([
  "call",
  fdcHub,
  "fdcRequestFeeConfigurations()(address)",
  ...common,
]);
const fee = process.env.FDC_REQUEST_FEE || cast([
  "call",
  feeConfig,
  "getRequestFee(bytes)(uint256)",
  requestBytes,
  ...common,
]);

console.log(`FDC Hub: ${fdcHub}`);
console.log(`Request fee: ${fee} wei`);
console.log("Submitting request to Coston2...");

const sent = cast([
  "send",
  fdcHub,
  "requestAttestation(bytes)",
  requestBytes,
  "--value",
  fee,
  ...common,
  "--private-key",
  privateKey,
  "--json",
], { json: true });

const txHash = sent.transactionHash || sent.hash;
if (!txHash) throw new Error(`cast send returned no transaction hash: ${JSON.stringify(sent)}`);

const receipt = cast(["receipt", txHash, ...common, "--json"], { json: true });
const blockNumber = Number(BigInt(receipt.blockNumber));
const block = cast(["block", String(blockNumber), ...common, "--json"], { json: true });
const timestamp = Number(BigInt(block.timestamp));
const firstVotingRoundStartTs = Number(BigInt(cast([
  "call",
  flareSystemsManager,
  "firstVotingRoundStartTs()(uint256)",
  ...common,
])));
const votingEpochDurationSeconds = Number(BigInt(cast([
  "call",
  flareSystemsManager,
  "votingEpochDurationSeconds()(uint256)",
  ...common,
])));
const votingRoundId = Math.floor(
  (timestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds,
);

console.log(JSON.stringify({
  transactionHash: txHash,
  fdcHub,
  flareSystemsManager,
  blockNumber,
  timestamp,
  firstVotingRoundStartTs,
  votingEpochDurationSeconds,
  votingRoundId,
  systemsExplorer: `https://coston2-systems-explorer.flare.network/voting-round/${votingRoundId}?tab=fdc`,
}, null, 2));
