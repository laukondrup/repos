import { readdir, stat } from "fs/promises";
import { dirname, join, relative } from "path";
import { getRepoStatus } from "./git.js";
import type { RepoStatus } from "../types.js";

const DEFAULT_DISCOVERY_MAX_DEPTH = 10;
const decoder = new TextDecoder();

async function hasGitMetadata(path: string): Promise<boolean> {
  try {
    const gitPath = join(path, ".git");
    const gitStats = await stat(gitPath);
    return gitStats.isDirectory() || gitStats.isFile();
  } catch {
    return false;
  }
}

export function assertFdInstalled(): void {
  const result = Bun.spawnSync({
    cmd: ["fd", "--version"],
    stdout: "ignore",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      "`fd` is required for repository discovery. Install it and retry.",
    );
  }
}

function shouldIgnoreDiscoveredRepo(basePath: string, repoPath: string): boolean {
  const rel = relative(basePath, repoPath).replace(/\\/g, "/");
  const parts = rel.split("/").filter(Boolean);
  return parts.some(
    (part) =>
      ((part.startsWith(".") && part !== "." && part !== "..")
        || part === "node_modules"),
  );
}

export async function findRepos(
  basePath: string = process.cwd()
): Promise<string[]> {
  const repos: string[] = [];

  try {
    const entries = await readdir(basePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const fullPath = join(basePath, entry.name);
      if (await hasGitMetadata(fullPath)) {
        repos.push(fullPath);
      }
    }
  } catch {
  }

  return repos.sort();
}

export async function findReposRecursive(
  basePath: string = process.cwd(),
  maxDepth: number = DEFAULT_DISCOVERY_MAX_DEPTH,
): Promise<string[]> {
  assertFdInstalled();
  const result = Bun.spawnSync({
    cmd: [
      "fd",
      "--hidden",
      "--no-ignore",
      "--glob",
      "--max-depth",
      String(maxDepth + 1),
      ".git",
      basePath,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderr = decoder.decode(result.stderr).trim();
    throw new Error(stderr || "Failed to discover repositories with fd.");
  }

  const output = decoder.decode(result.stdout).trim();
  if (!output) return [];

  const repos = new Set<string>();
  for (const gitMetadataPath of output.split("\n")) {
    const candidate = gitMetadataPath.trim();
    const resolvedMetadataPath = candidate.startsWith("/")
      ? candidate
      : join(basePath, candidate);
    const repoPath = dirname(resolvedMetadataPath);
    if (!repoPath) continue;
    if (shouldIgnoreDiscoveredRepo(basePath, repoPath)) continue;
    repos.add(repoPath);
  }

  return Array.from(repos).sort();
}

export function filterRepos(repos: string[], pattern: string): string[] {
  const regexPattern = pattern
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  const regex = new RegExp(`^${regexPattern}$`, "i");

  return repos.filter((repo) => {
    const name = repo.split("/").pop() || "";
    return regex.test(name);
  });
}

export async function getAllRepoStatuses(
  repos: string[]
): Promise<RepoStatus[]> {
  const statuses = await Promise.all(repos.map(getRepoStatus));
  return statuses;
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export function getRepoName(repoPath: string): string {
  return repoPath.split("/").pop() || repoPath;
}

export async function runParallel<T, U>(
  items: U[],
  operation: (item: U, index: number) => Promise<T>,
  concurrency: number = 10,
  onProgress?: (completed: number, total: number) => void,
  shouldCancel?: () => boolean
): Promise<{ results: T[]; cancelled: boolean }> {
  const results: T[] = [];
  let completed = 0;
  let index = 0;
  let cancelled = false;

  const runNext = async (): Promise<void> => {
    while (index < items.length) {
      if (shouldCancel?.()) {
        cancelled = true;
        return;
      }
      const currentIndex = index++;
      const item = items[currentIndex];
      const result = await operation(item, currentIndex);
      results[currentIndex] = result;
      completed++;
      onProgress?.(completed, items.length);
    }
  };

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => runNext());

  await Promise.all(workers);

  return { results, cancelled };
}
