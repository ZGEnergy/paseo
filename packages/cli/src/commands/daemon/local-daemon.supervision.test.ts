import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type DaemonLaunchRuntime,
  type DetachedDaemonProcess,
  resolveLocalDaemonState,
  startLocalDaemonDetached,
  startLocalDaemonForeground,
} from "./local-daemon.js";
import { startCommand } from "./start.js";

type RecordedDaemonLaunch =
  | {
      mode: "detached";
      command: string;
      args: string[];
      options: Parameters<DaemonLaunchRuntime["spawnDetached"]>[2];
    }
  | {
      mode: "foreground";
      command: string;
      args: string[];
      options: Parameters<DaemonLaunchRuntime["spawnForeground"]>[2];
    };

class FakeDaemonProcess extends EventEmitter implements DetachedDaemonProcess {
  pid = 4242;
  wasUnreferenced = false;

  unref(): void {
    this.wasUnreferenced = true;
  }
}

class FakeDaemonRuntime implements DaemonLaunchRuntime {
  readonly recordedLaunches: RecordedDaemonLaunch[] = [];
  readonly daemonProcess = new FakeDaemonProcess();
  foregroundStatus = 0;
  runnerEntry = "/repo/packages/server/scripts/supervisor-entrypoint.ts";

  resolveRunnerEntry(): string {
    return this.runnerEntry;
  }

  resolveHome(env: NodeJS.ProcessEnv): string {
    return env.PASEO_HOME ?? "/tmp/paseo";
  }

  spawnDetached(
    command: string,
    args: string[],
    options: Parameters<DaemonLaunchRuntime["spawnDetached"]>[2],
  ): DetachedDaemonProcess {
    this.recordedLaunches.push({ mode: "detached", command, args, options });
    return this.daemonProcess;
  }

  spawnForeground(
    command: string,
    args: string[],
    options: Parameters<DaemonLaunchRuntime["spawnForeground"]>[2],
  ) {
    this.recordedLaunches.push({ mode: "foreground", command, args, options });
    return { status: this.foregroundStatus, error: undefined };
  }
}

const tempRoots: string[] = [];

async function createPaseoHome(config: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-local-daemon-"));
  tempRoots.push(root);
  const paseoHome = path.join(root, ".paseo");
  await mkdir(paseoHome, { recursive: true });
  await writeFile(path.join(paseoHome, "config.json"), JSON.stringify(config, null, 2));
  return paseoHome;
}

function expectSupervisorLaunch(argv: string[]): void {
  const joined = argv.join(" ");
  expect(joined).toContain("supervisor-entrypoint");
  expect(joined).not.toContain("src/server/index.ts");
  expect(joined).not.toContain("dist/server/server/index.js");
  expect(joined).not.toContain("src/server/daemon-worker.ts");
  expect(joined).not.toContain("dist/server/server/daemon-worker.js");
}

