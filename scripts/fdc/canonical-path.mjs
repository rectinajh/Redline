export const FDC_VERIFIER_BASE_URL = process.env.FDC_VERIFIER_BASE_URL || "https://fdc-verifiers-testnet.flare.network";
export const FDC_DA_LAYER_URL = process.env.COSTON2_DA_LAYER_URL || "https://ctn2-data-availability.flare.network";
export const ATTESTATION_TYPE = "EVMTransaction";
export const SOURCE_ID = "testETH";
export const SOURCE_URL_TYPE = "eth";

export function padUtf8Hex32(value) {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 32) throw new Error(`FDC identifier is longer than 32 bytes: ${value}`);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}${"00".repeat(32 - bytes.length)}`;
}

export function validateTransactionHash(transactionHash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) throw new Error("transactionHash must be a 32-byte 0x hex string");
  return transactionHash;
}

export function buildEvmTransactionRequest(transactionHash, requiredConfirmations = "1") {
  return {
    attestationType: padUtf8Hex32(ATTESTATION_TYPE),
    sourceId: padUtf8Hex32(SOURCE_ID),
    requestBody: {
      transactionHash: validateTransactionHash(transactionHash),
      requiredConfirmations: String(requiredConfirmations),
      provideInput: true,
      listEvents: true,
      logIndices: [],
    },
  };
}

export function prepareRequestUrl() {
  return `${FDC_VERIFIER_BASE_URL}/verifier/${SOURCE_URL_TYPE}/${ATTESTATION_TYPE}/prepareRequest`;
}

export function proofUrl() {
  return `${FDC_DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`;
}
