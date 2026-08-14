import { execFileSync } from "node:child_process";

const rpcUrl = process.env.COSTON2_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Missing DEPLOYER_PRIVATE_KEY or PRIVATE_KEY in .env");

const registryAddress = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
const defaults = {
  externalChainId: "11155111",
  router: "0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468",
  tokenIn: "0x0000000000000000000000000000000000000000",
  tokenOut: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

function address(value, name) {
  if (!/^0x[\da-fA-F]{40}$/.test(value || "")) throw new Error(`${name} must be a 20-byte address`);
  return value;
}

function run(command, args) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function resolveContract(name) {
  return run("cast", [
    "call",
    registryAddress,
    "getContractAddressByName(string)(address)",
    name,
    "--rpc-url",
    rpcUrl,
  ]);
}

function deploy(contract, constructorArgs) {
  const output = run("forge", [
    "create",
    "--broadcast",
    "--rpc-url",
    rpcUrl,
    "--private-key",
    privateKey,
    contract,
    "--constructor-args",
    ...constructorArgs,
  ]);
  const deployed = output.match(/Deployed to:\s*(0x[\da-fA-F]{40})/i)?.[1];
  const transactionHash = output.match(/Transaction hash:\s*(0x[\da-fA-F]{64})/i)?.[1];
  if (!deployed || !transactionHash) throw new Error(`Could not parse forge deployment output:\n${output}`);
  return { address: deployed, transactionHash };
}

const fdcVerification = address(
  process.env.COSTON2_FDC_VERIFICATION || resolveContract("FdcVerification"),
  "COSTON2_FDC_VERIFICATION",
);
const router = address(process.env.REDLINE_ROUTER || defaults.router, "REDLINE_ROUTER");
const tokenIn = address(process.env.REDLINE_TOKEN_IN || defaults.tokenIn, "REDLINE_TOKEN_IN");
const tokenOut = address(process.env.REDLINE_TOKEN_OUT || defaults.tokenOut, "REDLINE_TOKEN_OUT");
const externalChainId = process.env.REDLINE_EXTERNAL_CHAIN_ID || defaults.externalChainId;

console.log("Deploying FDC adapter to Coston2...");
const adapter = deploy("contracts/FdcEvmTransactionVerifier.sol:FdcEvmTransactionVerifier", [fdcVerification]);
console.log("Deploying Redline Receipt to Coston2...");
const receipt = deploy("contracts/RedlineReceipt.sol:RedlineReceipt", [
  externalChainId,
  adapter.address,
  router,
  tokenIn,
  tokenOut,
]);

console.log(JSON.stringify({
  network: "Coston2",
  chainId: 114,
  externalSource: "Sepolia",
  externalChainId: Number(externalChainId),
  fdcVerification,
  fdcEvmTransactionVerifier: adapter,
  redlineReceipt: receipt,
  router,
  tokenIn,
  tokenOut,
  explorer: "https://coston2-explorer.flare.network",
}, null, 2));