describe("local daemon launch supervision", () => {
  test("daemon start registers positive and negative replay flags without defaults", () => {
    const options = startCommand().options;
    const flags = options.map((option) => option.long);
    expect(flags).toEqual(
      expect.arrayContaining(["--mcp", "--no-mcp", "--inject-mcp", "--no-inject-mcp"]),
    );
    for (const flag of ["--mcp", "--no-mcp", "--inject-mcp", "--no-inject-mcp"]) {
      expect(options.find((option) => option.long === flag)?.defaultValue).toBeUndefined();
    }
  });
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
    vi.restoreAllMocks();
  });

  test("foreground start spawns supervisor-entrypoint instead of server/index", async () => {
    const runtime = new FakeDaemonRuntime();

    const status = startLocalDaemonForeground({ home: "/tmp/paseo-test", relay: false }, runtime);

    expect(status).toBe(0);
    expect(runtime.recordedLaunches.map((launch) => launch.mode)).toEqual(["foreground"]);
    const launch = runtime.recordedLaunches[0];
    expect(launch?.mode).toBe("foreground");
    expect(launch?.command).toBe(process.execPath);
    expectSupervisorLaunch(launch?.args ?? []);
    expect(launch?.args).toContain("--no-relay");
  });

  test("detached start spawns supervisor-entrypoint instead of server/index", async () => {
    vi.useFakeTimers();
    const runtime = new FakeDaemonRuntime();

    const resultPromise = startLocalDaemonDetached(
      { home: "/tmp/paseo-test", mcp: false },
      runtime,
    );
    await vi.advanceTimersByTimeAsync(1200);
    const result = await resultPromise;

    expect(result).toEqual({ pid: 4242, logPath: "/tmp/paseo-test/daemon.log" });
    expect(runtime.daemonProcess.wasUnreferenced).toBe(true);
    expect(runtime.recordedLaunches.map((launch) => launch.mode)).toEqual(["detached"]);
    const launch = runtime.recordedLaunches[0];
    expect(launch?.mode).toBe("detached");
    expect(launch?.command).toBe(process.execPath);
    expectSupervisorLaunch(launch?.args ?? []);
    expect(launch?.args).toContain("--no-mcp");
  });
  test("positive MCP flags are passed to the supervised daemon", () => {
    const runtime = new FakeDaemonRuntime();

    startLocalDaemonForeground({ home: "/tmp/paseo-test", mcp: true, injectMcp: true }, runtime);

    const launch = runtime.recordedLaunches[0];
    expect(launch?.args).toContain("--mcp");
    expect(launch?.args).toContain("--inject-mcp");
  });

  test("omitted MCP flags preserve false persisted settings in lifecycle descriptor", async () => {
    vi.useFakeTimers();
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        relay: { enabled: false },
        mcp: { enabled: false, injectIntoAgents: false },
      },
      features: { webUi: { enabled: false } },
    });
    const runtime = new FakeDaemonRuntime();
    const resultPromise = startLocalDaemonDetached({ home }, runtime);
    await vi.advanceTimersByTimeAsync(1200);
    await resultPromise;

    const descriptor = JSON.parse(
      runtime.recordedLaunches[0]?.options?.env?.PASEO_LIFECYCLE_DESCRIPTOR ?? "{}",
    );
    expect(descriptor.mcpEnabled).toBe(false);
    expect(descriptor.mcpInjectIntoAgents).toBe(false);
    expect(descriptor.relayEnabled).toBe(false);
    expect(descriptor.webUiEnabled).toBe(false);
    expect(descriptor.launchOwned).toBeUndefined();
  });

  test("relay TLS flag is passed to the supervised daemon", async () => {
    const runtime = new FakeDaemonRuntime();

    const status = startLocalDaemonForeground(
      {
        home: "/tmp/paseo-test",
        relayUseTls: true,
      },
      runtime,
    );

    expect(status).toBe(0);
    expect(runtime.recordedLaunches.map((launch) => launch.mode)).toEqual(["foreground"]);
    const launch = runtime.recordedLaunches[0];
    expect(launch?.mode).toBe("foreground");
    expect(launch?.args).toContain("--relay-use-tls");
    expect(launch?.options?.env?.PASEO_RELAY_USE_TLS).toBe("true");
  });

  test("false relay TLS is passed explicitly to the supervised daemon", () => {
    const runtime = new FakeDaemonRuntime();
    const status = startLocalDaemonForeground(
      { home: "/tmp/paseo-test", relayUseTls: false },
      runtime,
    );
    expect(status).toBe(0);
    const launch = runtime.recordedLaunches[0];
    expect(launch?.args).toContain("--no-relay-use-tls");
    expect(launch?.options?.env?.PASEO_RELAY_USE_TLS).toBe("false");
  });

  test("web UI flag is passed to the supervised daemon", async () => {
    const runtime = new FakeDaemonRuntime();

    const status = startLocalDaemonForeground(
      {
        home: "/tmp/paseo-test",
        webUi: true,
      },
      runtime,
    );

    expect(status).toBe(0);
    expect(runtime.recordedLaunches.map((launch) => launch.mode)).toEqual(["foreground"]);
    const launch = runtime.recordedLaunches[0];
    expect(launch?.mode).toBe("foreground");
    expect(launch?.args).toContain("--web-ui");
    expect(launch?.options?.env?.PASEO_WEB_UI_ENABLED).toBe("true");
  });

  test("no-web UI flag is passed to the supervised daemon", async () => {
    const runtime = new FakeDaemonRuntime();

    const status = startLocalDaemonForeground(
      {
        home: "/tmp/paseo-test",
        webUi: false,
      },
      runtime,
    );

    expect(status).toBe(0);
    expect(runtime.recordedLaunches.map((launch) => launch.mode)).toEqual(["foreground"]);
    const launch = runtime.recordedLaunches[0];
    expect(launch?.mode).toBe("foreground");
    expect(launch?.args).toContain("--no-web-ui");
    expect(launch?.options?.env?.PASEO_WEB_UI_ENABLED).toBe("false");
  });

  test("local daemon state keeps public relay TLS separate from daemon relay TLS", async () => {
    const home = await createPaseoHome({
      version: 1,
      daemon: {
        relay: {
          endpoint: "10.0.0.5:51185",
          publicEndpoint: "paseo.example.com",
          useTls: false,
          publicUseTls: true,
        },
      },
    });

    const state = resolveLocalDaemonState({ home });

    expect(state.relayEndpoint).toBe("paseo.example.com");
    expect(state.relayUseTls).toBe(false);
    expect(state.relayPublicUseTls).toBe(true);
  });
  test("detached CLI start emits lifecycle owner, descriptor, revision, and closure root", async () => {
    vi.useFakeTimers();
    const runtime = new FakeDaemonRuntime();
    const resultPromise = startLocalDaemonDetached(
      {
        home: "/tmp/paseo-test",
        listen: "127.0.0.1:6769",
        relay: false,
        mcp: false,
        injectMcp: true,
        webUi: true,
        hostnames: "localhost,.example.com",
        sourceRevision: "rev-test",
        closureRoot: "/nix/store/paseo-test",
      },
      runtime,
    );
    await vi.advanceTimersByTimeAsync(1200);
    await resultPromise;
    const env = runtime.recordedLaunches[0]?.options?.env;
    expect(env?.PASEO_LIFECYCLE_MANAGER).toBe("cli");
    expect(env?.PASEO_LIFECYCLE_SOURCE_REVISION).toBe("rev-test");
    expect(env?.PASEO_LIFECYCLE_CLOSURE_ROOT).toBe("/nix/store/paseo-test");
    expect(JSON.parse(env?.PASEO_LIFECYCLE_DESCRIPTOR ?? "{}")).toMatchObject({
      listen: "127.0.0.1:6769",
      relayEnabled: false,
      mcpEnabled: false,
      mcpInjectIntoAgents: true,
      webUiEnabled: true,
      hostnames: ["localhost", ".example.com"],
    });
    expect(JSON.parse(env?.PASEO_LIFECYCLE_DESCRIPTOR ?? "{}").launchOwned).toEqual({
      relayEnabled: true,
      mcpEnabled: true,
      mcpInjectIntoAgents: true,
      webUiEnabled: true,
      hostnames: true,
    });
  });

  test("derives rooted lifecycle metadata for ordinary packaged starts", async () => {
    vi.useFakeTimers();
    const root = await mkdtemp(path.join(os.tmpdir(), "paseo-rooted-metadata-"));
    tempRoots.push(root);
    const dataHome = path.join(root, "data");
    const releases = path.join(dataHome, "paseo", "releases");
    await mkdir(releases, { recursive: true });
    await symlink("roots/rooted-revision", path.join(releases, "current"));
    vi.stubEnv("HOME", root);
    vi.stubEnv("XDG_DATA_HOME", dataHome);
    const runtime = new FakeDaemonRuntime();
    runtime.runnerEntry = "/nix/store/hash-paseo/lib/paseo/server-entry.js";
    const resultPromise = startLocalDaemonDetached({ home: path.join(root, ".paseo") }, runtime);
    await vi.advanceTimersByTimeAsync(1200);
    await resultPromise;
    const env = runtime.recordedLaunches[0]?.options?.env;
    expect(env?.PASEO_LIFECYCLE_SOURCE_REVISION).toBe("rooted-revision");
    expect(env?.PASEO_LIFECYCLE_CLOSURE_ROOT).toBe("/nix/store/hash-paseo");
  });
});
