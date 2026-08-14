import test from "node:test";
import assert from "node:assert/strict";
import { buildRiskPrompt, getAiConfig, normalizeRiskBrief } from "../api/risk-brief.mjs";

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

test("AI provider configuration defaults to Kimi and supports generic env names", () => {
  const config = getAiConfig({
    API_KEY: "test-key",
    BASE_URL: "https://api.moonshot.cn/v1/",
    MODEL: "moonshot-v1-8k",
  });
  assert.equal(config.apiKey, "test-key");
  assert.equal(config.baseUrl, "https://api.moonshot.cn/v1");
  assert.equal(config.model, "moonshot-v1-8k");
});

test("AI-specific env names take precedence over legacy names", () => {
  const config = getAiConfig({
    AI_API_KEY: "preferred-key",
    API_KEY: "legacy-key",
    AI_BASE_URL: "https://preferred.example/v1",
    BASE_URL: "https://legacy.example/v1",
    AI_MODEL: "preferred-model",
    MODEL: "legacy-model",
  });
  assert.deepEqual(config, {
    apiKey: "preferred-key",
    baseUrl: "https://preferred.example/v1",
    model: "preferred-model",
  });
});
