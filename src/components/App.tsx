import { useState, useEffect, useCallback } from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import { StatusApp } from "../commands/status.js";
import { PullApp } from "../commands/pull.js";
import { CloneApp } from "../commands/clone.js";
import { CleanApp } from "../commands/clean.js";
import { ConfigApp } from "../commands/config.js";
import { InitApp } from "../commands/init.js";
import { FetchApp } from "../commands/fetch.js";
import { DiffApp } from "../commands/diff.js";
import { CheckoutApp } from "../commands/checkout.js";
import { ExecApp } from "../commands/exec.js";
import { ListApp } from "../commands/list.js";
import { ExcludeMenuApp } from "../commands/exclude-menu.js";
import { SyncApp } from "../commands/sync.js";
import { LabelMenuApp } from "../commands/label-menu.js";
import { loadConfig } from "../lib/config.js";
import { selectLocalRepos } from "../lib/repo-selection.js";
import { OptionsForm, type FormField } from "./OptionsForm.js";
import { GroupedMenu, type MenuItem, type MenuGroup } from "./GroupedMenu.js";
import {
  assertOverviewCoverage,
  getOverviewMenuGroups,
} from "../command-registry.js";
import type {
  ReposConfig,
  StatusOptions,
  UpdateOptions,
  CloneOptions,
  CleanupOptions,
  FetchOptions,
  DiffOptions,
  CheckoutOptions,
  ExecOptions,
  ListOptions,
} from "../types.js";

type Command =
  | "status"
  | "fetch"
  | "pull"
  | "diff"
  | "checkout"
  | "clone"
  | "clean"
  | "exec"
  | "list"
  | "exclude"
  | "sync"
  | "label"
  | "config"
  | "init";

assertOverviewCoverage();

const menuGroups: MenuGroup[] = getOverviewMenuGroups();

