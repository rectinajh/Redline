import test from "node:test";
import assert from "node:assert/strict";
import { ATTESTATION_TYPE, SOURCE_ID, buildEvmTransactionRequest, padUtf8Hex32, prepareRequestUrl, proofUrl } from "../scripts/fdc/canonical-path.mjs";

test("canonical FDC path uses EVMTransaction/testETH", () => {
  const request = buildEvmTransactionRequest("0x4e636c6590b22d8dcdade7ee3b5ae5572f42edb1878f09b3034b2f7c3362ef3c");
  assert.equal(request.attestationType, padUtf8Hex32(ATTESTATION_TYPE));
  assert.equal(request.sourceId, padUtf8Hex32(SOURCE_ID));
  assert.equal(request.requestBody.requiredConfirmations, "1");
  assert.equal(request.requestBody.provideInput, true);
  assert.equal(request.requestBody.listEvents, true);
  assert.deepEqual(request.requestBody.logIndices, []);
});

test("FDC endpoints are explicit and secret-free", () => {
  assert.match(prepareRequestUrl(), /fdc-verifiers-testnet\.flare\.network\/verifier\/eth\/EVMTransaction\/prepareRequest/);
  assert.match(proofUrl(), /ctn2-data-availability\.flare\.network\/api\/v1\/fdc\/proof-by-request-round-raw/);
});

test("invalid transaction hash is rejected before network calls", () => {
  assert.throws(() => buildEvmTransactionRequest("0x1234"), /32-byte/);
});
