const MAX_BODY_BYTES = 32_000;
const DEFAULT_AI_BASE_URL = "https://api.moonshot.cn/v1";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    reasons: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    action: { type: "string" },
  },
  required: ["summary", "reasons", "unknowns", "action"],
};

const text = (value, fallback = "") => typeof value === "string" ? value.trim().slice(0, 500) : fallback;
const stringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 240)).slice(0, 4) : [];

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
  return {
    status: "LIVE",
    modelVersion: text(model, "configured-model"),
    summary: text(value?.summary, "The model returned no explanation."),
    reasons: stringArray(value?.reasons),
    unknowns: stringArray(value?.unknowns),
    action: text(value?.action, "Review the verified facts before signing."),
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
              "You are Redline's evidence explainer. Explain only the supplied Receipt, deterministic checks, and verified FDC facts. Never predict prices, invent facts, assign a safety score, or make the final LINE_HELD/LINE_CROSSED decision. If facts are missing, put that in unknowns. Keep the explanation concise and actionable.",
              "Return only a JSON object matching this exact shape, with no markdown or commentary:",
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
