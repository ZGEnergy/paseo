import { describe, expect, test } from "vitest";
import {
  assertHostShellUpgrade,
  bootstrapUpgradeCommand,
  HOST_SHELL_UPGRADE_ERROR,
  runBootstrapUpgradeCommand,
  runUpgradeLocalCommand,
  upgradeLocalCommand,
} from "./upgrade.js";

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

  test("refuses when PASEO_AGENT_ID is set", () => {
    expect(() => assertHostShellUpgrade({ PASEO_AGENT_ID: "agent-1" })).toThrow(
      HOST_SHELL_UPGRADE_ERROR,
    );
  });

  test("refuses when PASEO_WORKSPACE_ID is set", () => {
    expect(() => assertHostShellUpgrade({ PASEO_WORKSPACE_ID: "ws-1" })).toThrow(
      HOST_SHELL_UPGRADE_ERROR,
    );
  });

  test("allows a host shell with both upgrade env vars unset", () => {
    expect(() => assertHostShellUpgrade({})).not.toThrow();
  });

  test("ignores blank upgrade env vars", () => {
    expect(() =>
      assertHostShellUpgrade({ PASEO_AGENT_ID: "  ", PASEO_WORKSPACE_ID: "\t" }),
    ).not.toThrow();
  });

  test("upgrade-local refuses before inspect when PASEO_AGENT_ID is set", async () => {
    const previous = process.env.PASEO_AGENT_ID;
    process.env.PASEO_AGENT_ID = "agent-1";
    try {
      await expect(runUpgradeLocalCommand({})).rejects.toThrow(HOST_SHELL_UPGRADE_ERROR);
    } finally {
      if (previous === undefined) delete process.env.PASEO_AGENT_ID;
      else process.env.PASEO_AGENT_ID = previous;
    }
  });

  test("bootstrap-upgrade refuses before inspect when PASEO_WORKSPACE_ID is set", async () => {
    const previous = process.env.PASEO_WORKSPACE_ID;
    process.env.PASEO_WORKSPACE_ID = "ws-1";
    try {
      await expect(runBootstrapUpgradeCommand({})).rejects.toThrow(HOST_SHELL_UPGRADE_ERROR);
    } finally {
      if (previous === undefined) delete process.env.PASEO_WORKSPACE_ID;
      else process.env.PASEO_WORKSPACE_ID = previous;
    }
  });
});
