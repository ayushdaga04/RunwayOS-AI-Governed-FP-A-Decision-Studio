import { readFile, writeFile } from "node:fs/promises";

const root = new URL(".", import.meta.url);
const [html, css, js] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("browser-app.js", root), "utf8")
]);

const standalone = html
  .replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${css}\n</style>`)
  .replace('<script src="browser-app.js"></script>', () => `<script>\n${js}\n</script>`);

await writeFile(new URL("RunwayOS-Standalone.html", root), standalone);
console.log("Created RunwayOS-Standalone.html");
