import {
  COSTON2_CHAIN_ID,
  COSTON2_RPC_URL,
  REDLINE_RECEIPT_CONTRACT,
} from "./core.js";

const SUBMIT_RECEIPT_SELECTOR = "0x6c6b167b";
const RECEIPT_CREATED_TOPIC = "0x17ea72da05138581d0f7110c3b234f5fdc2ef9a3378cc9b97b7d4f6c4f767ee8";
const STATUS_OF_SELECTOR = "0xc7df14e2";
const GET_RECEIPT_SELECTOR = "0xfcecbb61";
const RECEIPT_STATUS = [
  "NONE",
  "DRAFT",
  "VERIFIED",
  "LINE_HELD",
  "LINE_CROSSED",
  "EXPIRED",
  "MISMATCHED",
  "REPLAYED",
];

const stripHex = (value) => String(value).replace(/^0x/, "");
const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const addressWord = (value) => {
  if (!/^0x[\da-fA-F]{40}$/.test(value || "")) throw new Error("Invalid wallet or contract address");
  return stripHex(value).toLowerCase().padStart(64, "0");
};
const bytes32Word = (value) => {
  if (!/^0x[\da-fA-F]{64}$/.test(value || "")) throw new Error("Invalid Receipt hash");
  return stripHex(value).toLowerCase();
};

export function encodeSubmitReceipt(receipt) {
  const values = [
    addressWord(receipt.trader),
    word(receipt.chainId),
    addressWord(receipt.router),
    addressWord(receipt.tokenIn),
    addressWord(receipt.tokenOut),
    word(receipt.maxInput),
    word(receipt.minOutput),
    word(receipt.maxPositionBps),
    word(receipt.expiry),
    bytes32Word(receipt.simulationHash),
    bytes32Word(receipt.riskAssessmentHash),
    bytes32Word(receipt.threatIntelSnapshotHash),
    word(receipt.nonce),
  ];
  return `${SUBMIT_RECEIPT_SELECTOR}${values.join("")}`;
}

async function rpc(method, params = []) {
  const response = await fetch(COSTON2_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error?.message || `Coston2 RPC failed (${response.status})`);
  return payload.result;
}

function statusCallData(receiptId) {
  return `${STATUS_OF_SELECTOR}${bytes32Word(receiptId)}`;
}

function decodeStatus(result) {
  const code = Number(BigInt(result));
  return { statusCode: code, status: RECEIPT_STATUS[code] || "UNKNOWN" };
}

function decodeReceipt(result) {
  const data = stripHex(result);
  if (data.length < 13 * 64) throw new Error("Coston2 returned an incomplete Receipt");
  const at = (index) => data.slice(index * 64, (index + 1) * 64);
  const address = (index) => `0x${at(index).slice(-40)}`;
  const number = (index) => BigInt(`0x${at(index)}`).toString();
  return {
    trader: address(0),
    chainId: number(1),
    router: address(2),
    tokenIn: address(3),
    tokenOut: address(4),
    maxInput: number(5),
    minOutput: number(6),
    maxPositionBps: number(7),
    expiry: number(8),
    simulationHash: `0x${at(9)}`,
    riskAssessmentHash: `0x${at(10)}`,
    threatIntelSnapshotHash: `0x${at(11)}`,
    nonce: number(12),
  };
}

export async function readReceipt(receiptId, contract = REDLINE_RECEIPT_CONTRACT) {
  if (!/^0x[\da-fA-F]{64}$/.test(receiptId || "")) throw new Error("Invalid Receipt ID");
  const statusResult = await rpc("eth_call", [{ to: contract, data: statusCallData(receiptId) }, "latest"]);
  const status = decodeStatus(statusResult);
  if (status.statusCode === 0) return { ...status, receipt: null };
  const receiptResult = await rpc("eth_call", [{ to: contract, data: `${GET_RECEIPT_SELECTOR}${bytes32Word(receiptId)}` }, "latest"]);
  return { ...status, receipt: decodeReceipt(receiptResult) };
}

async function waitForTransaction(transactionHash, timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await rpc("eth_getTransactionReceipt", [transactionHash]);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error("Coston2 transaction confirmation timed out");
}

export async function publishReceipt(receipt, walletAddress) {
  if (!window.ethereum?.request) throw new Error("A browser wallet is required to publish on Coston2");
  const chainId = Number.parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);
  if (chainId !== COSTON2_CHAIN_ID) throw new Error("Switch your wallet to Coston2 before publishing");
  const transactionHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [{ from: walletAddress, to: REDLINE_RECEIPT_CONTRACT, data: encodeSubmitReceipt(receipt) }],
  });
  const transactionReceipt = await waitForTransaction(transactionHash);
  const createdLog = transactionReceipt.logs?.find((log) => log.address.toLowerCase() === REDLINE_RECEIPT_CONTRACT.toLowerCase() && log.topics?.[0].toLowerCase() === RECEIPT_CREATED_TOPIC);
  const receiptId = createdLog?.topics?.[1];
  if (!receiptId) throw new Error("ReceiptCreated event was not found in the Coston2 transaction");
  return { transactionHash, receiptId, transactionReceipt };
}
