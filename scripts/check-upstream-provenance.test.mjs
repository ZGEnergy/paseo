import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertAncestor,
  assertSyncMergeShape,
  downstreamFeatureMarker,
  exceptionEvidence,
  exceptionMode,
  mergeLockfiles,
  UnmergeableLockfileError,
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

const scriptPath = new URL("./check-upstream-provenance.mjs", import.meta.url);

function lockfile(overrides = {}) {
  return {
    name: "paseo",
    version: "0.5.0-beta.4",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
    },
    ...overrides,
  };
}

function pkg(version, extra = {}) {
  return { version, ...extra };
}

test("signature-only both-changed entry omits resolved and integrity", () => {
  const base = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("1.0.0"),
    },
  });
  const ours = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("1.0.0", {
        resolved: "https://example.test/foo-ours.tgz",
        integrity: "sha512-ours",
      }),
    },
  });
  const theirs = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("1.0.0", {
        resolved: "https://example.test/foo-theirs.tgz",
        integrity: "sha512-theirs",
      }),
    },
  });

  const merged = mergeLockfiles(base, ours, theirs);
  assert.deepEqual(merged.packages["node_modules/foo"], { version: "1.0.0" });
});

test("both sides changing version differently fails", () => {
  const base = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("1.0.0"),
    },
  });
  const ours = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("1.1.0"),
    },
  });
  const theirs = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("2.0.0"),
    },
  });
  assert.throws(() => mergeLockfiles(base, ours, theirs), UnmergeableLockfileError);
});

test("one-sided top-level version bump is taken", () => {
  const base = lockfile();
  const ours = lockfile();
  const theirs = lockfile({ version: "0.5.0-beta.5" });
  theirs.packages[""].version = "0.5.0-beta.5";
  const merged = mergeLockfiles(base, ours, theirs);
  assert.equal(merged.version, "0.5.0-beta.5");
  assert.equal(merged.packages[""].version, "0.5.0-beta.5");
});

test("delete versus change of a packages key fails", () => {
  const base = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("1.0.0"),
    },
  });
  const ours = lockfile();
  const theirs = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("1.1.0"),
    },
  });
  assert.throws(() => mergeLockfiles(base, ours, theirs), /delete vs change/);
});

test("delete versus signature-only change accepts the deletion", () => {
  const base = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("1.0.0"),
    },
  });
  const ours = lockfile();
  const theirs = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/foo": pkg("1.0.0", { integrity: "sha512-theirs" }),
    },
  });
  const merged = mergeLockfiles(base, ours, theirs);
  assert.equal(merged.packages["node_modules/foo"], undefined);
});

test("both sides adding the same body with different signatures succeeds", () => {
  const base = lockfile();
  const ours = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/bar": pkg("3.0.0", {
        resolved: "https://example.test/bar-ours.tgz",
        integrity: "sha512-ours",
      }),
    },
  });
  const theirs = lockfile({
    packages: {
      "": { name: "paseo", version: "0.5.0-beta.4" },
      "node_modules/bar": pkg("3.0.0", {
        resolved: "https://example.test/bar-theirs.tgz",
        integrity: "sha512-theirs",
      }),
    },
  });
  const merged = mergeLockfiles(base, ours, theirs);
  assert.deepEqual(merged.packages["node_modules/bar"], { version: "3.0.0" });
});

test("merge-lockfile CLI writes merged JSON and exits 1 on unmergeable input", () => {
  const directory = mkdtempSync(join(tmpdir(), "paseo-merge-lockfile-"));
  try {
    const base = lockfile({
      packages: {
        "": { name: "paseo", version: "0.5.0-beta.4" },
        "node_modules/foo": pkg("1.0.0"),
      },
    });
    const ours = lockfile({
      packages: {
        "": { name: "paseo", version: "0.5.0-beta.4" },
        "node_modules/foo": pkg("1.0.0", { integrity: "sha512-ours" }),
      },
    });
    const theirs = lockfile({
      packages: {
        "": { name: "paseo", version: "0.5.0-beta.4" },
        "node_modules/foo": pkg("1.0.0", { integrity: "sha512-theirs" }),
      },
    });
    writeFileSync(join(directory, "base.json"), `${JSON.stringify(base)}\n`);
    writeFileSync(join(directory, "ours.json"), `${JSON.stringify(ours)}\n`);
    writeFileSync(join(directory, "theirs.json"), `${JSON.stringify(theirs)}\n`);

    const success = spawnSync(
      process.execPath,
      [
        scriptPath.pathname,
        "--merge-lockfile",
        "--base",
        join(directory, "base.json"),
        "--ours",
        join(directory, "ours.json"),
        "--theirs",
        join(directory, "theirs.json"),
        "--out",
        join(directory, "out.json"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(success.status, 0, success.stderr);
    const written = JSON.parse(readFileSync(join(directory, "out.json"), "utf8"));
    assert.deepEqual(written.packages["node_modules/foo"], { version: "1.0.0" });

    ours.packages["node_modules/foo"].version = "1.1.0";
    theirs.packages["node_modules/foo"].version = "9.0.0";
    writeFileSync(join(directory, "ours.json"), `${JSON.stringify(ours)}\n`);
    writeFileSync(join(directory, "theirs.json"), `${JSON.stringify(theirs)}\n`);
    const failure = spawnSync(
      process.execPath,
      [
        scriptPath.pathname,
        "--merge-lockfile",
        "--base",
        join(directory, "base.json"),
        "--ours",
        join(directory, "ours.json"),
        "--theirs",
        join(directory, "theirs.json"),
        "--out",
        join(directory, "out.json"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /both sides changed|Unmergeable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
