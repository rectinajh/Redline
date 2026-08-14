import test from "node:test";
import assert from "node:assert/strict";
import { CHECK_STATUS, PRESETS, STATUS, createDraft, createEvidence, createRiskCapsule, evaluateVerdict, runDeterministicChecks } from "../src/core.js";

test("default preset produces a valid deterministic risk capsule", () => {
  const draft = createDraft(PRESETS[0]);
  const checks = runDeterministicChecks(draft);
  const capsule = createRiskCapsule(draft, checks);
  assert.equal(draft.chainId, 11155111);
  assert.equal(capsule.schemaVersion, "risk_capsule.v1");
  assert.equal(capsule.provenance, "FIXTURE");
  assert.ok(capsule.deterministicChecks.length >= 5);
});

test("held evidence produces LINE_HELD", () => {
  const draft = createDraft(PRESETS[0]);
  const verdict = evaluateVerdict(draft, createEvidence(draft, "held"));
  assert.equal(verdict.status, STATUS.LINE_HELD);
});

test("crossed evidence produces LINE_CROSSED", () => {
  const draft = createDraft(PRESETS[0]);
  const verdict = evaluateVerdict(draft, createEvidence(draft, "crossed"));
  assert.equal(verdict.status, STATUS.LINE_CROSSED);
  assert.match(verdict.reasons[0], /exceeded/);
});

test("unverified evidence never becomes LINE_HELD", () => {
  const draft = createDraft(PRESETS[0]);
  const verdict = evaluateVerdict(draft, { verificationStatus: "PENDING" });
  assert.equal(verdict.status, STATUS.UNVERIFIED);
});

test("wrong router is deterministically blocked", () => {
  const draft = { ...createDraft(PRESETS[0]), router: "0x9999999999999999999999999999999999999999" };
  const checks = runDeterministicChecks(draft);
  assert.equal(checks.find((check) => check.id === "router").status, CHECK_STATUS.BLOCKED);
});
