import { Command, Option } from "commander";
import { startCommand } from "./start.js";
import { runStatusCommand } from "./status.js";
import { runStopCommand } from "./stop.js";
import { runRestartCommand } from "./restart.js";
import { runSetPasswordCommand } from "./set-password.js";
import { pairCommand } from "./pair.js";
import { runDaemonReloadCommand } from "./reload.js";
import { upgradeLocalCommand, bootstrapUpgradeCommand } from "./upgrade.js";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions, addJsonOption } from "../../utils/command-options.js";
function resolveHostnamesOption(hostnames: unknown, allowedHosts: unknown): string | undefined {
  if (typeof hostnames === "string") return hostnames;
  if (typeof allowedHosts === "string") return allowedHosts;
  return undefined;
}

export function createDaemonCommand(): Command {
  const daemon = new Command("daemon").description("Manage the Paseo daemon");

  daemon.addCommand(startCommand());
  daemon.addCommand(upgradeLocalCommand());
  daemon.addCommand(bootstrapUpgradeCommand());
  daemon.addCommand(pairCommand());

  addJsonAndDaemonHostOptions(
    daemon.command("reload").description("Reload config.json without restarting the daemon"),
  ).action(withOutput(runDaemonReloadCommand));

  addJsonOption(daemon.command("status").description("Show local daemon status"))
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .action(withOutput(runStatusCommand));

  addJsonOption(daemon.command("stop").description("Stop the local daemon"))
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .option("--timeout <seconds>", "Wait timeout before failing (default: 15)")
    .option("--force", "Send SIGKILL if graceful stop times out")
    .option("--kill-timeout <seconds>", "Wait after SIGKILL before failing (default: 3)")
    .action(withOutput(runStopCommand));

  addJsonOption(daemon.command("restart").description("Restart the local daemon"))
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .option("--timeout <seconds>", "Wait timeout before force step (default: 15)")
    .option("--force", "Send SIGKILL if graceful stop times out")
    .option(
      "--listen <listen>",
      "Listen target for restarted daemon (host:port, port, or unix socket)",
    )
    .option("--port <port>", "Port for restarted daemon listen target")
    .addOption(
      new Option("--relay-use-tls", "Use wss:// for relay on restarted daemon").default(undefined),
    )
    .addOption(
      new Option("--no-relay-use-tls", "Use ws:// for relay on restarted daemon").default(
        undefined,
      ),
    )
    .addOption(new Option("--mcp", "Enable Agent MCP on restarted daemon").default(undefined))
    .addOption(new Option("--no-mcp", "Disable Agent MCP on restarted daemon").default(undefined))
    .addOption(
      new Option("--inject-mcp", "Enable auto-injecting the Paseo MCP into created agents").default(
        undefined,
      ),
    )
    .addOption(
      new Option(
        "--no-inject-mcp",
        "Disable auto-injecting the Paseo MCP into created agents",
      ).default(undefined),
    )
    .addOption(
      new Option("--web-ui", "Enable the bundled daemon web UI on restarted daemon").default(
        undefined,
      ),
    )
    .addOption(
      new Option("--no-web-ui", "Disable the bundled daemon web UI on restarted daemon").default(
        undefined,
      ),
    )
    .option(
      "--hostnames <hosts>",
      'Daemon hostnames (comma-separated, e.g. "myhost,.example.com" or "true" for any)',
    )
    .addOption(new Option("--allowed-hosts <hosts>").hideHelp())
    .action(
      withOutput((...args) => {
        const [options, command] = args.slice(-2) as [(typeof args)[number], Command];
        return runRestartCommand(
          {
            ...options,
            hostnames: resolveHostnamesOption(options.hostnames, options.allowedHosts),
          },
          command,
        );
      }),
    );

  addJsonOption(
    daemon
      .command("set-password")
      .description("Prompt for and save a hashed daemon password to config.json"),
  )
    .option("--home <path>", "Paseo home directory (default: ~/.paseo)")
    .action(withOutput(runSetPasswordCommand));

  return daemon;
}
