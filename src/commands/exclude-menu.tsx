import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { applyExclusions } from "./exclude.js";

interface ExcludeMenuAppProps {
  repos: string[];
  globs: string[];
  bypassOrg?: boolean;
  onComplete?: () => void;
}

type Phase = "running" | "done" | "error";

export function ExcludeMenuApp({ repos, globs, bypassOrg, onComplete }: ExcludeMenuAppProps) {
  const [phase, setPhase] = useState<Phase>("running");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    addedConfigExclusions: string[];
    repoMatched: number;
    repoUpdated: number;
  } | null>(null);

  useEffect(() => {
    async function run() {
      try {
        const result = await applyExclusions({ repos, globs, bypassOrg });
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
  }, [bypassOrg, globs, repos]);

  useEffect(() => {
    if (!onComplete) return;
    if (phase !== "done" && phase !== "error") return;
    const timer = setTimeout(() => onComplete(), 100);
    return () => clearTimeout(timer);
  }, [onComplete, phase]);

  if (phase === "running") {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Applying exclusions and syncing...</Text>
        </Box>
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
