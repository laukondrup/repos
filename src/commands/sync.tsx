import React, { useEffect, useState } from "react";
import { Box, Text, render } from "ink";
import { syncRepoDb } from "../lib/repo-db.js";

interface SyncAppProps {
  onComplete?: () => void;
}

export function SyncApp({ onComplete }: SyncAppProps) {
  const [phase, setPhase] = useState<"running" | "done" | "error">("running");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    total: number;
    created: number;
    updated: number;
    removed: number;
    dbPath: string;
  } | null>(null);

  useEffect(() => {
    async function run() {
      try {
        const result = await syncRepoDb();
        setSummary(result);
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      } finally {
        if (onComplete) {
          setTimeout(() => onComplete(), 100);
        }
      }
    }

    run();
  }, [onComplete]);

  if (phase === "running") {
    return (
      <Box padding={1}>
        <Text dimColor>Syncing repository database...</Text>
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

  if (!summary) {
    return null;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Repository Sync Complete</Text>
      <Text>Tracked repositories: {summary.total}</Text>
      <Text color="green">Created: {summary.created}</Text>
      <Text color="yellow">Updated: {summary.updated}</Text>
      {summary.removed > 0 && <Text color="red">Removed: {summary.removed}</Text>}
      <Text dimColor>DB: {summary.dbPath}</Text>
    </Box>
  );
}

export async function runSync(): Promise<void> {
  let unmountFn: (() => void) | null = null;
  const { waitUntilExit, unmount } = render(
    <SyncApp
      onComplete={() => {
        unmountFn?.();
      }}
    />
  );
  unmountFn = unmount;
  await waitUntilExit();
}
