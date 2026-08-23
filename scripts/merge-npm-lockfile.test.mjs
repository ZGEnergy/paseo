import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { UnmergeableLockfileError, mergeLockfiles } from "./merge-npm-lockfile.mjs";

const scriptPath = new URL("./merge-npm-lockfile.mjs", import.meta.url);

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
  assert.equal(merged.packages["node_modules/foo"].resolved, undefined);
  assert.equal(merged.packages["node_modules/foo"].integrity, undefined);
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

test("CLI writes merged JSON and exits 1 on unmergeable input", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "paseo-merge-lockfile-"));
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
    writeFileSync(path.join(directory, "base.json"), `${JSON.stringify(base)}\n`);
    writeFileSync(path.join(directory, "ours.json"), `${JSON.stringify(ours)}\n`);
    writeFileSync(path.join(directory, "theirs.json"), `${JSON.stringify(theirs)}\n`);

    const success = spawnSync(
      process.execPath,
      [
        scriptPath.pathname,
        "--base",
        path.join(directory, "base.json"),
        "--ours",
        path.join(directory, "ours.json"),
        "--theirs",
        path.join(directory, "theirs.json"),
        "--out",
        path.join(directory, "out.json"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(success.status, 0, success.stderr);
    const written = JSON.parse(readFileSync(path.join(directory, "out.json"), "utf8"));
    assert.deepEqual(written.packages["node_modules/foo"], { version: "1.0.0" });

    ours.packages["node_modules/foo"].version = "1.1.0";
    theirs.packages["node_modules/foo"].version = "9.0.0";
    writeFileSync(path.join(directory, "ours.json"), `${JSON.stringify(ours)}\n`);
    writeFileSync(path.join(directory, "theirs.json"), `${JSON.stringify(theirs)}\n`);
    const failure = spawnSync(
      process.execPath,
      [
        scriptPath.pathname,
        "--base",
        path.join(directory, "base.json"),
        "--ours",
        path.join(directory, "ours.json"),
        "--theirs",
        path.join(directory, "theirs.json"),
        "--out",
        path.join(directory, "out.json"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /both sides changed|Unmergeable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
