#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSigningPlan } from "./signing-env.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(desktopDir, "../..");

const forwarded = process.argv.slice(2);
const plan = resolveSigningPlan({ env: process.env, argv: forwarded });

const env = { ...process.env };
if (plan.disableAutoDiscovery) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  console.log(
    "[desktop] No signing certificate configured (CSC_LINK unset) — building with an " +
      "ad-hoc signature and skipping keychain identity discovery.\n" +
      "[desktop] Set CSC_IDENTITY_AUTO_DISCOVERY=true to sign with a keychain identity instead.",
  );
}

// Our flags go first so anything the caller forwarded takes precedence.
const args = ["--config", "electron-builder.yml", ...plan.extraArgs, ...forwarded];

const isWindows = process.platform === "win32";
const binary = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  isWindows ? "electron-builder.cmd" : "electron-builder",
);

const child = spawn(binary, args, {
  cwd: desktopDir,
  env,
  stdio: "inherit",
  shell: isWindows,
});

child.on("error", (error) => {
  console.error(`[desktop] Failed to run electron-builder: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
