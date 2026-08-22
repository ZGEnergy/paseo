#!/usr/bin/env node

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
    throw new Error(`GitHub API request failed for ${path}${detail ? `: ${detail}` : ""}`, {
      cause: error,
    });
  }
}

function ghJson(path) {
  return JSON.parse(ghApi(path));
}
const DOWNSTREAM_GOVERNANCE_PATHS = Object.freeze([
  "scripts/check-upstream-provenance.mjs",
  "scripts/check-upstream-provenance.test.mjs",
  "scripts/check-upstream-port.mjs",
  "scripts/check-upstream-port.test.mjs",
  "scripts/ci-workflow.test.mjs",
  "docs/fork-governance.md",
  "CLAUDE.md",
  ".github/workflows/ci.yml",
  ".github/workflows/upstream-sync.yml",
  ".github/workflows/upstream-import-merge.yml",
  ".github/workflows/upstream-provenance.yml",
  ".github/workflows/deploy-app.yml",
  ".github/workflows/deploy-website.yml",
  ".github/workflows/android-apk-release.yml",
  ".github/workflows/desktop-release.yml",
  ".github/workflows/deploy-relay.yml",
  ".claude/skills/ship/SKILL.md",
]);
const DOWNSTREAM_GOVERNANCE_PATH_SET = new Set(DOWNSTREAM_GOVERNANCE_PATHS);
const UPSTREAM_PROVENANCE_LABELS = Object.freeze([
  "Upstream issue",
  "Upstream pull request",
  "Upstream head repository",
  "Upstream head",
  "Fork main",
  "Reconciliation merge",
]);

function paginatedJson(path) {
  const pages = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const result = ghJson(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(result))
      throw new Error(`GitHub API pagination returned a non-array for ${path}`);
    pages.push(...result);
    if (result.length < 100) return pages;
  }
}

function markerLines(body, label) {
  const pattern = new RegExp(`^${label.replaceAll(" ", "\\s+")}\\s*:`, "i");
  return body.split(/\r?\n/).filter((line) => pattern.test(line.trim()));
}

function downstreamGovernanceMarker(body) {
  const markers = markerLines(body, "Downstream governance");
  if (!markers.length) return false;
  if (markers.length !== 1 || markers[0] !== "Downstream governance: true") {
    throw new Error(
      "Pull request body must contain exactly `Downstream governance: true` when using downstream governance mode",
    );
  }
  return true;
}

function downstreamFeatureMarker(body) {
  const markers = markerLines(body, "Downstream feature");
  const rationales = markerLines(body, "Downstream rationale");
  if (!markers.length && !rationales.length) return undefined;
  if (markers.length !== 1 || markers[0] !== "Downstream feature: true") {
    throw new Error(
      "Pull request body must contain exactly `Downstream feature: true` when using downstream feature mode",
    );
  }
  if (rationales.length !== 1) {
    throw new Error(
      "Pull request body must contain exactly one non-empty `Downstream rationale:` when using downstream feature mode",
    );
  }
  if (!rationales[0].startsWith("Downstream rationale:")) {
    throw new Error(
      "Pull request body must use the exact `Downstream rationale:` label when using downstream feature mode",
    );
  }
  const rationale = rationales[0].slice("Downstream rationale:".length).trim();
  if (!rationale) {
    throw new Error("Downstream rationale must be non-empty when using downstream feature mode");
  }
  return { rationale };
}

function validateChangedFileCount(files, expectedCount) {
  if (!Number.isInteger(expectedCount) || files.length !== expectedCount) {
    throw new Error(
      "Pull request changed-files response count did not match the pull request changed_files count",
    );
  }
}

function metadataLine(body, label) {
  const pattern = new RegExp(`^${label.replaceAll(" ", "\\s+")}\\s*:\\s*(.*?)\\s*$`, "im");
  return pattern.test(body);
}

