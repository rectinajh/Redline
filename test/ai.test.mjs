import test from "node:test";
import assert from "node:assert/strict";
import { buildRiskPrompt, normalizeRiskBrief } from "../api/risk-brief.mjs";

test("AI prompt contains only the bounded Receipt input shape", () => {
  const prompt = buildRiskPrompt({ reason: "test trade", deterministicChecks: [{ id: "router", status: "OK" }], secret: "must not pass" });
  assert.match(prompt, /test trade/);
  assert.match(prompt, /deterministicChecks/);
  assert.doesNotMatch(prompt, /must not pass/);
});

test("AI output is normalized without inventing confidence", () => {
  const brief = normalizeRiskBrief({ summary: "Grounded", reasons: ["A fact"], unknowns: [], action: "Review" }, "test-model");
  assert.equal(brief.status, "LIVE");
  assert.equal(brief.modelVersion, "test-model");
  assert.equal(brief.confidence, null);
  assert.deepEqual(brief.unknowns, []);
});
