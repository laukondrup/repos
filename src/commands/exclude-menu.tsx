import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdout, render } from "ink";
import Spinner from "ink-spinner";
import { relative } from "path";
import { applyExclusions } from "./exclude.js";
import { getRepoDb, setRepoExclusionFlags } from "../lib/repo-db.js";
import { loadConfig, resolveCodeDir } from "../lib/config.js";
import { matchesConfigExclusion } from "../lib/exclusions.js";
import type { RepoDbRepoRecord } from "../types.js";

// ─── non-interactive app (used from App.tsx with pre-filled args) ────────────

interface ExcludeMenuAppProps {
  repos: string[];
  globs: string[];
  bypassOrg?: boolean;
  org?: string;
  onComplete?: () => void;
}

type MenuPhase = "running" | "done" | "error";

export function ExcludeMenuApp({
  repos,
  globs,
  bypassOrg,
  org,
  onComplete,
}: ExcludeMenuAppProps) {
  const [phase, setPhase] = useState<MenuPhase>("running");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    addedConfigExclusions: string[];
    repoMatched: number;
    repoUpdated: number;
  } | null>(null);

  useEffect(() => {
    async function run() {
      try {
        const result = await applyExclusions({ repos, globs, bypassOrg, org });
        setSummary({
          addedConfigExclusions: result.addedConfigExclusions,
          repoMatched: result.repoMatched,
          repoUpdated: result.repoUpdated,
        });
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    }
    run();
  }, [bypassOrg, globs, org, repos]);

  useEffect(() => {
    if (!onComplete) return;
    if (phase !== "done" && phase !== "error") return;
    const timer = setTimeout(() => onComplete(), 100);
    return () => clearTimeout(timer);
  }, [onComplete, phase]);

  if (phase === "running") {
    return (
      <Box padding={1}>
        <Text color="cyan"><Spinner type="dots" /></Text>
        <Box marginLeft={1}><Text>Applying exclusions and syncing...</Text></Box>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">✓ Exclusions updated</Text>
      <Text>Added config exclusions: {summary?.addedConfigExclusions.length ?? 0}</Text>
      <Text>Repo targets matched: {summary?.repoMatched ?? 0}</Text>
      <Text>Repo flags updated: {summary?.repoUpdated ?? 0}</Text>
    </Box>
  );
}

// ─── interactive app (launched when `repos exclude` has no args) ─────────────

interface RepoRow {
  record: RepoDbRepoRecord;
  excludedByGlob: boolean;
  pendingExcluded: boolean;
}

type InteractivePhase = "loading" | "glob" | "loading_repos" | "repos" | "saving" | "done" | "error";

interface ExcludeInteractiveAppProps {
  bypassOrg?: boolean;
  org?: string;
  onComplete?: () => void;
}

export function ExcludeInteractiveApp({
  bypassOrg,
  org,
  onComplete,
}: ExcludeInteractiveAppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [phase, setPhase] = useState<InteractivePhase>("loading");
  const [error, setError] = useState<string | null>(null);

  // Glob phase state
  const [globText, setGlobText] = useState("");

  // Repos phase state
  const [rows, setRows] = useState<RepoRow[]>([]);
  const [basePath, setBasePath] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Done summary
  const [savedCount, setSavedCount] = useState(0);
  const [appliedGlob, setAppliedGlob] = useState<string | null>(null);

  const viewportSize = Math.max(5, (stdout?.rows ?? 24) - 8);

  // ── initial sync ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        await getRepoDb({ sync: true }); // ensure DB is up to date
        setPhase("glob");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    }
    init();
  }, []);

  // ── load repos for the picker ─────────────────────────────────────────────
  const loadRepos = useCallback(async () => {
    setPhase("loading_repos");
    try {
      const { db, basePath: bp } = await getRepoDb({ sync: false });
      const config = await loadConfig();
      const exclusions = config.exclusions ?? [];
      const resolved = await resolveCodeDir();
      const loadedRows: RepoRow[] = db.repos.map((record) => ({
        record,
        excludedByGlob: matchesConfigExclusion(record.path, record.name, resolved, exclusions),
        pendingExcluded: record.excluded,
      }));
      setBasePath(bp);
      setRows(loadedRows);
      setSelectedIndex(0);
      setScrollOffset(0);
      setPhase("repos");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  // ── save repo exclusion flags ─────────────────────────────────────────────
  const saveRepos = useCallback(async () => {
    setPhase("saving");
    try {
      const flags: Record<string, boolean> = {};
      let changed = 0;
      for (const row of rows) {
        if (row.pendingExcluded !== row.record.excluded) {
          flags[row.record.id] = row.pendingExcluded;
          changed++;
        }
      }
      if (changed > 0) {
        await setRepoExclusionFlags(flags);
      }
      setSavedCount(changed);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [rows]);

  // ── apply glob ────────────────────────────────────────────────────────────
  const applyGlob = useCallback(async (pattern: string) => {
    setPhase("saving");
    try {
      await applyExclusions({ repos: [], globs: [pattern], bypassOrg, org });
      setAppliedGlob(pattern);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [bypassOrg, org]);

  // ── keyboard: glob phase ──────────────────────────────────────────────────
  useInput((input, key) => {
    if (phase !== "glob") return;

    if (key.tab) {
      loadRepos();
      return;
    }
    if (key.escape) {
      exit();
      return;
    }
    if (key.return) {
      if (globText.trim()) {
        applyGlob(globText.trim());
      } else {
        loadRepos();
      }
      return;
    }
    if (key.backspace || key.delete) {
      setGlobText((t) => t.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setGlobText((t) => t + input);
    }
  }, { isActive: phase === "glob" });

  // ── keyboard: repos phase ─────────────────────────────────────────────────
  useInput((input, key) => {
    if (phase !== "repos") return;

    if (key.escape || input === "g") {
      setPhase("glob");
      return;
    }
    if (input === "q") {
      exit();
      return;
    }
    if (input === "s" || key.return) {
      saveRepos();
      return;
    }

    const total = rows.length;

    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => {
        const next = i > 0 ? i - 1 : total - 1;
        setScrollOffset((off) => {
          if (next < off) return next;
          if (next >= off + viewportSize) return next - viewportSize + 1;
          return off;
        });
        return next;
      });
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => {
        const next = i < total - 1 ? i + 1 : 0;
        setScrollOffset((off) => {
          if (next === 0) return 0;
          if (next >= off + viewportSize) return next - viewportSize + 1;
          if (next < off) return next;
          return off;
        });
        return next;
      });
    } else if (input === " ") {
      setRows((prev) =>
        prev.map((row, i) =>
          i === selectedIndex
            ? { ...row, pendingExcluded: !row.pendingExcluded }
            : row,
        ),
      );
    }
  }, { isActive: phase === "repos" });

  // ── done / error cleanup ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "done" && phase !== "error") return;
    if (!onComplete) return;
    const timer = setTimeout(() => onComplete(), 80);
    return () => clearTimeout(timer);
  }, [onComplete, phase]);

  // ── render ─────────────────────────────────────────────────────────────────

  if (phase === "loading" || phase === "loading_repos") {
    return (
      <Box padding={1}>
        <Text color="cyan"><Spinner type="dots" /></Text>
        <Box marginLeft={1}><Text dimColor>Loading repositories...</Text></Box>
      </Box>
    );
  }

  if (phase === "saving") {
    return (
      <Box padding={1}>
        <Text color="cyan"><Spinner type="dots" /></Text>
        <Box marginLeft={1}><Text dimColor>Saving exclusions...</Text></Box>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (phase === "done") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">✓ Exclusions updated</Text>
        {appliedGlob && <Text>Glob pattern applied: <Text color="cyan">{appliedGlob}</Text></Text>}
        {savedCount > 0 && <Text>Toggled {savedCount} repo{savedCount !== 1 ? "s" : ""}</Text>}
        {!appliedGlob && savedCount === 0 && <Text dimColor>No changes made</Text>}
      </Box>
    );
  }

  if (phase === "glob") {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">exclude</Text>
          <Text dimColor>  Exclude repositories</Text>
        </Box>
        <Text>Glob pattern <Text dimColor>(leave empty + Enter to select repos)</Text>:</Text>
        <Box marginTop={1}>
          <Text color="cyan">❯ </Text>
          <Text>{globText}</Text>
          <Text inverse> </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter: apply glob  Tab: select repos  Esc: quit</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "repos") {
    const visibleRows = rows.slice(scrollOffset, scrollOffset + viewportSize);
    const changedCount = rows.filter((r) => r.pendingExcluded !== r.record.excluded).length;

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">exclude</Text>
          <Text dimColor>  {rows.length} repos</Text>
          {changedCount > 0 && (
            <Text color="yellow">  {changedCount} pending change{changedCount !== 1 ? "s" : ""}</Text>
          )}
        </Box>

        {visibleRows.map((row, i) => {
          const idx = scrollOffset + i;
          const isSelected = idx === selectedIndex;
          const state = row.pendingExcluded
            ? "excluded"
            : row.excludedByGlob
              ? "glob"
              : "none";

          const relPath = basePath
            ? relative(basePath, row.record.path)
            : row.record.path;

          return (
            <Box key={row.record.id}>
              <Text color={isSelected ? "cyan" : undefined}>{isSelected ? "❯ " : "  "}</Text>
              <StateBadge state={state} />
              <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                {row.record.name}
              </Text>
              <Text dimColor>  {relPath}</Text>
            </Box>
          );
        })}

        {rows.length > viewportSize && (
          <Box marginTop={1}>
            <Text dimColor>
              {scrollOffset + 1}–{Math.min(scrollOffset + viewportSize, rows.length)} / {rows.length}
            </Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>↑↓/jk navigate  Space toggle  s/Enter save  g glob mode  q quit</Text>
        </Box>
        <Box>
          <Text dimColor>
            <StateBadgeInline state="none" /> not excluded  <StateBadgeInline state="glob" /> glob pattern  <StateBadgeInline state="excluded" /> excluded
          </Text>
        </Box>
      </Box>
    );
  }

  return null;
}

function StateBadge({ state }: { state: "none" | "glob" | "excluded" }) {
  if (state === "excluded") {
    return <Text color="red">[x] </Text>;
  }
  if (state === "glob") {
    return <Text color="yellow">[~] </Text>;
  }
  return <Text dimColor>[ ] </Text>;
}

function StateBadgeInline({ state }: { state: "none" | "glob" | "excluded" }) {
  if (state === "excluded") return <Text color="red">[x]</Text>;
  if (state === "glob") return <Text color="yellow">[~]</Text>;
  return <Text dimColor>[ ]</Text>;
}

export async function runExcludeInteractive(options: {
  bypassOrg?: boolean;
  org?: string;
} = {}): Promise<void> {
  let unmountFn: (() => void) | null = null;
  const { waitUntilExit, unmount } = render(
    <ExcludeInteractiveApp
      bypassOrg={options.bypassOrg}
      org={options.org}
      onComplete={() => unmountFn?.()}
    />,
  );
  unmountFn = unmount;
  await waitUntilExit();
}
