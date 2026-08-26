import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import "./bundle.mjs";

const root = new URL(".", import.meta.url).pathname;
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ["index.html", "styles.css", "browser-app.js"]) await cp(resolve(root,file),resolve(dist,file));
await writeFile(resolve(dist,"BUILD_INFO.txt"),"RunwayOS static portfolio build\nGenerated from validated source.\n");
console.log("Built dist/");