function exceptionMode(body) {
  const governance = downstreamGovernanceMarker(body);
  const feature = downstreamFeatureMarker(body);
  const provenanceLabels = UPSTREAM_PROVENANCE_LABELS.filter((label) => metadataLine(body, label));
  if (governance && feature) {
    throw new Error("Downstream feature and downstream governance modes are mutually exclusive");
  }
  if ((governance || feature) && provenanceLabels.length) {
    throw new Error(
      `Downstream exception mode cannot include upstream provenance metadata: ${provenanceLabels.join(", ")}`,
    );
  }
  if (feature) return { mode: "downstream-feature", rationale: feature.rationale };
  if (governance) return { mode: "downstream-governance" };
  return { mode: "upstream-import" };
}

function validateChangedPaths(paths, mode) {
  for (const path of paths) {
    if (
      mode === "downstream-governance"
        ? !DOWNSTREAM_GOVERNANCE_PATH_SET.has(path)
        : DOWNSTREAM_GOVERNANCE_PATH_SET.has(path) || path.startsWith(".github/workflows/")
    ) {
      const scope =
        mode === "downstream-governance"
          ? "does not allow changed path"
          : "does not allow governance or workflow path";
      throw new Error(`Downstream ${mode.replace("downstream-", "")} exception ${scope} ${path}`);
    }
  }
  return paths;
}

function changedFiles(current, repository, pullRequest, mode) {
  const currentHead = shaFrom(current.head?.sha ?? "", "Pull request head");
  const files = paginatedJson(`repos/${repository}/pulls/${pullRequest}/files`);
  validateChangedFileCount(files, current.changed_files);
  const changed = [];
  for (const file of files) {
    const paths = [file?.filename, file?.previous_filename].filter(
      (path, index, all) => typeof path === "string" && all.indexOf(path) === index,
    );
    if (!paths.length)
      throw new Error("Pull request changed-files response contained a file without a path");
    changed.push(...paths);
  }
  return { currentHead, changedFiles: validateChangedPaths(changed, mode) };
}

function exceptionEvidence(repository, pullRequest, mode, rationale, scope) {
  return {
    repository,
    pullRequest,
    mode,
    exception: mode,
    ...(rationale === undefined ? {} : { rationale }),
    scope: {
      ...(mode === "downstream-feature"
        ? { forbidden: ["downstream-governance allowlist", ".github/workflows/**"] }
        : { allowlist: DOWNSTREAM_GOVERNANCE_PATHS }),
      changedFiles: scope.changedFiles,
    },
    currentHead: scope.currentHead,
    result: mode === "downstream-governance" ? "governance-exception" : "feature-exception",
  };
}

