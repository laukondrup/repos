type CommandCategory = "git" | "repo" | "settings";

export interface CommandOverviewDefinition {
  category: CommandCategory;
  label: string;
  key: string;
  description: string;
}

export interface TopLevelCommandDefinition {
  id: string;
  description: string;
  overview?: CommandOverviewDefinition;
}

export const TOP_LEVEL_COMMANDS: TopLevelCommandDefinition[] = [
  {
    id: "init",
    description: "Setup wizard for configuring repos CLI",
    overview: {
      category: "settings",
      label: "Init",
      key: "i",
      description: "Initialize repos and configure code directory",
    },
  },
  {
    id: "status",
    description: "Check status of all repositories",
    overview: {
      category: "git",
      label: "Status",
      key: "s",
      description: "Check status of all repositories",
    },
  },
  {
    id: "fetch",
    description: "Fetch latest changes from remotes for all repositories",
    overview: {
      category: "git",
      label: "Fetch",
      key: "f",
      description: "Fetch updates from remote repositories",
    },
  },
  {
    id: "pull",
    description: "Pull latest changes for all repositories",
    overview: {
      category: "git",
      label: "Pull",
      key: "p",
      description: "Pull changes into clean repositories",
    },
  },
  {
    id: "clone",
    description: "Clone active repositories from GitHub organization",
    overview: {
      category: "repo",
      label: "Clone",
      key: "o",
      description: "Clone repositories from GitHub organization",
    },
  },
  {
    id: "clean",
    description: "Clean repositories by reverting changes",
    overview: {
      category: "repo",
      label: "Clean",
      key: "x",
      description: "Remove untracked and ignored files",
    },
  },
  {
    id: "diff",
    description: "Show diffs across all repositories",
    overview: {
      category: "git",
      label: "Diff",
      key: "d",
      description: "Show uncommitted changes across repos",
    },
  },
  {
    id: "checkout",
    description: "Switch branches across all repositories",
    overview: {
      category: "git",
      label: "Checkout",
      key: "c",
      description: "Switch branches across repositories",
    },
  },
  {
    id: "exec",
    description: "Run arbitrary command across all repositories",
    overview: {
      category: "repo",
      label: "Exec",
      key: "e",
      description: "Execute command in all repositories",
    },
  },
  {
    id: "list",
    description: "List local repositories selected by filters/exclusion rules",
    overview: {
      category: "repo",
      label: "List",
      key: "t",
      description: "Preview repository selection (like a dry run)",
    },
  },
  {
    id: "exclude",
    description: "Exclude repositories by directory or glob, then sync exclusion state",
    overview: {
      category: "repo",
      label: "Exclude",
      key: "u",
      description: "Add exclusions by dir/glob and sync",
    },
  },
  {
    id: "sync",
    description: "Sync local repository database (paths, labels, exclusions)",
    overview: {
      category: "repo",
      label: "Sync",
      key: "y",
      description: "Rebuild local repository database",
    },
  },
  {
    id: "label",
    description: "Manage repository labels",
    overview: {
      category: "repo",
      label: "Labels",
      key: "l",
      description: "List or mutate repository labels",
    },
  },
  {
    id: "config",
    description: "View or modify configuration",
    overview: {
      category: "settings",
      label: "Config",
      key: "g",
      description: "View and edit configuration",
    },
  },
];

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function diff(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

export function getTopLevelCommandIds(): string[] {
  return TOP_LEVEL_COMMANDS.map((command) => command.id);
}

export function getRequiredOverviewCommandIds(): string[] {
  return TOP_LEVEL_COMMANDS.map((command) => command.id);
}

export function getOverviewCommandIds(): string[] {
  return TOP_LEVEL_COMMANDS
    .filter((command) => command.overview)
    .map((command) => command.id);
}

export function getCommandDefinition(id: string): TopLevelCommandDefinition {
  const command = TOP_LEVEL_COMMANDS.find((item) => item.id === id);
  if (!command) {
    throw new Error(`Unknown command '${id}'. Add it to TOP_LEVEL_COMMANDS.`);
  }
  return command;
}

export function getOverviewMenuGroups(): Array<{
  category: CommandCategory;
  label: string;
  items: Array<{ label: string; value: string; key: string; description: string }>;
}> {
  const groups: Array<{
    category: CommandCategory;
    label: string;
    items: Array<{ label: string; value: string; key: string; description: string }>;
  }> = [
    { category: "git", label: "Git Operations", items: [] },
    { category: "repo", label: "Management", items: [] },
    { category: "settings", label: "Settings", items: [] },
  ];

  for (const command of TOP_LEVEL_COMMANDS) {
    if (!command.overview) continue;
    const group = groups.find((item) => item.category === command.overview?.category);
    if (!group) continue;
    group.items.push({
      label: command.overview.label,
      value: command.id,
      key: command.overview.key,
      description: command.overview.description,
    });
  }

  return groups;
}

export function assertOverviewCoverage(): void {
  const required = sorted(getRequiredOverviewCommandIds());
  const overview = sorted(getOverviewCommandIds());
  const missing = diff(required, overview);
  const unexpected = diff(overview, required);
  if (missing.length === 0 && unexpected.length === 0) {
    return;
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing: ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    parts.push(`unexpected: ${unexpected.join(", ")}`);
  }

  throw new Error(
    `Overview command coverage mismatch (${parts.join(" | ")}). Update TOP_LEVEL_COMMANDS overview metadata.`,
  );
}

export function assertProgramRegistrationCoverage(registeredIds: string[]): void {
  const filteredRegistered = registeredIds.filter((id) => id !== "help");
  const expected = sorted(getTopLevelCommandIds());
  const actual = sorted(filteredRegistered);
  const missing = diff(expected, actual);
  const unexpected = diff(actual, expected);
  if (missing.length === 0 && unexpected.length === 0) {
    return;
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing registrations: ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    parts.push(`unexpected registrations: ${unexpected.join(", ")}`);
  }

  throw new Error(
    `Top-level command registry mismatch (${parts.join(" | ")}). Keep index.ts and TOP_LEVEL_COMMANDS in sync.`,
  );
}
