import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSION = "1.16.2";
const destination = fileURLToPath(new URL("../lib/forge-std/", import.meta.url));

if (existsSync(`${destination}package.json`)) {
  const { version } = JSON.parse(readFileSync(`${destination}package.json`, "utf8"));
  if (version !== VERSION) {
    throw new Error(`lib/forge-std is ${version}; expected ${VERSION}. Remove it and reinstall.`);
  }
  process.exit(0);
}

mkdirSync(fileURLToPath(new URL("../lib/", import.meta.url)), { recursive: true });
const result = spawnSync(
  "git",
  ["clone", "--quiet", "--depth", "1", "--branch", `v${VERSION}`, "https://github.com/foundry-rs/forge-std.git", destination],
  { stdio: "inherit" },
);
if (result.status !== 0) throw new Error("Could not clone forge-std.");
console.log(`Installed forge-std v${VERSION} in lib/forge-std.`);
