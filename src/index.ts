#!/usr/bin/env bun
import { program } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./components/App.js";
import { runStatus } from "./commands/status.js";
import { runPull } from "./commands/pull.js";
import { runClone } from "./commands/clone.js";
import { runClean } from "./commands/clean.js";
import { runConfig } from "./commands/config.js";
import { runInit } from "./commands/init.js";
import { runFetch } from "./commands/fetch.js";
import { runDiff } from "./commands/diff.js";
import { runCheckout } from "./commands/checkout.js";
import { runExec } from "./commands/exec.js";
import { runList } from "./commands/list.js";
import { runSync } from "./commands/sync.js";
import { runLabelAdd, runLabelList, runLabelRemove } from "./commands/label.js";
import {
  assertOverviewCoverage,
  assertProgramRegistrationCoverage,
  getCommandDefinition,
} from "./command-registry.js";
import packageJson from "../package.json";

const VERSION = packageJson.version;

function commandDescription(id: string): string {
  return getCommandDefinition(id).description;
}

function showDeprecationWarning(oldName: string, newName: string) {
  console.warn(
    `\x1b[33mWarning: 'repos ${oldName}' is deprecated. Use 'repos ${newName}' instead.\x1b[0m\n`
  );
}

function collectOption(value: string, previous: string[] = []): string[] {
  previous.push(value);
  return previous;
}

program
  .name("repos")
  .description("A CLI tool for managing multiple git repositories")
  .version(VERSION);

program.action(async () => {
  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
  process.exit(0);
});

program
  .command("init")
  .description(commandDescription("init"))
  .option("-f, --force", "Overwrite existing configuration")
  .action(async (options) => {
    await runInit(options.force);
  });

program
  .command("status")
  .description(commandDescription("status"))
  .option("-s, --summary", "Show only summary counts")
  .option("-q, --quiet", "Minimal output, only show repos with changes")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("--fetch", "Fetch from remotes before checking status")
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (options) => {
    await runStatus({
      summary: options.summary,
      quiet: options.quiet,
      filter: options.filter,
      fetch: options.fetch,
      noExclude: options.exclude,
    });
  });

program
  .command("fetch")
  .description(commandDescription("fetch"))
  .option("-n, --dry-run", "Show what would be fetched without fetching")
  .option("-q, --quiet", "Minimal output")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .option("--prune", "Remove remote-tracking references that no longer exist")
  .option("-a, --all", "Fetch from all remotes")
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (options) => {
    await runFetch({
      dryRun: options.dryRun,
      quiet: options.quiet,
      filter: options.filter,
      parallel: options.parallel,
      prune: options.prune,
      all: options.all,
      noExclude: options.exclude,
    });
  });

program
  .command("pull")
  .description(commandDescription("pull"))
  .option("-n, --dry-run", "Show what would be updated without pulling")
  .option("-q, --quiet", "Minimal output")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (options) => {
    await runPull({
      dryRun: options.dryRun,
      quiet: options.quiet,
      filter: options.filter,
      parallel: options.parallel,
      noExclude: options.exclude,
    });
  });

program
  .command("update")
  .description(commandDescription("update"))
  .option("-n, --dry-run", "Show what would be updated without pulling")
  .option("-q, --quiet", "Minimal output")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (options) => {
    showDeprecationWarning("update", "pull");
    await runPull({
      dryRun: options.dryRun,
      quiet: options.quiet,
      filter: options.filter,
      parallel: options.parallel,
      noExclude: options.exclude,
    });
  });

program
  .command("clone")
  .description(commandDescription("clone"))
  .option("-n, --dry-run", "Show what would be cloned without cloning")
  .option("-o, --org <name>", "GitHub organization or username")
  .option("-h, --host <host>", "GitHub host (default: github.com)")
  .option("-d, --days <number>", "Activity threshold in days", parseInt)
  .option("-p, --parallel <number>", "Number of parallel clone operations (default: 10)", parseInt)
  .option("-s, --shallow", "Shallow clone (faster, uses less disk space)")
  .action(async (options) => {
    await runClone({
      dryRun: options.dryRun,
      org: options.org,
      host: options.host,
      days: options.days,
      parallel: options.parallel,
      shallow: options.shallow,
    });
  });

