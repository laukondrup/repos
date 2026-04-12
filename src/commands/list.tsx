import React, { useEffect, useState } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { relative } from "path";
import { selectLocalRepos } from "../lib/repo-selection.js";
import { isRepoLocallyActiveWithinDays } from "../lib/git.js";
import { resolveCodeDir } from "../lib/config.js";
import type { ListOptions } from "../types.js";

interface ListAppProps {
  options: ListOptions;
  onComplete?: () => void;
}

type Phase = "finding" | "done" | "error";

export function toDisplayRepoPath(codeDir: string, repoPath: string): string {
  const relPath = relative(codeDir, repoPath).replace(/\\/g, "/");
  return relPath && !relPath.startsWith("..") ? relPath : repoPath;
}

export function ListApp({ options, onComplete }: ListAppProps) {
  const [phase, setPhase] = useState<Phase>("finding");
  const [repoPaths, setRepoPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!onComplete && (phase === "done" || phase === "error")) {
      setTimeout(() => process.exit(0), 100);
    }
  }, [phase, onComplete]);

  useInput((_, key) => {
    if ((key.escape || key.delete) && onComplete && (phase === "done" || phase === "error")) {
      onComplete();
    }
  });

  useEffect(() => {
    async function runList() {
      try {
        const codeDir = await resolveCodeDir(options.basePath);
        let repos = await selectLocalRepos({
          basePath: options.basePath,
          filter: options.filter,
          labels: options.labels,
          noExclude: options.noExclude,
          bypassOrg: options.bypassOrg,
        });

        if (options.days !== undefined) {
          const active: string[] = [];
          for (const repoPath of repos) {
            if (await isRepoLocallyActiveWithinDays(repoPath, options.days)) {
              active.push(repoPath);
            }
          }
          repos = active;
        }

        const displayPaths = repos.map((repoPath) => toDisplayRepoPath(codeDir, repoPath));

        setRepoPaths(displayPaths);
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    }

    runList();
  }, [options]);

  if (phase === "finding") {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Listing repositories...</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        {onComplete && (
          <Box marginTop={1}>
            <Text dimColor>⌫/Esc Back</Text>
          </Box>
        )}
      </Box>
    );
  }

  const title = options.days !== undefined
    ? `Repositories (active within ${options.days} days)`
    : "Repositories";

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {repoPaths.length === 0 ? (
          <Text dimColor>(none)</Text>
        ) : (
          repoPaths.map((repoPath) => (
            <Text key={repoPath}>{repoPath}</Text>
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Total: {repoPaths.length}</Text>
      </Box>
      {onComplete && (
        <Box marginTop={1}>
          <Text dimColor>⌫/Esc Back</Text>
        </Box>
      )}
    </Box>
  );
}

export async function runList(options: ListOptions): Promise<void> {
  const { waitUntilExit } = render(<ListApp options={options} />);
  await waitUntilExit();
}
