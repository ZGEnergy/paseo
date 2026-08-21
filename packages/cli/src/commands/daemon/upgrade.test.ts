import { describe, expect, test } from "vitest";
import { bootstrapUpgradeCommand, upgradeLocalCommand } from "./upgrade.js";

describe("local daemon upgrade command surface", () => {
  test("registers command-local JSON output on both upgrade paths", () => {
    expect(upgradeLocalCommand().options.map((option) => option.long)).toContain("--json");
    expect(bootstrapUpgradeCommand().options.map((option) => option.long)).toContain("--json");
  });

  test("bootstrap exposes explicit launch values and disabled hostnames", () => {
    const command = bootstrapUpgradeCommand();
    const flags = command.options.map((option) => option.long);
    expect(flags).toEqual(
      expect.arrayContaining([
        "--listen",
        "--relay",
        "--relay-use-tls",
        "--mcp",
        "--inject-mcp",
        "--web-ui",
        "--hostnames",
      ]),
    );
    expect(command.options.find((option) => option.long === "--hostnames")?.description).toContain(
      "false/none",
    );
  });
});
