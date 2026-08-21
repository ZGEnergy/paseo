import { Command } from "commander";
import type { CommandOptions, OutputSchema, SingleResult } from "../../output/index.js";
import { withOutput } from "../../output/index.js";
import { addJsonOption } from "../../utils/command-options.js";
import {
  bootstrapLocalDaemon,
  installStableLauncher,
  upgradeLocalDaemon,
  type LocalUpgradeResult,
} from "./local-upgrade.js";
import { resolveLocalPaseoHome } from "./local-daemon.js";

export const HOST_SHELL_UPGRADE_ERROR =
  "upgrade must run from a host shell, not a Paseo agent or workspace terminal";

export function assertHostShellUpgrade(
  env: { PASEO_AGENT_ID?: string; PASEO_WORKSPACE_ID?: string } = process.env,
): void {
  if (env.PASEO_AGENT_ID?.trim() || env.PASEO_WORKSPACE_ID?.trim()) {
    throw new Error(HOST_SHELL_UPGRADE_ERROR);
  }
}

interface UpgradeCommandOptions extends CommandOptions {
  checkout?: string;
  home?: string;
  revision?: string;
  stagedRoot?: string;
  timeout?: string;
}

interface BootstrapCommandOptions extends UpgradeCommandOptions {
  listen?: string;
  relay?: string;
  relayUseTls?: string;
  mcp?: string;
  injectMcp?: string;
  webUi?: string;
  hostnames?: string;
}

const resultSchema: OutputSchema<LocalUpgradeResult> = {
  idField: "revision",
  columns: [
    { header: "ACTION", field: "action" },
    { header: "REVISION", field: "revision" },
    { header: "CURRENT ROOT", field: "currentRoot" },
    { header: "PREVIOUS ROOT", field: (value) => value.previousRoot ?? "-" },
    { header: "PID", field: (value) => value.observed.pid },
    { header: "SERVER ID", field: (value) => value.observed.serverId },
    { header: "LISTEN", field: (value) => value.observed.listen },
    { header: "ROLLBACK", field: "rollback" },
    { header: "LOG", field: (value) => value.logPath ?? "-" },
  ],
  serialize: (value) => value,
};

function parseTimeout(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) {
    throw new Error("--timeout must be between 0 and 3600 seconds");
  }
  return Math.round(seconds * 1000);
}

function requireOption(value: string | undefined, name: string): string {
  if (!value || !value.trim()) throw new Error(`${name} is required for bootstrap-upgrade`);
  return value.trim();
}

function parseBooleanOption(value: string | undefined, name: string): boolean {
  const normalized = requireOption(value, name).toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be true or false`);
}

function parseHostnamesOption(value: string | undefined): true | string[] | null {
  const raw = requireOption(value, "--hostnames");
  const normalized = raw.toLowerCase();
  if (!normalized || ["false", "none", "null", "off", "disabled"].includes(normalized)) return null;
  if (normalized === "true") return true;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function installStableLauncherNonFatal(value: LocalUpgradeResult): Promise<void> {
  try {
    await installStableLauncher(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `warning: daemon upgraded, but stable paseo launcher was not installed: ${message}`,
    );
  }
}

function result(value: LocalUpgradeResult): SingleResult<LocalUpgradeResult> {
  return { type: "single", data: value, schema: resultSchema };
}

export async function runUpgradeLocalCommand(
  options: UpgradeCommandOptions,
): Promise<SingleResult<LocalUpgradeResult>> {
  assertHostShellUpgrade();
  const home = resolveLocalPaseoHome(options.home);
  const value = await upgradeLocalDaemon({
    home,
    checkout: options.checkout ?? process.cwd(),
    revision: options.revision,
    stagedRoot: options.stagedRoot,
    timeoutMs: parseTimeout(options.timeout),
  });
  await installStableLauncherNonFatal(value);
  return result(value);
}

export async function runBootstrapUpgradeCommand(
  options: BootstrapCommandOptions,
): Promise<SingleResult<LocalUpgradeResult>> {
  assertHostShellUpgrade();
  const home = resolveLocalPaseoHome(options.home);
  const descriptor = {
    listen: requireOption(options.listen, "--listen"),
    relayEnabled: parseBooleanOption(options.relay, "--relay"),
    relayUseTls: parseBooleanOption(options.relayUseTls, "--relay-use-tls"),
    mcpEnabled: parseBooleanOption(options.mcp, "--mcp"),
    mcpInjectIntoAgents: parseBooleanOption(options.injectMcp, "--inject-mcp"),
    webUiEnabled: parseBooleanOption(options.webUi, "--web-ui"),
    hostnames: parseHostnamesOption(options.hostnames),
  };
  const value = await bootstrapLocalDaemon({
    home,
    checkout: options.checkout ?? process.cwd(),
    revision: options.revision,
    stagedRoot: options.stagedRoot,
    timeoutMs: parseTimeout(options.timeout),
    descriptor,
  });
  await installStableLauncherNonFatal(value);
  return result(value);
}

export function upgradeLocalCommand(): Command {
  return addJsonOption(
    new Command("upgrade-local")
      .description("Upgrade a CLI-managed local daemon through a rooted Nix closure")
      .option("--checkout <path>", "Clean internal/main checkout", process.cwd())
      .option("--revision <revision>", "Expected checkout revision")
      .option("--staged-root <path>", "Already-built staged Nix closure root")
      .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
      .option("--timeout <seconds>", "Health timeout in seconds (default: 30)")
      .action(
        withOutput((...args) => {
          const [options] = args.slice(-2) as [UpgradeCommandOptions, Command];
          return runUpgradeLocalCommand(options);
        }),
      ),
  );
}

export function bootstrapUpgradeCommand(): Command {
  return addJsonOption(
    new Command("bootstrap-upgrade")
      .description("Bootstrap a legacy daemon with explicit launch values")
      .requiredOption("--listen <listen>", "Explicit listen target")
      .requiredOption("--relay <true|false>", "Explicit relay setting")
      .requiredOption("--relay-use-tls <true|false>", "Explicit relay TLS setting")
      .requiredOption("--mcp <true|false>", "Explicit Agent MCP setting")
      .requiredOption("--inject-mcp <true|false>", "Explicit MCP injection setting")
      .requiredOption("--web-ui <true|false>", "Explicit web UI setting")
      .requiredOption("--hostnames <hosts>", "Explicit hostnames, false/none, or true")
      .option("--checkout <path>", "Clean internal/main checkout", process.cwd())
      .option("--revision <revision>", "Expected checkout revision")
      .option("--staged-root <path>", "Already-built staged Nix closure root")
      .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
      .option("--timeout <seconds>", "Health timeout in seconds (default: 30)")
      .action(
        withOutput((...args) => {
          const [options] = args.slice(-2) as [BootstrapCommandOptions, Command];
          return runBootstrapUpgradeCommand(options);
        }),
      ),
  );
}
