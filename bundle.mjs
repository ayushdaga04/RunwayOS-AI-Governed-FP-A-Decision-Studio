import { readFile, writeFile } from "node:fs/promises";

const root = new URL(".", import.meta.url);
const finance = (await readFile(new URL("finance.mjs", root), "utf8")).replace(/^export\s+/gm, "");
const app = (await readFile(new URL("app.js", root), "utf8")).replace(/^import[^\n]+\n/, "");
await writeFile(new URL("browser-app.js", root), `${finance}\n\n${app}`);
