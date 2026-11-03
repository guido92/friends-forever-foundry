/**
 * Costruisce il pacchetto scaricabile del sistema.
 *
 *   node tools/build.mjs [--version 0.2.0] [--repo owner/repo]
 *
 * Produce in dist/:
 *   - system.json                       (manifesto con url/manifest/download valorizzati se c'è --repo)
 *   - friends-forever-v<versione>.zip   (system.json alla radice, come vuole Foundry)
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const manifest = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));
const version = (arg("version") ?? manifest.version).replace(/^v/, "");
const repo = arg("repo") ?? process.env.GITHUB_REPOSITORY ?? null;

manifest.version = version;
if (repo) {
  manifest.url = `https://github.com/${repo}`;
  manifest.manifest = `https://github.com/${repo}/releases/latest/download/system.json`;
  manifest.download = `https://github.com/${repo}/releases/download/v${version}/friends-forever-v${version}.zip`;
  manifest.bugs = `https://github.com/${repo}/issues`;
}

const dist = join(root, "dist");
const stage = join(dist, "stage");
rmSync(dist, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const entry of ["module", "templates", "styles", "lang", "assets", "README.md", "LICENSE"]) {
  const from = join(root, entry);
  // le illustrazioni del manuale (assets/ff-art) sono dei loro autori: restano solo in locale
  const filter = (src) => !src.replaceAll("\\", "/").includes("/assets/ff-art");
  if (existsSync(from)) cpSync(from, join(stage, entry), { recursive: true, filter });
}
writeFileSync(join(stage, "system.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(dist, "system.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const zipPath = join(dist, `friends-forever-v${version}.zip`);
if (process.platform === "win32") {
  // bsdtar (incluso in Windows 10+) crea zip con -a
  // (non "tar" generico: nel PATH di Git Bash c'è GNU tar, che non sa fare zip)
  const bsdtar = join(process.env.SystemRoot ?? "C:/Windows", "System32", "tar.exe");
  execFileSync(bsdtar, ["-a", "-c", "-f", zipPath, "-C", stage, ...readdirSync(stage)], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: stage, stdio: "inherit" });
}
rmSync(stage, { recursive: true, force: true });
console.log(`Creato ${zipPath}${repo ? ` (manifesto per ${repo})` : " (senza URL: passa --repo owner/repo)"}`);
