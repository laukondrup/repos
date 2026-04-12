import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { applyExclusions } from "./exclude.js";

interface ExcludeMenuAppProps {
  repos: string[];
  globs: string[];
  onComplete?: () => void;
}

type Phase = "running" | "done" | "error";

export function ExcludeMenuApp({ repos, globs, onComplete }: ExcludeMenuAppProps) {
  const [phase, setPhase] = useState<Phase>("running");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    added: string[];
    matchedFromGlobs: string[];
  } | null>(null);

  useEffect(() => {
    async function run() {
      try {
        const result = await applyExclusions({ repos, globs });
        setSummary({
          added: result.added,
          matchedFromGlobs: result.matchedFromGlobs,
        });
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    }
    run();
  }, [globs, repos]);

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
      <Text>Added exclusions: {summary?.added.length ?? 0}</Text>
      <Text>Matched from globs: {summary?.matchedFromGlobs.length ?? 0}</Text>
      <Text dimColor>Ran `repos sync` to refresh local exclusion state.</Text>
    </Box>
  );
}
