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
    expect(script).toContain('"$closure_root/bin/paseo" daemon upgrade-local');
    expect(script).not.toContain("npm install -g");
    expect(script).not.toContain("npm uninstall -g");
    expect(script).not.toContain("curl");
  });
});
