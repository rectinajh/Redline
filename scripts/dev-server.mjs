import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import riskBriefHandler from "../api/risk-brief.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  if (request.url?.split("?")[0] === "/api/risk-brief") {
    await riskBriefHandler(request, response);
    return;
  }
  const requested = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const safePath = normalize(join(root, requested));
  if (!safePath.startsWith(root)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(safePath);
    response.writeHead(200, {
      "content-type": mime[extname(safePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    const fallback = await readFile(join(root, "index.html"));
    response.writeHead(200, { "content-type": mime[".html"], "cache-control": "no-store" });
    response.end(fallback);
  }
});

server.listen(port, () => {
  console.log(`Redline Receipt running at http://localhost:${port}`);
});
