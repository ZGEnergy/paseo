#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function usage() {
  return [
    "Usage: node scripts/check-upstream-port.mjs --candidate <ref> --upstream-ref <ref> --integration-ref <ref> --allow-path <path> [--allow-path <path> ...]",
    "",
    "Checks that candidate is based directly on upstream-ref, does not descend from integration-ref, and changes only allowed paths.",
  ].join("\n");
}

function parseArgs(argv) {
  let candidate;
  let upstreamRef;
  let integrationRef;
  const allowPaths = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      argument === "--candidate" ||
      argument === "--upstream-ref" ||
      argument === "--integration-ref" ||
      argument === "--allow-path"
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === "--candidate") {
        if (candidate !== undefined) throw new Error("--candidate may be specified only once");
        candidate = value;
      } else if (argument === "--upstream-ref") {
        if (upstreamRef !== undefined) throw new Error("--upstream-ref may be specified only once");
        upstreamRef = value;
      } else if (argument === "--integration-ref") {
        if (integrationRef !== undefined)
          throw new Error("--integration-ref may be specified only once");
        integrationRef = value;
      } else {
        allowPaths.push(value);
      }
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }

  if (candidate === undefined) throw new Error("--candidate is required");
  if (upstreamRef === undefined) throw new Error("--upstream-ref is required");
  if (integrationRef === undefined) throw new Error("--integration-ref is required");
  if (allowPaths.length === 0) throw new Error("at least one --allow-path is required");

  return { candidate, upstreamRef, integrationRef, allowPaths };
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isAncestor(ancestor, descendant) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error("could not determine integration ancestry");
  }
  return result.status === 0;
}

function resolveCommit(ref, label) {
  try {
    return git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
  } catch {
    throw new Error(`could not resolve ${label} ref: ${ref}`);
  }
}

function normalizeScope(scope) {
  const normalized = scope
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
  if (!normalized || normalized === "." || normalized.startsWith("/")) {
    throw new Error(`invalid --allow-path: ${scope}`);
  }
  return normalized;
}

function changedPaths(upstream, candidate) {
  try {
    const output = git(["diff", "--name-only", "--no-renames", "-z", `${upstream}...${candidate}`]);
    return output.split("\0").filter(Boolean);
  } catch {
    throw new Error("could not enumerate candidate changes");
  }
}

export function checkUpstreamPort({ candidate, upstreamRef, integrationRef, allowPaths }) {
  const candidateCommit = resolveCommit(candidate, "candidate");
  const upstreamCommit = resolveCommit(upstreamRef, "upstream");
  const integrationCommit = resolveCommit(integrationRef, "integration");

  let mergeBase;
  try {
    mergeBase = git(["merge-base", candidateCommit, upstreamCommit]).trim();
  } catch {
    throw new Error("candidate and upstream have no merge base");
  }
  if (mergeBase !== upstreamCommit) {
    throw new Error("upstream ref is not the merge base of candidate");
  }
  if (isAncestor(integrationCommit, candidateCommit)) {
    throw new Error("candidate descends from integration ref");
  }

  return checkAllowedPaths(candidateCommit, upstreamCommit, allowPaths);
}

function checkAllowedPaths(candidateCommit, upstreamCommit, allowPaths) {
  const scopes = allowPaths.map(normalizeScope);
  const paths = changedPaths(upstreamCommit, candidateCommit);
  const outsideScope = paths.filter(
    (changedPath) =>
      !scopes.some((scope) => changedPath === scope || changedPath.startsWith(`${scope}/`)),
  );
  if (outsideScope.length > 0) {
    throw new Error(`changed path outside allowed scope: ${outsideScope.join(", ")}`);
  }

  return { candidateCommit, upstreamCommit, paths };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const result = checkUpstreamPort(options);
    process.stdout.write(
      `Upstream port preflight passed: ${result.paths.length} changed path(s).\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(`Upstream port preflight failed: ${error.message}\n${usage()}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main();
}
