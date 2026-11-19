import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Resolve the esbuild version locked by the project's installed tsx dependency.
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("tsx/package.json"))("esbuild");
const output = process.argv[2];
if (!output) throw new Error("Usage: node infra/whv-monitor/build.mjs <output-template.json>");
const entry = fileURLToPath(new URL("./handler.ts", import.meta.url));
const { outputFiles: [file] } = await build({
  entryPoints: [entry], bundle: true, platform: "node", target: "node22",
  format: "cjs", minify: true, write: false,
});
const template = JSON.parse(readFileSync(new URL("./template.json", import.meta.url), "utf8"));
template.Resources.Worker.Properties.Code.ZipFile = file.text;
const body = JSON.stringify(template);
if (Buffer.byteLength(body) > 51_200) throw new Error("template exceeds CloudFormation --template-body limit");
writeFileSync(output, body, { mode: 0o600 });
