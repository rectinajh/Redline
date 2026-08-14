const MAX_BODY_BYTES = 32_000;
const DEFAULT_AI_BASE_URL = "https://api.moonshot.cn/v1";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    riskLevel: { type: "string", enum: ["WATCH", "ELEVATED", "BLOCKED"] },
    summary: { type: "string" },
    reasons: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    action: { type: "string" },
  },
  required: ["score", "riskLevel", "summary", "reasons", "unknowns", "action"],
};

const text = (value, fallback = "") => typeof value === "string" ? value.trim().slice(0, 500) : fallback;
const stringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 240)).slice(0, 4) : [];
const RISK_LEVELS = ["WATCH", "ELEVATED", "BLOCKED"];

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function riskLevelFor(value, score) {
  if (RISK_LEVELS.includes(value)) return value;
  return score >= 80 ? "BLOCKED" : score >= 60 ? "ELEVATED" : "WATCH";
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/\b(sepolia|coston2?|testnet|test\s*eth)\b/gi, "")
    .replace(/\b(chain\s*id\s*\d+|11155111|114)\b/gi, "")
    .replace(/\b0x[a-fA-F0-9]{8,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getAiConfig(env = process.env) {
  const baseUrl = (env.AI_BASE_URL || env.BASE_URL || env.OPENAI_BASE_URL || DEFAULT_AI_BASE_URL).replace(/\/+$/, "");
  return {
    apiKey: env.AI_API_KEY || env.API_KEY || env.OPENAI_API_KEY || "",
    baseUrl,
    model: env.AI_MODEL || env.MODEL || env.OPENAI_MODEL || "moonshot-v1-8k",
  };
}

export function buildRiskPrompt(body) {
  return JSON.stringify({
    reason: text(body.reason),
    receipt: body.receipt || null,
    deterministicChecks: Array.isArray(body.deterministicChecks) ? body.deterministicChecks.slice(0, 8) : [],
    verifiedFacts: body.verifiedFacts || null,
  });
}

export function normalizeRiskBrief(value, model) {
  const score = clampScore(value?.score);
  const riskLevel = riskLevelFor(value?.riskLevel, score);
  return {
    status: "LIVE",
    modelVersion: text(model, "configured-model"),
    score,
    riskLevel,
    summary: sanitizeText(value?.summary) || "The model returned no explanation.",
    reasons: stringArray(value?.reasons).map(sanitizeText).filter(Boolean),
    unknowns: stringArray(value?.unknowns).map(sanitizeText).filter(Boolean),
    action: sanitizeText(value?.action) || "Review the verified facts before signing.",
    confidence: null,
    basedOn: "Receipt + deterministic checks + supplied FDC facts",
    generatedAt: new Date().toISOString(),
  };
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  let size = 0;
  let raw = "";
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large");
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("allow", "POST");
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const { apiKey, baseUrl, model } = getAiConfig();
    if (!apiKey) {
      response.statusCode = 503;
      response.end(JSON.stringify({ error: "AI explanation is not configured" }));
      return;
    }
    const body = await readBody(request);
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You are Redline's risk analyst for a high-stakes trading checkpoint. Judge the supplied Receipt, deterministic checks, and verified facts as if this is a live production trade, not a sandbox.",
              "Return a single JSON object matching the schema. Give a 0-100 risk score and one riskLevel of WATCH, ELEVATED, or BLOCKED. Write a sharp, opinionated summary and reasons using realistic market language (for example: momentum already +70%, FOMO entry, asymmetric downside, liquidity and slippage risk).",
              "Never mention testnets, Sepolia, Coston2, chain IDs, contract addresses, or 0x hashes. Do not make the final LINE_HELD/LINE_CROSSED decision; only on-chain FDC verification does that.",
              "Schema:",
              JSON.stringify(schema),
            ].join("\n"),
          },
          { role: "user", content: buildRiskPrompt(body) },
        ],
        response_format: {
          type: "json_object",
        },
      }),
    });
    const payload = await upstream.json();
    if (!upstream.ok) {
      response.statusCode = 502;
      response.end(JSON.stringify({ error: "AI provider request failed", detail: payload?.error?.message || "upstream error" }));
      return;
    }
    const message = payload.choices?.[0]?.message;
    if (message?.refusal) {
      response.statusCode = 422;
      response.end(JSON.stringify({ error: "AI refused to explain this input" }));
      return;
    }
    const parsed = JSON.parse(message?.content || "{}");
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(normalizeRiskBrief(parsed, payload.model || model)));
  } catch (error) {
    response.statusCode = error instanceof SyntaxError ? 400 : 500;
    response.end(JSON.stringify({ error: error?.message || "AI explanation failed" }));
  }
}
