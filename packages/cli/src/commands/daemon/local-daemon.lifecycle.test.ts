import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildCliLifecycleEnvironment } from "./local-daemon.js";

const tempRoots: string[] = [];

async function createHome(config: unknown): Promise<{ home: string; dataHome: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-daemon-lifecycle-"));
  tempRoots.push(root);
  const home = path.join(root, ".paseo");
  const dataHome = path.join(root, "data");
  await mkdir(home, { recursive: true });
  if (config !== undefined) {
    await writeFile(path.join(home, "config.json"), JSON.stringify(config, null, 2));
  }
  return { home, dataHome };
}

function lifecycleEnv(
  home: string,
  dataHome: string,
  extra: NodeJS.ProcessEnv = {},
  runnerEntry = "/repo/packages/server/scripts/supervisor-entrypoint.ts",
) {
  return buildCliLifecycleEnvironment(
    home,
    {
      HOME: os.tmpdir(),
      XDG_DATA_HOME: dataHome,
      PASEO_HOME: home,
      ...extra,
    },
    runnerEntry,
  );
}

describe("daemon launch lifecycle environment", () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  test("records a cli launch with the effective persisted config", async () => {
    const { home, dataHome } = await createHome({
      version: 1,
      daemon: {
        listen: "127.0.0.1:6769",
        relay: { enabled: false, useTls: false },
        mcp: { enabled: false, injectIntoAgents: false },
        hostnames: ["localhost", ".example.com"],
      },
      features: { webUi: { enabled: false } },
    });
    const env = lifecycleEnv(home, dataHome);

    expect(env.PASEO_LIFECYCLE_MANAGER).toBe("cli");
    expect(JSON.parse(env.PASEO_LIFECYCLE_DESCRIPTOR ?? "{}")).toEqual({
      listen: "127.0.0.1:6769",
      relayEnabled: false,
      relayUseTls: false,
      mcpEnabled: false,
      mcpInjectIntoAgents: false,
      webUiEnabled: false,
      hostnames: ["localhost", ".example.com"],
    });
    expect(env.PASEO_LIFECYCLE_SOURCE_REVISION).toBe("local");
    expect(env.PASEO_LIFECYCLE_CLOSURE_ROOT).toBe(
      path.dirname("/repo/packages/server/scripts/supervisor-entrypoint.ts"),
    );
  });

  test("derives rooted revision and closure from the release link and nix runner", async () => {
    const { home, dataHome } = await createHome(undefined);
    const releases = path.join(dataHome, "paseo", "releases");
    await mkdir(path.join(releases, "roots"), { recursive: true });
    await symlink(path.join(releases, "roots", "rooted-revision"), path.join(releases, "current"));

    const env = lifecycleEnv(home, dataHome, {}, "/nix/store/hash-paseo/lib/paseo/server-entry.js");
    expect(env.PASEO_LIFECYCLE_CLOSURE_ROOT).toBe("/nix/store/hash-paseo");
  });

  test("caller-provided lifecycle values win over derivation", async () => {
    const { home, dataHome } = await createHome(undefined);
    const releases = path.join(dataHome, "paseo", "releases");
    await mkdir(path.join(releases, "roots"), { recursive: true });
    await symlink(path.join(releases, "roots", "derived-revision"), path.join(releases, "current"));
    const env = lifecycleEnv(home, dataHome, {
      PASEO_LIFECYCLE_SOURCE_REVISION: "caller-revision",
      PASEO_LIFECYCLE_CLOSURE_ROOT: "/nix/store/caller-paseo",
    });

    expect(env.PASEO_LIFECYCLE_SOURCE_REVISION).toBe("caller-revision");
    expect(env.PASEO_LIFECYCLE_CLOSURE_ROOT).toBe("/nix/store/caller-paseo");
  });
});
