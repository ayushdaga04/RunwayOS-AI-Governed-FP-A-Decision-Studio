import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".csv": "text/csv; charset=utf-8" };

createServer(async (request, response) => {
  const requested = request.url === "/" ? "index.html" : request.url.split("?")[0].slice(1);
  try {
    const body = await readFile(join(root, requested));
    response.writeHead(200, { "content-type": types[extname(requested)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(4173, "127.0.0.1", () => console.log("Local: http://127.0.0.1:4173"));
