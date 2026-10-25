// Build script for Windows release: produces .msi + .nsis installer in
// src-tauri/target/release/bundle/.
//
// Usage:
//   node scripts/build-release.mjs
//   node scripts/build-release.mjs --no-bundle   # just compile binary
//
// Requirements:
//   - Rust toolchain + MSVC build tools
//   - WiX Toolset v3 (auto-downloaded by tauri on first build)
//   - NSIS (auto-downloaded by tauri on first build)
//
// Before first run, replace the placeholder pubkey in tauri.conf.json
// with the real public key from:
//   npx @tauri-apps/cli signer generate -w ~/.tauri/pc-manager-pro.key

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const noBundle = args.includes("--no-bundle");

const root = resolve(import.meta.dirname, "..");
process.chdir(root);

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: true, ...opts });
}

// 1. Sanity check
const cargoToml = resolve(root, "src-tauri", "Cargo.toml");
if (!existsSync(cargoToml)) {
  console.error(`[build-release] Cargo.toml not found at ${cargoToml}`);
  process.exit(1);
}

// 2. Lint
console.log("\n=== [1/4] TypeScript type-check ===");
run("npm run build");

// 3. Optional: cargo test
// Skipped by default to keep build fast. Uncomment for CI:
// console.log("\n=== [2/4] Cargo test ===");
// run("cd src-tauri && cargo test --release");

// 4. tauri build
console.log("\n=== [3/4] tauri build ===");
const tauriArgs = noBundle ? ["--no-bundle"] : [];
run(`npx tauri build ${tauriArgs.join(" ")}`.trim());

// 5. Print output paths
console.log("\n=== [4/4] Done ===");
console.log("Bundles available at:");
console.log("  src-tauri/target/release/bundle/msi/         (.msi installer)");
console.log("  src-tauri/target/release/bundle/nsis/        (.exe installer)");
console.log("  src-tauri/target/release/bundle/updater/     (updater artifacts for GitHub release)");
console.log("\nNext steps:");
console.log("  1. Sign the binaries (optional, requires code-signing cert)");
console.log("  2. Create a GitHub release with the .msi/.exe + latest.json from bundle/updater/");
console.log("  3. Tag the release matching the version in tauri.conf.json");