function parseLabelsInput(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCommandFields(
  command: Command,
  config: ReposConfig,
): FormField[] | null {
  const defaultOrg = config.org || undefined;
  const defaultDays = config.daysThreshold ?? 90;
  const defaultParallel = config.parallel ?? 10;

  switch (command) {
    case "clone":
      return [
        {
          name: "dryRun",
          label: "Dry run",
          type: "toggle",
          defaultValue: false,
          hint: "Preview what would be cloned without actually cloning",
        },
        {
          name: "shallow",
          label: "Shallow clone",
          type: "toggle",
          defaultValue: false,
          hint: "Faster cloning with less disk space (no full history)",
        },
        {
          name: "org",
          label: "Organization",
          type: "text",
          defaultValue: defaultOrg,
          placeholder: defaultOrg ? `default: ${defaultOrg}` : "not configured",
          hint: "GitHub organization or username to clone from",
        },
        {
          name: "days",
          label: "Days threshold",
          type: "number",
          defaultValue: defaultDays,
          placeholder: `default: ${defaultDays}`,
          hint: "Only clone repos active within this many days",
        },
        {
          name: "parallel",
          label: "Parallel jobs",
          type: "number",
          defaultValue: defaultParallel,
          placeholder: `default: ${defaultParallel}`,
          hint: "Number of concurrent clone operations",
        },
      ];

    case "fetch":
      return [
        {
          name: "dryRun",
          label: "Dry run",
          type: "toggle",
          defaultValue: false,
          hint: "Preview what would be fetched without actually fetching",
        },
        {
          name: "prune",
          label: "Prune",
          type: "toggle",
          defaultValue: false,
          hint: "Remove remote-tracking references that no longer exist",
        },
        {
          name: "all",
          label: "Fetch all remotes",
          type: "toggle",
          defaultValue: false,
          hint: "Fetch from all configured remotes",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only fetch repos matching this pattern",
        },
        {
          name: "parallel",
          label: "Parallel jobs",
          type: "number",
          defaultValue: defaultParallel,
          placeholder: `default: ${defaultParallel}`,
          hint: "Number of concurrent fetch operations",
        },
        {
          name: "labels",
          label: "Labels",
          type: "text",
          placeholder: "e.g., backend,critical",
          hint: "Only include repos matching all listed labels",
        },
        {
          name: "noExclude",
          label: "Include excluded repos",
          type: "toggle",
          defaultValue: false,
          hint: "Bypass exclusion rules and include all discovered repos",
        },
        {
          name: "bypassOrg",
          label: "Bypass org scope",
          type: "toggle",
          defaultValue: false,
          hint: "Include repos outside configured org",
        },
      ];

    case "pull":
      return [
        {
          name: "dryRun",
          label: "Dry run",
          type: "toggle",
          defaultValue: false,
          hint: "Preview what would be updated without actually pulling",
        },
        {
          name: "quiet",
          label: "Quiet mode",
          type: "toggle",
          defaultValue: false,
          hint: "Minimal output",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only pull repos matching this pattern",
        },
        {
          name: "parallel",
          label: "Parallel jobs",
          type: "number",
          defaultValue: defaultParallel,
          placeholder: `default: ${defaultParallel}`,
          hint: "Number of concurrent pull operations",
        },
        {
          name: "labels",
          label: "Labels",
          type: "text",
          placeholder: "e.g., backend,critical",
          hint: "Only include repos matching all listed labels",
        },
        {
          name: "noExclude",
          label: "Include excluded repos",
          type: "toggle",
          defaultValue: false,
          hint: "Bypass exclusion rules and include all discovered repos",
        },
        {
          name: "bypassOrg",
          label: "Bypass org scope",
          type: "toggle",
          defaultValue: false,
          hint: "Include repos outside configured org",
        },
      ];

    case "diff":
      return [
        {
          name: "quiet",
          label: "List only",
          type: "toggle",
          defaultValue: false,
          hint: "Only list repos with changes (no diff output)",
        },
        {
          name: "stat",
          label: "Show stat",
          type: "toggle",
          defaultValue: false,
          hint: "Show diffstat summary instead of full diff",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only check repos matching this pattern",
        },
        {
          name: "parallel",
          label: "Parallel jobs",
          type: "number",
          defaultValue: defaultParallel,
          placeholder: `default: ${defaultParallel}`,
          hint: "Number of concurrent diff operations",
        },
        {
          name: "labels",
          label: "Labels",
          type: "text",
          placeholder: "e.g., backend,critical",
          hint: "Only include repos matching all listed labels",
        },
        {
          name: "noExclude",
          label: "Include excluded repos",
          type: "toggle",
          defaultValue: false,
          hint: "Bypass exclusion rules and include all discovered repos",
        },
        {
          name: "bypassOrg",
          label: "Bypass org scope",
          type: "toggle",
          defaultValue: false,
          hint: "Include repos outside configured org",
        },
      ];

    case "checkout":
      return [
        {
          name: "branch",
          label: "Branch name",
          type: "text",
          placeholder: "e.g., main, develop",
          hint: "Branch to checkout across all repos",
        },
        {
          name: "create",
          label: "Create if missing",
          type: "toggle",
          defaultValue: false,
          hint: "Create branch if it doesn't exist (-b flag)",
        },
        {
          name: "force",
          label: "Skip dirty repos",
          type: "toggle",
          defaultValue: false,
          hint: "Skip repos with uncommitted changes",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only checkout in repos matching this pattern",
        },
        {
          name: "parallel",
          label: "Parallel jobs",
          type: "number",
          defaultValue: defaultParallel,
          placeholder: `default: ${defaultParallel}`,
          hint: "Number of concurrent checkout operations",
        },
        {
          name: "labels",
          label: "Labels",
          type: "text",
          placeholder: "e.g., backend,critical",
          hint: "Only include repos matching all listed labels",
        },
        {
          name: "noExclude",
          label: "Include excluded repos",
          type: "toggle",
          defaultValue: false,
          hint: "Bypass exclusion rules and include all discovered repos",
        },
        {
          name: "bypassOrg",
          label: "Bypass org scope",
          type: "toggle",
          defaultValue: false,
          hint: "Include repos outside configured org",
        },
      ];

    case "exec":
      return [
        {
          name: "command",
          label: "Command",
          type: "text",
          placeholder: "e.g., git log -1 --oneline",
          hint: "Shell command to run in each repository",
          required: true,
        },
        {
          name: "quiet",
          label: "Quiet mode",
          type: "toggle",
          defaultValue: false,
          hint: "Only show output for repos with non-empty results",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only run in repos matching this pattern",
        },
        {
          name: "parallel",
          label: "Parallel jobs",
          type: "number",
          defaultValue: defaultParallel,
          placeholder: `default: ${defaultParallel}`,
          hint: "Number of concurrent operations",
        },
        {
          name: "labels",
          label: "Labels",
          type: "text",
          placeholder: "e.g., backend,critical",
          hint: "Only include repos matching all listed labels",
        },
        {
          name: "noExclude",
          label: "Include excluded repos",
          type: "toggle",
          defaultValue: false,
          hint: "Bypass exclusion rules and include all discovered repos",
        },
        {
          name: "bypassOrg",
          label: "Bypass org scope",
          type: "toggle",
          defaultValue: false,
          hint: "Include repos outside configured org",
        },
      ];

    case "list":
      return [
        {
          name: "days",
          label: "Days threshold",
          type: "number",
          defaultValue: undefined,
          placeholder: "optional",
          hint: "Only include repositories locally active in last N days",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only include repos matching this pattern",
        },
        {
          name: "labels",
          label: "Labels",
          type: "text",
          placeholder: "e.g., backend,critical",
          hint: "Only include repos matching all listed labels",
        },
        {
          name: "noExclude",
          label: "Include excluded repos",
          type: "toggle",
          defaultValue: false,
          hint: "Bypass exclusion rules and include all discovered repos",
        },
        {
          name: "bypassOrg",
          label: "Bypass org scope",
          type: "toggle",
          defaultValue: false,
          hint: "Include repos outside configured org",
        },
      ];

    case "exclude":
      return [
        {
          name: "repos",
          label: "Repo dirs",
          type: "text",
          placeholder: "space-separated dirs (optional)",
          hint: "Directories to exclude (relative to code dir)",
        },
        {
          name: "globs",
          label: "Globs",
          type: "text",
          placeholder: "space-separated globs (optional)",
          hint: "Glob patterns to match and exclude",
        },
        {
          name: "bypassOrg",
          label: "Bypass org scope",
          type: "toggle",
          defaultValue: false,
          hint: "Include repos outside configured org",
        },
      ];

    case "status":
      return [
        {
          name: "fetch",
          label: "Fetch from remotes",
          type: "toggle",
          defaultValue: false,
          hint: "Fetch from remotes first to get accurate behind/ahead counts",
        },
        {
          name: "summary",
          label: "Summary only",
          type: "toggle",
          defaultValue: false,
          hint: "Show only summary counts",
        },
        {
          name: "quiet",
          label: "Quiet mode",
          type: "toggle",
          defaultValue: false,
          hint: "Only show repos with changes",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only show repos matching this pattern",
        },
        {
          name: "labels",
          label: "Labels",
          type: "text",
          placeholder: "e.g., backend,critical",
          hint: "Only include repos matching all listed labels",
        },
        {
          name: "noExclude",
          label: "Include excluded repos",
          type: "toggle",
          defaultValue: false,
          hint: "Bypass exclusion rules and include all discovered repos",
        },
        {
          name: "bypassOrg",
          label: "Bypass org scope",
          type: "toggle",
          defaultValue: false,
          hint: "Include repos outside configured org",
        },
      ];

    case "clean":
      return [
        {
          name: "dryRun",
          label: "Dry run",
          type: "toggle",
          defaultValue: false,
          hint: "Preview what would be cleaned without actually cleaning",
        },
        {
          name: "all",
          label: "Remove untracked files",
          type: "toggle",
          defaultValue: false,
          hint: "Also remove untracked files (careful!)",
        },
        {
          name: "filter",
          label: "Filter pattern",
          type: "text",
          placeholder: "e.g., api-*",
          hint: "Only clean repos matching this pattern",
        },
        {
          name: "labels",
          label: "Labels",
          type: "text",
          placeholder: "e.g., backend,critical",
          hint: "Only include repos matching all listed labels",
        },
        {
          name: "noExclude",
          label: "Include excluded repos",
          type: "toggle",
          defaultValue: false,
          hint: "Bypass exclusion rules and include all discovered repos",
        },
        {
          name: "bypassOrg",
          label: "Bypass org scope",
          type: "toggle",
          defaultValue: false,
          hint: "Include repos outside configured org",
        },
      ];

    default:
      return null;
  }
}

const commandTitles: Partial<Record<Command, string>> = {
  clone: "Clone Options",
  fetch: "Fetch Options",
  pull: "Pull Options",
  diff: "Diff Options",
  checkout: "Checkout Options",
  exec: "Exec Options",
  list: "List Options",
  exclude: "Exclude Options",
  status: "Status Options",
  clean: "Clean Options",
};

const commandsWithOptions: Command[] = [
  "clone",
  "fetch",
  "pull",
  "diff",
  "checkout",
  "exec",
  "list",
  "exclude",
  "status",
  "clean",
];

type AppState = "menu" | "loading" | "options" | "running";

type CommandOptions =
  | { command: "status"; options: StatusOptions }
  | { command: "fetch"; options: FetchOptions }
  | { command: "pull"; options: UpdateOptions }
  | { command: "diff"; options: DiffOptions }
  | { command: "checkout"; options: CheckoutOptions }
  | { command: "exec"; options: ExecOptions }
  | { command: "list"; options: ListOptions }
  | {
      command: "exclude";
      options: { repos: string[]; globs: string[]; bypassOrg?: boolean };
    }
  | { command: "clone"; options: CloneOptions }
  | { command: "clean"; options: CleanupOptions }
  | { command: "sync" }
  | { command: "label" }
  | { command: "config" }
  | { command: "init" };

export function App() {
  const { stdout } = useStdout();
  const [state, setState] = useState<AppState>("menu");
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);
  const [config, setConfig] = useState<ReposConfig | null>(null);
  const [runningCommand, setRunningCommand] = useState<CommandOptions | null>(
    null,
  );
  const [repoCount, setRepoCount] = useState<number | null>(null);

  useEffect(() => {
    selectLocalRepos({ noExclude: true })
      .then((repos) => setRepoCount(repos.length))
      .catch(() => {}); // Silently handle errors - count stays null
  }, []);

  useEffect(() => {
    if (state === "loading" && selectedCommand) {
      loadConfig().then((cfg) => {
        setConfig(cfg);
        setState("options");
      });
    }
  }, [state, selectedCommand]);

  const handleSelect = async (item: MenuItem) => {
    const command = item.value as Command;

    if (commandsWithOptions.includes(command)) {
      setSelectedCommand(command);
      setState("loading");
      return;
    }

    setState("running");

    switch (command) {
      case "sync":
        setRunningCommand({ command: "sync" });
        break;
      case "label":
        setRunningCommand({ command: "label" });
        break;
      case "config":
        setRunningCommand({ command: "config" });
        break;
      case "init":
        setRunningCommand({ command: "init" });
        break;
    }
  };

  const handleCommandComplete = useCallback(() => {
    stdout?.write("\x1B[2J\x1B[H");
    setRunningCommand(null);
    setSelectedCommand(null);
    setConfig(null);
    setState("menu");
  }, [stdout]);

  const handleOptionsSubmit = (
    values: Record<string, boolean | string | number | undefined>,
  ) => {
    setState("running");

    switch (selectedCommand) {
      case "status":
        setRunningCommand({
          command: "status",
          options: {
            summary: values.summary as boolean | undefined,
            quiet: values.quiet as boolean | undefined,
            filter: values.filter as string | undefined,
            labels: parseLabelsInput(values.labels as string | undefined),
            fetch: values.fetch as boolean | undefined,
            noExclude: values.noExclude as boolean | undefined,
            bypassOrg: values.bypassOrg as boolean | undefined,
          },
        });
        break;
      case "fetch":
        setRunningCommand({
          command: "fetch",
          options: {
            dryRun: values.dryRun as boolean | undefined,
            prune: values.prune as boolean | undefined,
            all: values.all as boolean | undefined,
            filter: values.filter as string | undefined,
            labels: parseLabelsInput(values.labels as string | undefined),
            parallel: values.parallel as number | undefined,
            interactive: true,
            noExclude: values.noExclude as boolean | undefined,
            bypassOrg: values.bypassOrg as boolean | undefined,
          },
        });
        break;
      case "pull":
        setRunningCommand({
          command: "pull",
          options: {
            dryRun: values.dryRun as boolean | undefined,
            quiet: values.quiet as boolean | undefined,
            filter: values.filter as string | undefined,
            labels: parseLabelsInput(values.labels as string | undefined),
            parallel: values.parallel as number | undefined,
            interactive: true,
            noExclude: values.noExclude as boolean | undefined,
            bypassOrg: values.bypassOrg as boolean | undefined,
          },
        });
        break;
      case "diff":
        setRunningCommand({
          command: "diff",
          options: {
            quiet: values.quiet as boolean | undefined,
            stat: values.stat as boolean | undefined,
            filter: values.filter as string | undefined,
            labels: parseLabelsInput(values.labels as string | undefined),
            parallel: values.parallel as number | undefined,
            interactive: true,
            noExclude: values.noExclude as boolean | undefined,
            bypassOrg: values.bypassOrg as boolean | undefined,
          },
        });
        break;
      case "checkout":
        setRunningCommand({
          command: "checkout",
          options: {
            branch: values.branch as string,
            create: values.create as boolean | undefined,
            force: values.force as boolean | undefined,
            filter: values.filter as string | undefined,
            labels: parseLabelsInput(values.labels as string | undefined),
            parallel: values.parallel as number | undefined,
            interactive: true,
            noExclude: values.noExclude as boolean | undefined,
            bypassOrg: values.bypassOrg as boolean | undefined,
          },
        });
        break;
      case "exec":
        setRunningCommand({
          command: "exec",
          options: {
            command: values.command as string,
            quiet: values.quiet as boolean | undefined,
            filter: values.filter as string | undefined,
            labels: parseLabelsInput(values.labels as string | undefined),
            parallel: values.parallel as number | undefined,
            interactive: true,
            noExclude: values.noExclude as boolean | undefined,
            bypassOrg: values.bypassOrg as boolean | undefined,
          },
        });
        break;
      case "list":
        setRunningCommand({
          command: "list",
          options: {
            days: values.days as number | undefined,
            filter: values.filter as string | undefined,
            labels: parseLabelsInput(values.labels as string | undefined),
            noExclude: values.noExclude as boolean | undefined,
            bypassOrg: values.bypassOrg as boolean | undefined,
          },
        });
        break;
      case "exclude":
        setRunningCommand({
          command: "exclude",
          options: {
            repos: ((values.repos as string | undefined) ?? "")
              .trim()
              .split(/\s+/)
              .filter(Boolean),
            globs: ((values.globs as string | undefined) ?? "")
              .trim()
              .split(/\s+/)
              .filter(Boolean),
            bypassOrg: values.bypassOrg as boolean | undefined,
          },
        });
        break;
      case "clone":
        setRunningCommand({
          command: "clone",
          options: {
            dryRun: values.dryRun as boolean | undefined,
            shallow: values.shallow as boolean | undefined,
            org: values.org as string | undefined,
            days: values.days as number | undefined,
            parallel: values.parallel as number | undefined,
            interactive: true,
          },
        });
        break;
      case "clean":
        setRunningCommand({
          command: "clean",
          options: {
            dryRun: values.dryRun as boolean | undefined,
            all: values.all as boolean | undefined,
            filter: values.filter as string | undefined,
            labels: parseLabelsInput(values.labels as string | undefined),
            interactive: true,
            noExclude: values.noExclude as boolean | undefined,
            bypassOrg: values.bypassOrg as boolean | undefined,
          },
        });
        break;
    }
  };

  const handleOptionsCancel = () => {
    setSelectedCommand(null);
    setConfig(null);
    setState("menu");
  };

  if (state === "running" && runningCommand) {
    switch (runningCommand.command) {
      case "status":
        return (
          <StatusApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "fetch":
        return (
          <FetchApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "pull":
        return (
          <PullApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "diff":
        return (
          <DiffApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "checkout":
        return (
          <CheckoutApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "exec":
        return (
          <ExecApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "list":
        return (
          <ListApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "exclude":
        return (
          <ExcludeMenuApp
            repos={runningCommand.options.repos}
            globs={runningCommand.options.globs}
            bypassOrg={runningCommand.options.bypassOrg}
            onComplete={handleCommandComplete}
          />
        );
      case "clone":
        return (
          <CloneApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "clean":
        return (
          <CleanApp
            options={runningCommand.options}
            onComplete={handleCommandComplete}
          />
        );
      case "sync":
        return <SyncApp onComplete={handleCommandComplete} />;
      case "label":
        return <LabelMenuApp onComplete={handleCommandComplete} />;
      case "config":
        return (
          <ConfigApp
            options={{ list: true }}
            onComplete={handleCommandComplete}
          />
        );
      case "init":
        return <InitApp onComplete={handleCommandComplete} />;
    }
  }

  if (state === "running") {
    return null;
  }

  if (state === "loading") {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Loading configuration...</Text>
        </Box>
      </Box>
    );
  }

  if (state === "options" && selectedCommand && config) {
    const fields = getCommandFields(selectedCommand, config);
    if (fields) {
      const submitLabels: Partial<Record<Command, string>> = {
        clone: "Clone",
        fetch: "Fetch",
        pull: "Pull",
        diff: "Diff",
        checkout: "Checkout",
        exec: "Exec",
        list: "List",
        exclude: "Exclude",
        clean: "Clean",
        status: "Check",
      };

      return (
        <OptionsForm
          title={commandTitles[selectedCommand] || "Options"}
          fields={fields}
          onSubmit={handleOptionsSubmit}
          onCancel={handleOptionsCancel}
          submitLabel={submitLabels[selectedCommand] || "Run"}
        />
      );
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Box flexGrow={1}>
          <Text bold color="cyan">
            repos
          </Text>
          <Text dimColor> - Repository Manager</Text>
        </Box>
        {repoCount !== null && <Text dimColor>{repoCount} repos tracked</Text>}
      </Box>
      <GroupedMenu groups={menuGroups} onSelect={handleSelect} />
    </Box>
  );
}
