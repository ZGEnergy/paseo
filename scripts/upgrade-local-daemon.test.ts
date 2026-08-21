import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const scriptPath = new URL("./upgrade-local-daemon.sh", import.meta.url);

describe("upgrade-local-daemon checkout entrypoint", () => {
  test("validates branch and cleanliness before staged Nix build", async () => {
    const script = await readFile(scriptPath, "utf8");
    expect(script.indexOf("branch --show-current")).toBeLessThan(script.indexOf("nix build"));
    expect(script.indexOf("status --porcelain")).toBeLessThan(script.indexOf("nix build"));
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
