import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const scriptPath = new URL("./check-upstream-port.mjs", import.meta.url);

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "ignore" });
}

function withRepository(callback) {
  const repository = mkdtempSync(path.join(tmpdir(), "paseo-upstream-port-"));
  git(repository, ["init", "--initial-branch=main"]);
  git(repository, ["config", "user.name", "Upstream Port Test"]);
  git(repository, ["config", "user.email", "upstream-port-test@example.invalid"]);
  try {
    callback(repository);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

function commitFile(repository, relativePath, contents, message) {
  const filePath = path.join(repository, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  git(repository, ["add", "--", relativePath]);
  git(repository, ["commit", "-m", message]);
}

function createDirectCandidate(repository, files) {
  commitFile(repository, "base.txt", "base\n", "base");
  git(repository, ["switch", "-c", "integration"]);
  commitFile(repository, "integration.txt", "internal\n", "integration");
  git(repository, ["switch", "main"]);
  git(repository, ["switch", "-c", "candidate"]);
  for (const [relativePath, contents] of files) {
    commitFile(repository, relativePath, contents, `port ${relativePath}`);
  }
}

function runPreflight(repository, ...args) {
  const integrationArgs = args.includes("--integration-ref")
    ? []
    : ["--integration-ref", "integration"];
  return spawnSync(process.execPath, [scriptPath.pathname, ...args, ...integrationArgs], {
    cwd: repository,
    encoding: "utf8",
  });
}

function assertFailure(result, message) {
  assert.equal(result.status, 1, message);
  assert.match(result.stderr, /Upstream port preflight failed:/, message);
}

test("accepts a direct port from upstream main within one allowed scope", () => {
  withRepository((repository) => {
    createDirectCandidate(repository, [["packages/port/index.js", "ported\n"]]);
    const result = runPreflight(
      repository,
      "--candidate",
      "candidate",
      "--upstream-ref",
      "main",
      "--integration-ref",
      "integration",
      "--allow-path",
      "packages/port",
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Upstream port preflight passed: 1 changed path\(s\)\./);
  });
});

test("rejects a candidate descended from integration ref even when paths are allowed", () => {
  withRepository((repository) => {
    commitFile(repository, "base.txt", "base\n", "base");
    git(repository, ["switch", "-c", "integration"]);
    commitFile(repository, "packages/internal.js", "internal\n", "internal change");
    git(repository, ["switch", "-c", "candidate"]);
    commitFile(repository, "packages/port.js", "ported\n", "port change");

    const result = runPreflight(
      repository,
      "--candidate",
      "candidate",
      "--upstream-ref",
      "main",
      "--integration-ref",
      "integration",
      "--allow-path",
      "packages",
    );
    assertFailure(result, "integration descendant must fail");
    assert.match(result.stderr, /candidate descends from integration ref/);
  });
});

test("rejects missing candidate and upstream refs", () => {
  withRepository((repository) => {
    commitFile(repository, "base.txt", "base\n", "base");
    const missingCandidate = runPreflight(
      repository,
      "--candidate",
      "missing-candidate",
      "--upstream-ref",
      "main",
      "--allow-path",
      "packages",
    );
    assertFailure(missingCandidate, "missing candidate ref should fail");
    assert.match(missingCandidate.stderr, /could not resolve candidate ref/);

    const missingUpstream = runPreflight(
      repository,
      "--candidate",
      "main",
      "--upstream-ref",
      "missing-upstream",
      "--allow-path",
      "packages",
    );
    assertFailure(missingUpstream, "missing upstream ref should fail");
    assert.match(missingUpstream.stderr, /could not resolve upstream ref/);
  });
});

test("rejects a candidate whose upstream ref is not its merge base", () => {
  withRepository((repository) => {
    commitFile(repository, "base.txt", "base\n", "base");
    git(repository, ["switch", "-c", "integration"]);
    commitFile(repository, "integration.txt", "internal\n", "integration");
    git(repository, ["switch", "main"]);
    git(repository, ["switch", "-c", "candidate"]);
    commitFile(repository, "packages/port.js", "candidate\n", "candidate");
    git(repository, ["switch", "main"]);
    commitFile(repository, "upstream.txt", "upstream\n", "upstream");

    const result = runPreflight(
      repository,
      "--candidate",
      "candidate",
      "--upstream-ref",
      "main",
      "--allow-path",
      "packages",
    );
    assertFailure(result, "non-ancestor upstream must fail");
    assert.match(result.stderr, /upstream ref is not the merge base of candidate/);
  });
});

test("requires an integration ref", () => {
  withRepository((repository) => {
    createDirectCandidate(repository, [["packages/port.js", "ported\n"]]);
    const result = spawnSync(
      process.execPath,
      [
        scriptPath.pathname,
        "--candidate",
        "candidate",
        "--upstream-ref",
        "main",
        "--allow-path",
        "packages",
      ],
      { cwd: repository, encoding: "utf8" },
    );
    assertFailure(result, "missing integration ref must fail");
    assert.match(result.stderr, /--integration-ref is required/);
  });
});

test("requires at least one allowed path", () => {
  withRepository((repository) => {
    createDirectCandidate(repository, [["packages/port.js", "ported\n"]]);
    const result = runPreflight(repository, "--candidate", "candidate", "--upstream-ref", "main");
    assertFailure(result, "missing scope must fail");
    assert.match(result.stderr, /at least one --allow-path is required/);
  });
});

test("allows an exact path and descendants under its prefix", () => {
  withRepository((repository) => {
    createDirectCandidate(repository, [["packages/port.js", "ported\n"]]);
    const result = runPreflight(
      repository,
      "--candidate",
      "candidate",
      "--upstream-ref",
      "main",
      "--allow-path",
      "packages/port.js",
    );
    assert.equal(result.status, 0, result.stderr);
  });
});

test("rejects an unrelated changed path", () => {
  withRepository((repository) => {
    createDirectCandidate(repository, [
      ["packages/port/index.js", "ported\n"],
      ["docs/notes.md", "notes\n"],
    ]);
    const result = runPreflight(
      repository,
      "--candidate",
      "candidate",
      "--upstream-ref",
      "main",
      "--allow-path",
      "packages/port",
    );
    assertFailure(result, "unrelated path must fail");
    assert.match(result.stderr, /changed path outside allowed scope: docs\/notes\.md/);
  });
});

test("rejects an out-of-scope rename source even when destination is allowed", () => {
  withRepository((repository) => {
    commitFile(repository, "outside/source.js", "ported\n", "base");
    git(repository, ["switch", "-c", "integration"]);
    commitFile(repository, "integration.txt", "internal\n", "integration");
    git(repository, ["switch", "main"]);
    git(repository, ["switch", "-c", "candidate"]);
    mkdirSync(path.join(repository, "packages"), { recursive: true });
    git(repository, ["mv", "outside/source.js", "packages/port.js"]);
    git(repository, ["commit", "-m", "rename into allowed scope"]);

    const result = runPreflight(
      repository,
      "--candidate",
      "candidate",
      "--upstream-ref",
      "main",
      "--allow-path",
      "packages/port.js",
    );
    assertFailure(result, "out-of-scope rename source must fail");
    assert.match(result.stderr, /outside\/source\.js/);
  });
});

test("enforces prefix boundaries instead of substring matching", () => {
  withRepository((repository) => {
    createDirectCandidate(repository, [["packages/port-extra/index.js", "not port\n"]]);
    const result = runPreflight(
      repository,
      "--candidate",
      "candidate",
      "--upstream-ref",
      "main",
      "--allow-path",
      "packages/port",
    );
    assertFailure(result, "prefix-neighbor path must fail");
    assert.match(result.stderr, /packages\/port-extra\/index\.js/);
  });
});

test("accepts changes covered by multiple scopes", () => {
  withRepository((repository) => {
    createDirectCandidate(repository, [
      ["packages/port/index.js", "ported\n"],
      ["docs/port.md", "ported docs\n"],
    ]);
    const result = runPreflight(
      repository,
      "--candidate",
      "candidate",
      "--upstream-ref",
      "main",
      "--allow-path",
      "packages/port",
      "--allow-path",
      "docs/port.md",
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 changed path\(s\)/);
  });
});
