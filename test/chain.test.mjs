import test from "node:test";
import assert from "node:assert/strict";
import { COSTON2_NETWORK, encodeSubmitReceipt } from "../src/chain.js";
import { COSTON2_CHAIN_ID, PRESETS, createDraft } from "../src/core.js";

test("Coston2 network metadata matches chain id 114", () => {
  assert.equal(COSTON2_NETWORK.chainId, "0x72");
  assert.equal(Number.parseInt(COSTON2_NETWORK.chainId, 16), COSTON2_CHAIN_ID);
});

test("browser Receipt publisher encodes the deployed static tuple", () => {
  const draft = createDraft(PRESETS[0]);
  draft.trader = "0xB675d67909185f5E983EC51b2AED14667eA31b33";
  const data = encodeSubmitReceipt(draft);
  assert.match(data, /^0x6c6b167b[\da-f]{13,}$/);
  assert.equal((data.length - 10) / 64, 13);
  assert.match(data, /b675d67909185f5e983ec51b2aed14667ea31b33/);
});

test("browser Receipt publisher rejects malformed hashes", () => {
  const draft = createDraft(PRESETS[0]);
  draft.trader = "0xB675d67909185f5E983EC51b2AED14667eA31b33";
  draft.simulationHash = "0x1234";
  assert.throws(() => encodeSubmitReceipt(draft), /Invalid Receipt hash/);
});
