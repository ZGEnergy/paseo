import assert from "node:assert/strict";
import test from "node:test";

import {
  downstreamFeatureMarker,
  effectiveApproval,
  exceptionEvidence,
  exceptionMode,
  resolveApproval,
  validateChangedFileCount,
  validateChangedPaths,
} from "./check-upstream-provenance.mjs";

const currentHead = "a".repeat(40);
const otherHead = "b".repeat(40);

function review(overrides = {}) {
  return {
    id: 1,
    state: "APPROVED",
    commit_id: currentHead,
    user: { login: "reviewer", type: "User" },
    ...overrides,
  };
}

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

test("requires a current-head approval from a non-author human", () => {
  assert.deepEqual(resolveApproval([review()], currentHead, "author"), {
    id: 1,
    authorLogin: "reviewer",
    authorType: "User",
    state: "APPROVED",
    commitOid: currentHead,
  });
  for (const candidate of [
    review({ commit_id: otherHead }),
    review({ user: { login: "author", type: "User" } }),
    review({ user: { login: "automation", type: "Bot" } }),
    review({ state: "DISMISSED" }),
  ]) {
    assert.throws(
      () => resolveApproval([candidate], currentHead, "author"),
      /current pull request head/,
    );
  }
});

test("latest review state replaces an older approval", () => {
  assert.throws(
    () =>
      resolveApproval(
        [review({ id: 1 }), review({ id: 2, state: "DISMISSED" })],
        currentHead,
        "author",
      ),
    /current pull request head/,
  );
});

test("preserves current-head approval across later comment-only reviews", () => {
  for (const state of ["COMMENTED", "PENDING"]) {
    assert.deepEqual(
      resolveApproval([review({ id: 1 }), review({ id: 2, state })], currentHead, "author"),
      {
        id: 1,
        authorLogin: "reviewer",
        authorType: "User",
        state: "APPROVED",
        commitOid: currentHead,
      },
    );
  }
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

test("accepts human merger evidence only for a closed-and-merged pull request", () => {
  assert.deepEqual(
    effectiveApproval(
      {
        state: "closed",
        merged: true,
        merged_by: { login: "merger", type: "User" },
      },
      "fork/project",
      7,
    ),
    {
      phase: "post-merge",
      evidenceType: "human-merger",
      authorLogin: "merger",
      authorType: "User",
    },
  );
  for (const current of [
    { state: "closed", merged: false, merged_by: { login: "merger", type: "User" } },
    { state: "closed", merged: true },
    { state: "closed", merged: true, merged_by: { login: "automation", type: "Bot" } },
  ]) {
    assert.throws(
      () => effectiveApproval(current, "fork/project", 7),
      /closed and merged|human merged_by/,
    );
  }
});

test("feature evidence retains effective approval", () => {
  const approval = resolveApproval([review()], currentHead, "author");
  const evidence = exceptionEvidence(
    "fork/project",
    7,
    "downstream-feature",
    "reason",
    { currentHead, changedFiles: ["packages/example.ts"] },
    approval,
  );
  assert.equal(evidence.result, "feature-exception");
  assert.deepEqual(evidence.approval, approval);
});
