// Generate a Tauri code-signing keypair and write the public key into
// tauri.conf.json (replacing the empty "pubkey" placeholder).
//
// Usage:
//   node scripts/gen-signer.mjs
//   node scripts/gen-signer.mjs --password MY_PASSWORD
//
// Output:
//   ~/.tauri/pc-manager-pro.key       (private key - KEEP SECRET)
//   tauri.conf.json                   (public key written into plugins.updater.pubkey)

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const pwdIdx = args.indexOf("--password");
const password = pwdIdx >= 0 ? args[pwdIdx + 1] : undefined;

console.log("Generating Tauri signer keypair…");

// tauri signer generate outputs a base64-encoded private key on stdout.
// We redirect the password via env if provided.
const env = password ? { ...process.env, TAURI_SIGNER_PRIVATE_KEY_PASSWORD: password } : process.env;

let out;
try {
  out = execSync("npx @tauri-apps/cli signer generate -w ~/.tauri/pc-manager-pro.key", {
    encoding: "utf-8",
    env,
    stdio: ["inherit", "pipe", "inherit"],
  });
} catch (e) {
  console.error("[gen-signer] Failed to run tauri signer generate.");
  console.error(e.message);
  process.exit(1);
}

const m = out.match(/Public key: ([A-Za-z0-9+/=]+)/);
if (!m) {
  console.error("[gen-signer] Could not parse public key from output:");
  console.error(out);
  process.exit(1);
}

const pubkey = m[1];
console.log(`\nPublic key: ${pubkey}`);

// Patch tauri.conf.json
const confPath = resolve(root, "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf-8"));
if (!conf.plugins) conf.plugins = {};
if (!conf.plugins.updater) conf.plugins.updater = {};
conf.plugins.updater.pubkey = pubkey;

writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n", "utf-8");
console.log(`\nWrote pubkey into ${confPath}`);
console.log("\nNext steps:");
console.log("  1. Keep ~/.tauri/pc-manager-pro.key safe - DO NOT commit to git");
console.log("  2. Set the TAURI_SIGNER_PRIVATE_KEY + TAURI_SIGNER_PRIVATE_KEY_PASSWORD env vars in CI");
console.log("  3. Run `npm run tauri:build` to produce signed installers");
