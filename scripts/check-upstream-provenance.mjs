#!/usr/bin/env node

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

function option(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function required(name) {
  const value = option(name);
  if (!value) throw new Error(`Missing required option --${name}`);
  return value;
}

function ghApi(path, accept = "application/vnd.github+json") {
  try {
    return execFileSync("gh", ["api", path, "--header", `Accept: ${accept}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim();
    throw new Error(`GitHub API request failed for ${path}${detail ? `: ${detail}` : ""}`);
  }
}

function ghJson(path) {
  return JSON.parse(ghApi(path));
}

function metadataValue(body, label) {
  const match = body.match(new RegExp(`^${label}\\s*:\\s*(.*?)\\s*$`, "im"));
  return match ? match[1].trim() : undefined;
}

function metadata(body, label) {
  const value = metadataValue(body, label);
  if (!value) throw new Error(`Pull request body must include ${label}:`);
  return value;
}

function provenanceMetadata(body) {
  const forkMain = metadataValue(body, "Fork main");
  const reconciliationMerge = metadataValue(body, "Reconciliation merge");
  const hasForkMain = forkMain !== undefined;
  const hasReconciliationMerge = reconciliationMerge !== undefined;
  if (hasForkMain !== hasReconciliationMerge) {
    throw new Error("Pull request body must include both Fork main: and Reconciliation merge: for reconciled imports");
  }
  return {
    mode: hasForkMain ? "reconciled" : "direct",
    forkMain,
    reconciliationMerge,
  };
}

function repositoryFrom(value, label) {
  const text = value.trim();
  let repository;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) {
    let url;
    try {
      url = new URL(text);
    } catch {
      throw new Error(`${label} must identify a GitHub repository`);
    }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error(`${label} must identify a GitHub repository`);
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.hostname.toLowerCase() === "github.com" && segments.length === 2) {
      repository = segments.join("/");
    } else if (url.hostname.toLowerCase() === "api.github.com" && segments.length === 3 && segments[0] === "repos") {
      repository = segments.slice(1).join("/");
    } else {
      throw new Error(`${label} must identify a GitHub repository`);
    }
  } else {
    repository = text.replace(/\/+$/, "");
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error(`${label} must be a GitHub repository in owner/name form`);
  }
  return repository.toLowerCase();
}

function referenceFrom(value, label, kind, upstreamRepository) {
  const text = value.trim();
  if (/^#?\d+$/.test(text)) return Number(text.replace(/^#/, ""));

  const qualified = text.match(/^([^/\s]+\/[^/\s]+)#(\d+)$/);
  if (qualified) {
    if (repositoryFrom(qualified[1], label) !== upstreamRepository) {
      throw new Error(`${label} must refer to ${upstreamRepository}`);
    }
    return Number(qualified[2]);
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an upstream ${kind} number or GitHub URL`);
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must refer to ${upstreamRepository}`);
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 4 || !/^\d+$/.test(segments[3]) || segments[2].toLowerCase() !== kind) {
    throw new Error(`${label} must be an upstream ${kind} number or GitHub URL`);
  }
  const repository = repositoryFrom(segments.slice(0, 2).join("/"), label);
  if (repository !== upstreamRepository) {
    throw new Error(`${label} must refer to ${upstreamRepository}`);
  }
  return Number(segments[3]);
}

function shaFrom(value, label = "Upstream head") {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(`${label} must be a 40-character commit SHA`);
  return value.toLowerCase();
}

function patchIds(patch, label) {
  const result = spawnSync("git", ["patch-id", "--stable"], { input: patch, encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`${label} patch cannot be reduced to patch IDs`);
  }
  const ids = result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
  if (!ids.length) throw new Error(`${label} patch cannot be reduced to patch IDs`);
  return ids;
}

function writeEvidence(path, evidence) {
  if (path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      `## Upstream ${evidence.mode} provenance evidence`,
      "",
      `- Repository: \`${evidence.upstreamRepository}\``,
      `- Issue: #${evidence.upstreamIssue}`,
      `- Pull request: #${evidence.upstreamPullRequest}`,
      `- Upstream head repository: \`${evidence.upstreamHeadRepository}\``,
      `- Upstream head: \`${evidence.upstreamHead}\``,
    ];
    if (evidence.mode === "direct") {
      lines.push(
        `- Fork patch IDs: \`${evidence.forkPatchIds.join(", ")}\``,
        `- Upstream patch IDs: \`${evidence.upstreamPatchIds.join(", ")}\``,
      );
    } else {
      lines.push(
        `- Fork main: \`${evidence.forkMain}\``,
        `- Reconciliation merge: \`${evidence.reconciliationMerge}\``,
        `- Merge parents (ordered): \`${evidence.mergeParents.join(", ")}\``,
        `- Review diff: ${evidence.reviewDiffReference}`,
      );
    }
    lines.push("- Result: **equivalent**", "");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
}

try {
  const repository = repositoryFrom(required("repository"), "Repository");
  const currentPullRequest = Number(required("pull-request"));
  if (!Number.isSafeInteger(currentPullRequest) || currentPullRequest < 1) {
    throw new Error("Pull request must be a positive number");
  }
  const upstreamRepository = repositoryFrom(option("upstream-repository", "getpaseo/paseo"), "Upstream repository");
  const evidencePath = option("evidence", "reconciliation-evidence.json");
  const current = ghJson(`repos/${repository}/pulls/${currentPullRequest}`);
  if (current.base.ref !== "internal/main") {
    throw new Error(`Pull request must target internal/main (found ${current.base.ref})`);
  }
  if (current.head.repo?.full_name?.toLowerCase() !== repository) {
    throw new Error("Pull request head must be a branch in the fork repository");
  }

  const body = current.body ?? "";
  const upstreamIssue = referenceFrom(metadata(body, "Upstream issue"), "Upstream issue", "issues", upstreamRepository);
  const upstreamPullRequest = referenceFrom(metadata(body, "Upstream pull request"), "Upstream pull request", "pull", upstreamRepository);
  const upstreamHeadRepository = repositoryFrom(metadata(body, "Upstream head repository"), "Upstream head repository");
  const upstreamHead = shaFrom(metadata(body, "Upstream head"));
  const reconciliation = provenanceMetadata(body);
  const issue = ghJson(`repos/${upstreamRepository}/issues/${upstreamIssue}`);
  const upstream = ghJson(`repos/${upstreamRepository}/pulls/${upstreamPullRequest}`);
  if (issue.pull_request !== undefined) {
    throw new Error("Upstream issue reference resolves to a pull request");
  }
  if (repositoryFrom(issue.repository_url ?? "", "API upstream issue repository") !== upstreamRepository) {
    throw new Error("Upstream issue belongs to a different repository");
  }
  if (repositoryFrom(upstream.base?.repo?.full_name ?? "", "Upstream pull request base repository") !== upstreamRepository) {
    throw new Error(`Upstream pull request must merge into ${upstreamRepository}`);
  }
  const actualHeadRepository = upstream.head.repo?.full_name;
  if (!actualHeadRepository || repositoryFrom(actualHeadRepository, "API upstream head repository") !== upstreamHeadRepository) {
    throw new Error(`Upstream head repository mismatch: metadata ${upstreamHeadRepository}, API ${actualHeadRepository ?? "missing"}`);
  }
  if (upstream.head.sha.toLowerCase() !== upstreamHead) {
    throw new Error(`Upstream head mismatch: metadata ${upstreamHead}, API ${upstream.head.sha}`);
  }

  if (reconciliation.mode === "direct") {
    const forkPatchIds = patchIds(ghApi(`repos/${repository}/pulls/${currentPullRequest}`, "application/vnd.github.patch"), "Fork pull request");
    const upstreamPatchIds = patchIds(ghApi(`repos/${upstreamRepository}/pulls/${upstreamPullRequest}`, "application/vnd.github.patch"), "Upstream pull request");
    const patchesEquivalent = forkPatchIds.length === upstreamPatchIds.length && forkPatchIds.every((id, index) => id === upstreamPatchIds[index]);
    if (!patchesEquivalent) {
      throw new Error(`Patch equivalence failed: fork [${forkPatchIds.join(", ")}], upstream [${upstreamPatchIds.join(", ")}]`);
    }

    writeEvidence(evidencePath, {
      repository,
      pullRequest: currentPullRequest,
      upstreamRepository,
      upstreamIssue,
      upstreamPullRequest,
      upstreamHeadRepository,
      upstreamHead,
      mode: "direct",
      forkPatchIds,
      upstreamPatchIds,
      result: "equivalent",
    });
  } else {
    const forkMain = shaFrom(reconciliation.forkMain, "Fork main");
    const reconciliationMerge = shaFrom(reconciliation.reconciliationMerge, "Reconciliation merge");
    const currentHead = shaFrom(current.head?.sha ?? "", "Pull request head");
    if (currentHead !== reconciliationMerge) {
      throw new Error(`Reconciliation merge mismatch: metadata ${reconciliationMerge}, pull request head ${currentHead}`);
    }

    const liveMain = ghJson(`repos/${repository}/git/ref/heads/main`);
    const liveMainSha = shaFrom(liveMain.object?.sha ?? "", "Current fork main");
    if (liveMainSha !== forkMain) {
      throw new Error(`Fork main mismatch: metadata ${forkMain}, current ${liveMainSha}`);
    }

    const mergeCommit = ghJson(`repos/${repository}/commits/${reconciliationMerge}`);
    const mergeParents = Array.isArray(mergeCommit.parents) ? mergeCommit.parents.map((parent) => shaFrom(parent?.sha ?? "", "Reconciliation merge parent")) : [];
    if (mergeParents.length !== 2) {
      throw new Error(`Reconciliation merge must have exactly two parents (found ${mergeParents.length})`);
    }
    if (mergeParents[0] !== upstreamHead || mergeParents[1] !== forkMain) {
      throw new Error(`Reconciliation merge parents must be [${upstreamHead}, ${forkMain}] (found [${mergeParents.join(", ")}])`);
    }

    const reviewDiffReference = current.html_url
      ? `${current.html_url.replace(/\/$/, "")}/files`
      : `https://github.com/${repository}/pull/${currentPullRequest}/files`;
    writeEvidence(evidencePath, {
      repository,
      pullRequest: currentPullRequest,
      upstreamRepository,
      upstreamIssue,
      upstreamPullRequest,
      upstreamHeadRepository,
      upstreamHead,
      mode: "reconciled",
      forkMain,
      reconciliationMerge,
      mergeParents,
      reviewDiffReference,
      result: "equivalent",
    });
  }
  console.log(`Upstream provenance verified: ${upstreamRepository}#${upstreamPullRequest} == ${repository}#${currentPullRequest}`);
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exitCode = 1;
}