program
  .command("clean")
  .description(commandDescription("clean"))
  .option("-n, --dry-run", "Show what would be cleaned without cleaning")
  .option("--force", "Skip confirmation prompt")
  .option("-a, --all", "Also remove untracked files")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (options) => {
    await runClean({
      dryRun: options.dryRun,
      force: options.force,
      all: options.all,
      filter: options.filter,
      noExclude: options.exclude,
    });
  });

program
  .command("cleanup")
  .description(commandDescription("cleanup"))
  .option("-n, --dry-run", "Show what would be cleaned without cleaning")
  .option("-f, --force", "Skip confirmation prompt")
  .option("-a, --all", "Also remove untracked files")
  .option("--filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (options) => {
    showDeprecationWarning("cleanup", "clean");
    await runClean({
      dryRun: options.dryRun,
      force: options.force,
      all: options.all,
      filter: options.filter,
      noExclude: options.exclude,
    });
  });

program
  .command("diff")
  .description(commandDescription("diff"))
  .option("-q, --quiet", "Only list repos with changes (no diff output)")
  .option("--stat", "Show diffstat summary instead of full diff")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .option("-m, --max-lines <number>", "Max lines per diff (default: 500, 0 for unlimited)", parseInt)
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (options) => {
    await runDiff({
      quiet: options.quiet,
      stat: options.stat,
      filter: options.filter,
      parallel: options.parallel,
      maxLines: options.maxLines,
      noExclude: options.exclude,
    });
  });

program
  .command("checkout <branch>")
  .description(commandDescription("checkout"))
  .option("-b, --create", "Create branch if it doesn't exist")
  .option("--force", "Skip repos with uncommitted changes")
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (branch, options) => {
    await runCheckout({
      branch,
      create: options.create,
      force: options.force,
      filter: options.filter,
      parallel: options.parallel,
      noExclude: options.exclude,
    });
  });

program
  .command("exec <command>")
  .description(commandDescription("exec"))
  .option("-q, --quiet", "Only show output for repos with non-empty results")
  .option("-p, --parallel <number>", "Number of parallel operations", parseInt)
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-d, --days <number>", "Only include repos locally active in the last N days", parseInt)
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (command, options) => {
    await runExec({
      command,
      quiet: options.quiet,
      parallel: options.parallel,
      filter: options.filter,
      days: options.days,
      noExclude: options.exclude,
    });
  });

program
  .command("list")
  .alias("ls")
  .description(commandDescription("list"))
  .option("-f, --filter <pattern>", "Filter repos by pattern (e.g., 'api-*')")
  .option("-d, --days <number>", "Only include repos locally active in the last N days", parseInt)
  .option("--no-exclude", "Include repos excluded by config/DB")
  .action(async (options) => {
    await runList({
      filter: options.filter,
      days: options.days,
      noExclude: options.exclude,
    });
  });

program
  .command("sync")
  .description(commandDescription("sync"))
  .action(async () => {
    await runSync();
  });

const labelCommand = program
  .command("label")
  .description(commandDescription("label"));

labelCommand
  .command("add <label> [repos...]")
  .description("Add a label to matching repositories")
  .option("-g, --glob <pattern>", "Add repositories by glob pattern", collectOption, [])
  .action(async (label, repos, options) => {
    await runLabelAdd(label, repos ?? [], {
      globs: options.glob,
    });
  });

labelCommand
  .command("rm <label> [repos...]")
  .description("Remove a label from matching repositories")
  .option("-g, --glob <pattern>", "Remove repositories by glob pattern", collectOption, [])
  .action(async (label, repos, options) => {
    await runLabelRemove(label, repos ?? [], {
      globs: options.glob,
    });
  });

labelCommand
  .command("list [repos...]")
  .description("List repository labels")
  .action(async () => {
    await runLabelList();
  });

program
  .command("config")
  .description(commandDescription("config"))
  .option("-g, --get <key>", "Get a specific config value")
  .option("-s, --set <key>", "Set a config value")
  .option("-v, --value <value>", "Value to set")
  .option("-l, --list", "List all config values")
  .option("--location <loc>", "Config file location (global)")
  .action(async (options) => {
    await runConfig({
      get: options.get,
      set: options.set,
      value: options.value,
      list: options.list || (!options.get && !options.set),
      location: options.location,
    });
  });

assertOverviewCoverage();
assertProgramRegistrationCoverage(program.commands.map((command) => command.name()));

program.parse();