function downstreamExceptionEvidence(current, repository, pullRequest, mode, rationale) {
  const scope = changedFiles(current, repository, pullRequest, mode);
  return exceptionEvidence(repository, pullRequest, mode, rationale, scope);
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
    throw new Error(
      "Pull request body must include both Fork main: and Reconciliation merge: for reconciled imports",
    );
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
    } else if (
      url.hostname.toLowerCase() === "api.github.com" &&
      segments.length === 3 &&
      segments[0] === "repos"
    ) {
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
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
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
    if (evidence.mode === "downstream-feature") {
      const lines = [
        "## Downstream feature exception evidence",
        "",
        `- Rationale: ${evidence.rationale}`,
        `- Changed files: \`${evidence.scope.changedFiles.join(", ")}\``,
        `- Current pull request head: \`${evidence.currentHead}\``,
        "- Result: **downstream feature exception accepted; no upstream patch equivalence asserted, no review required**",
        "",
      ];
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
      return;
    }
    if (evidence.mode === "downstream-governance") {
      const lines = [
        "## Downstream governance exception evidence",
        "",
        `- Exception scope: changed files restricted to the exact governance allowlist`,
        `- Changed files: \`${evidence.scope.changedFiles.join(", ")}\``,
        `- Current pull request head: \`${evidence.currentHead}\``,

        "- Result: **downstream governance exception accepted; no upstream patch equivalence asserted**",
        "",
      ];
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
      return;
    }
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

function validateUpstreamReferences(
  issue,
  upstream,
  upstreamRepository,
  upstreamHeadRepository,
  upstreamHead,
) {
  if (issue.pull_request !== undefined) {
    throw new Error("Upstream issue reference resolves to a pull request");
  }
  if (
    repositoryFrom(issue.repository_url ?? "", "API upstream issue repository") !==
    upstreamRepository
  ) {
    throw new Error("Upstream issue belongs to a different repository");
  }
  if (
    repositoryFrom(
      upstream.base?.repo?.full_name ?? "",
      "Upstream pull request base repository",
    ) !== upstreamRepository
  ) {
    throw new Error(`Upstream pull request must merge into ${upstreamRepository}`);
  }
  const actualHeadRepository = upstream.head.repo?.full_name;
  if (
    !actualHeadRepository ||
    repositoryFrom(actualHeadRepository, "API upstream head repository") !== upstreamHeadRepository
  ) {
    throw new Error(
      `Upstream head repository mismatch: metadata ${upstreamHeadRepository}, API ${actualHeadRepository ?? "missing"}`,
    );
  }
  if (upstream.head.sha.toLowerCase() !== upstreamHead) {
    throw new Error(`Upstream head mismatch: metadata ${upstreamHead}, API ${upstream.head.sha}`);
  }
}

function directImportEvidence(
  repository,
  pullRequest,
  upstreamRepository,
  upstreamIssue,
  upstreamPullRequest,
  upstreamHeadRepository,
  upstreamHead,
) {
  const forkPatchIds = patchIds(
    ghApi(`repos/${repository}/pulls/${pullRequest}`, "application/vnd.github.patch"),
    "Fork pull request",
  );
  const upstreamPatchIds = patchIds(
    ghApi(
      `repos/${upstreamRepository}/pulls/${upstreamPullRequest}`,
      "application/vnd.github.patch",
    ),
    "Upstream pull request",
  );
  const patchesEquivalent =
    forkPatchIds.length === upstreamPatchIds.length &&
    forkPatchIds.every((id, index) => id === upstreamPatchIds[index]);
  if (!patchesEquivalent) {
    throw new Error(
      `Patch equivalence failed: fork [${forkPatchIds.join(", ")}], upstream [${upstreamPatchIds.join(", ")}]`,
    );
  }
  return {
    repository,
    pullRequest,
    upstreamRepository,
    upstreamIssue,
    upstreamPullRequest,
    upstreamHeadRepository,
    upstreamHead,
    mode: "direct",
    forkPatchIds,
    upstreamPatchIds,
    result: "equivalent",
  };
}

function reconciledImportEvidence(
  current,
  repository,
  pullRequest,
  upstreamRepository,
  upstreamIssue,
  upstreamPullRequest,
  upstreamHeadRepository,
  upstreamHead,
  reconciliation,
) {
  const forkMain = shaFrom(reconciliation.forkMain, "Fork main");
  const reconciliationMerge = shaFrom(reconciliation.reconciliationMerge, "Reconciliation merge");
  const currentHead = shaFrom(current.head?.sha ?? "", "Pull request head");
  if (currentHead !== reconciliationMerge) {
    throw new Error(
      `Reconciliation merge mismatch: metadata ${reconciliationMerge}, pull request head ${currentHead}`,
    );
  }

  const liveMain = ghJson(`repos/${repository}/git/ref/heads/main`);
  const liveMainSha = shaFrom(liveMain.object?.sha ?? "", "Current fork main");
  if (liveMainSha !== forkMain) {
    throw new Error(`Fork main mismatch: metadata ${forkMain}, current ${liveMainSha}`);
  }

  const mergeCommit = paginatedJson(`repos/${repository}/pulls/${pullRequest}/commits`).find(
    (commit) => commit?.sha?.toLowerCase() === reconciliationMerge,
  );
  if (!mergeCommit) {
    throw new Error(
      `Reconciliation merge ${reconciliationMerge} was not found in pull request commits`,
    );
  }
  const mergeParents = Array.isArray(mergeCommit.parents)
    ? mergeCommit.parents.map((parent) => shaFrom(parent?.sha ?? "", "Reconciliation merge parent"))
    : [];
  if (mergeParents.length !== 2) {
    throw new Error(
      `Reconciliation merge must have exactly two parents (found ${mergeParents.length})`,
    );
  }
  if (mergeParents[0] !== upstreamHead || mergeParents[1] !== forkMain) {
    throw new Error(
      `Reconciliation merge parents must be [${upstreamHead}, ${forkMain}] (found [${mergeParents.join(", ")}])`,
    );
  }

  const reviewDiffReference = current.html_url
    ? `${current.html_url.replace(/\/$/, "")}/files`
    : `https://github.com/${repository}/pull/${pullRequest}/files`;
  return {
    repository,
    pullRequest,
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
  };
}

function upstreamImportEvidence(current, repository, pullRequest, upstreamRepository, body) {
  const upstreamIssue = referenceFrom(
    metadata(body, "Upstream issue"),
    "Upstream issue",
    "issues",
    upstreamRepository,
  );
  const upstreamPullRequest = referenceFrom(
    metadata(body, "Upstream pull request"),
    "Upstream pull request",
    "pull",
    upstreamRepository,
  );
  const upstreamHeadRepository = repositoryFrom(
    metadata(body, "Upstream head repository"),
    "Upstream head repository",
  );
  const upstreamHead = shaFrom(metadata(body, "Upstream head"));
  const reconciliation = provenanceMetadata(body);
  const issue = ghJson(`repos/${upstreamRepository}/issues/${upstreamIssue}`);
  const upstream = ghJson(`repos/${upstreamRepository}/pulls/${upstreamPullRequest}`);
  validateUpstreamReferences(
    issue,
    upstream,
    upstreamRepository,
    upstreamHeadRepository,
    upstreamHead,
  );
  if (reconciliation.mode === "direct") {
    return directImportEvidence(
      repository,
      pullRequest,
      upstreamRepository,
      upstreamIssue,
      upstreamPullRequest,
      upstreamHeadRepository,
      upstreamHead,
    );
  }
  return reconciledImportEvidence(
    current,
    repository,
    pullRequest,
    upstreamRepository,
    upstreamIssue,
    upstreamPullRequest,
    upstreamHeadRepository,
    upstreamHead,
    reconciliation,
  );
}

function run() {
  try {
    const repository = repositoryFrom(required("repository"), "Repository");
    const currentPullRequest = Number(required("pull-request"));
    if (!Number.isSafeInteger(currentPullRequest) || currentPullRequest < 1) {
      throw new Error("Pull request must be a positive number");
    }
    const upstreamRepository = repositoryFrom(
      option("upstream-repository", "getpaseo/paseo"),
      "Upstream repository",
    );
    const evidencePath = option("evidence", "reconciliation-evidence.json");
    const current = ghJson(`repos/${repository}/pulls/${currentPullRequest}`);
    if (current.base.ref !== "internal/main") {
      throw new Error(`Pull request must target internal/main (found ${current.base.ref})`);
    }
    if (current.head.repo?.full_name?.toLowerCase() !== repository) {
      throw new Error("Pull request head must be a branch in the fork repository");
    }

    const body = current.body ?? "";
    const selectedMode = exceptionMode(body);
    if (selectedMode.mode !== "upstream-import") {
      const evidence = downstreamExceptionEvidence(
        current,
        repository,
        currentPullRequest,
        selectedMode.mode,
        selectedMode.rationale,
      );
      writeEvidence(evidencePath, evidence);
      console.log(
        `${selectedMode.mode === "downstream-feature" ? "Downstream feature" : "Downstream governance"} exception verified: ${repository}#${currentPullRequest} at ${evidence.currentHead}`,
      );
      return;
    }

    const evidence = upstreamImportEvidence(
      current,
      repository,
      currentPullRequest,
      upstreamRepository,
      body,
    );
    writeEvidence(evidencePath, evidence);
    console.log(
      `Upstream provenance verified: ${upstreamRepository}#${evidence.upstreamPullRequest} == ${repository}#${currentPullRequest}`,
    );
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();

export {
  DOWNSTREAM_GOVERNANCE_PATHS,
  downstreamFeatureMarker,
  downstreamGovernanceMarker,
  exceptionEvidence,
  exceptionMode,
  validateChangedFileCount,
  validateChangedPaths,
};
