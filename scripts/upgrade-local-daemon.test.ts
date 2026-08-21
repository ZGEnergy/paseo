import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const scriptPath = new URL("./upgrade-local-daemon.sh", import.meta.url);

describe("upgrade-local-daemon checkout entrypoint", () => {
  test("validates branch and cleanliness before staged Nix build", async () => {
    const script = await readFile(scriptPath, "utf8");
    expect(script.indexOf("branch --show-current")).toBeLessThan(script.indexOf("nix build"));
    expect(script.indexOf("status --porcelain")).toBeLessThan(script.indexOf("nix build"));
  });

  test("refuses Paseo agent and workspace env before staged Nix build", async () => {
    const script = await readFile(scriptPath, "utf8");
    expect(script.indexOf("PASEO_AGENT_ID")).toBeLessThan(script.indexOf("nix build"));
    expect(script.indexOf("PASEO_WORKSPACE_ID")).toBeLessThan(script.indexOf("nix build"));
    expect(script).toContain(
      "upgrade must run from a host shell, not a Paseo agent or workspace terminal",
    );
  });

  test("does not trip set -u when upgrade env vars are unset", () => {
    const env = { ...process.env };
    delete env.PASEO_AGENT_ID;
    delete env.PASEO_WORKSPACE_ID;
    const result = spawnSync("bash", [fileURLToPath(scriptPath)], {
      env,
      encoding: "utf8",
    });
    expect(result.stderr).not.toContain("unbound variable");
  });

  test("invokes the staged absolute CLI without npm global mutation", async () => {
    const script = await readFile(scriptPath, "utf8");
    expect(script).toContain('"$closure_root/bin/paseo" daemon "$subcommand"');
    expect(script).toContain("subcommand=upgrade-local");
    expect(script).not.toContain("npm install -g");
    expect(script).not.toContain("npm uninstall -g");
    expect(script).not.toContain("curl");
  });

  test("supports staged bootstrap through the absolute closure CLI", async () => {
    const script = await readFile(scriptPath, "utf8");
    expect(script).toContain('if [[ "${1:-}" == "--bootstrap" ]]');
    expect(script).toContain("subcommand=bootstrap-upgrade");
    expect(script).toContain('"$closure_root/bin/paseo" daemon "$subcommand"');
  });

  test("warns unless the stable launcher directory is the first PATH component", async () => {
    const script = await readFile(scriptPath, "utf8");
    expect(script).toContain("first_path=${PATH%%:*}");
    expect(script).toContain('[[ "$first_path" != "$launcher_dir" ]]');
  });
});
