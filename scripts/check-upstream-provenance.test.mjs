import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertAncestor,
  assertSyncMergeShape,
  downstreamFeatureMarker,
  exceptionEvidence,
  exceptionMode,
  validateChangedFileCount,
  validateChangedPaths,
  writeEvidence,
} from "./check-upstream-provenance.mjs";

const currentHead = "a".repeat(40);
const otherHead = "b".repeat(40);

test("accepts exact downstream-feature marker and rationale", () => {
  assert.deepEqual(
    exceptionMode("Downstream feature: true\nDownstream rationale: Keep this fork-only."),
    { mode: "downstream-feature", rationale: "Keep this fork-only." },
  );
  assert.deepEqual(
    downstreamFeatureMarker("Downstream feature: true\nDownstream rationale: reason"),
    {
      rationale: "reason",
    },
  );
});

test("requires an available integer changed-files count matching fetched records", () => {
  assert.doesNotThrow(() => validateChangedFileCount([{ filename: "packages/example.ts" }], 1));
  for (const expectedCount of [undefined, "1", 1.5, 2]) {
    assert.throws(
      () => validateChangedFileCount([{ filename: "packages/example.ts" }], expectedCount),
      /changed-files response count/,
    );
  }
});

test("rejects invalid downstream-feature markers and rationale", () => {
  for (const body of [
    "Downstream feature: false\nDownstream rationale: reason",
    "Downstream feature: true\nDownstream feature: true\nDownstream rationale: reason",
    " Downstream feature: true\nDownstream rationale: reason",
    "Downstream feature: true",
    "Downstream feature: true\nDownstream rationale:",
    "Downstream feature: true\nDownstream rationale: one\nDownstream rationale: two",
    "Downstream feature: true\ndownstream rationale : reason",
  ]) {
    assert.throws(() => exceptionMode(body), /Downstream (feature|rationale)/);
  }
});

test("rejects exception mode conflicts with governance and provenance metadata", () => {
  assert.throws(
    () =>
      exceptionMode(
        "Downstream feature: true\nDownstream rationale: reason\nDownstream governance: true",
      ),
    /mutually exclusive/,
  );
  for (const field of ["Upstream issue: 1", "Fork main: ${currentHead}"]) {
    assert.throws(
      () => exceptionMode(`Downstream feature: true\nDownstream rationale: reason\n${field}`),
      /upstream provenance metadata/,
    );
  }
});

test("forbids governance and workflow paths in feature mode", () => {
  assert.deepEqual(validateChangedPaths(["packages/example.ts"], "downstream-feature"), [
    "packages/example.ts",
  ]);
  for (const path of ["scripts/check-upstream-provenance.mjs", ".github/workflows/ci.yml"]) {
    assert.throws(
      () => validateChangedPaths([path], "downstream-feature"),
      /does not allow governance or workflow path/,
    );
  }
  assert.deepEqual(
    validateChangedPaths(["scripts/check-upstream-provenance.mjs"], "downstream-governance"),
    ["scripts/check-upstream-provenance.mjs"],
  );
});

test("governance evidence does not require review approval", () => {
  const evidence = exceptionEvidence("fork/project", 7, "downstream-governance", undefined, {
    currentHead,
    changedFiles: ["docs/fork-governance.md"],
  });
  assert.equal(evidence.result, "governance-exception");
  assert.equal("approval" in evidence, false);
  assert.equal(evidence.currentHead, currentHead);
});

test("feature evidence does not require or store review approval", () => {
  const evidence = exceptionEvidence("fork/project", 7, "downstream-feature", "reason", {
    currentHead,
    changedFiles: ["packages/example.ts"],
  });
  assert.equal(evidence.result, "feature-exception");
  assert.equal("approval" in evidence, false);
  assert.equal(evidence.currentHead, currentHead);
});

test("accepts exact downstream-sync marker", () => {
  assert.deepEqual(exceptionMode("Downstream sync: true"), { mode: "downstream-sync" });
});

test("rejects invalid downstream-sync markers", () => {
  for (const body of [
    "Downstream sync: false",
    "Downstream sync: true\nDownstream sync: true",
    " Downstream sync: true",
    "downstream sync : true",
  ]) {
    assert.throws(() => exceptionMode(body), /Downstream sync/);
  }
});

test("rejects downstream-sync combined with other exception modes", () => {
  assert.throws(
    () => exceptionMode("Downstream sync: true\nDownstream governance: true"),
    /mutually exclusive/,
  );
  assert.throws(
    () => exceptionMode("Downstream sync: true\nDownstream feature: true\nDownstream rationale: r"),
    /mutually exclusive/,
  );
  assert.throws(
    () => exceptionMode("Downstream sync: true\nUpstream issue: 1"),
    /upstream provenance metadata/,
  );
});

test("allows governance and workflow paths in sync mode", () => {
  const paths = [
    ".github/workflows/ci.yml",
    "scripts/check-upstream-provenance.mjs",
    "packages/example.ts",
  ];
  assert.deepEqual(validateChangedPaths(paths, "downstream-sync"), paths);
});

test("sync mode requires a two-parent merge whose second parent is fork main", () => {
  assert.doesNotThrow(() => assertSyncMergeShape([otherHead, currentHead], currentHead));
  for (const parents of [[], [otherHead], [otherHead, currentHead, otherHead]]) {
    assert.throws(() => assertSyncMergeShape(parents, currentHead), /exactly two parents/);
  }
  assert.throws(
    () => assertSyncMergeShape([currentHead, otherHead], currentHead),
    /second parent must be fork main/,
  );
});

test("ancestor assertion accepts only ahead or identical comparisons", () => {
  const description = "first parent must be an ancestor of internal/main";
  for (const status of ["ahead", "identical"]) {
    assert.doesNotThrow(() => assertAncestor(status, description));
  }
  for (const status of ["behind", "diverged", undefined]) {
    assert.throws(() => assertAncestor(status, description), /first parent must be an ancestor/);
  }
});

test("renders a step summary for every mode without throwing", () => {
  const directory = mkdtempSync(join(tmpdir(), "provenance-summary-"));
  const summary = join(directory, "summary.md");
  const previous = process.env.GITHUB_STEP_SUMMARY;
  process.env.GITHUB_STEP_SUMMARY = summary;
  const evidenceByMode = {
    "downstream-sync": {
      forkMain: otherHead,
      mergeParents: [currentHead, otherHead],
      currentHead,
      scope: { changedFiles: ["packages/example.ts"] },
      result: "sync-exception",
    },
    "downstream-governance": {
      currentHead,
      scope: { changedFiles: ["docs/fork-governance.md"] },
      result: "governance-exception",
    },
    "downstream-feature": {
      currentHead,
      rationale: "reason",
      scope: { changedFiles: ["packages/example.ts"] },
      result: "feature-exception",
    },
    direct: {
      upstreamRepository: "getpaseo/paseo",
      upstreamIssue: 1,
      upstreamPullRequest: 2,
      upstreamHeadRepository: "getpaseo/paseo",
      upstreamHead: currentHead,
      forkPatchIds: ["c".repeat(40)],
      upstreamPatchIds: ["c".repeat(40)],
      result: "equivalent",
    },
  };
  try {
    for (const [mode, evidence] of Object.entries(evidenceByMode)) {
      writeEvidence(join(directory, `${mode}.json`), {
        repository: "fork/project",
        pullRequest: 7,
        mode,
        ...evidence,
      });
    }
    const rendered = readFileSync(summary, "utf8");
    assert.match(rendered, /Downstream sync exception evidence/);
    assert.match(rendered, new RegExp(`Fork main: \`${otherHead}\``));
  } finally {
    if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
