import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { getRepoStatus } from "./git.js";
import type { RepoStatus } from "../types.js";

const DEFAULT_DISCOVERY_MAX_DEPTH = 10;

interface GitIgnoreRule {
  baseRelPath: string;
  regex: RegExp;
  negated: boolean;
  onlyDirectory: boolean;
}

async function hasGitMetadata(path: string): Promise<boolean> {
  try {
    const gitPath = join(path, ".git");
    const gitStats = await stat(gitPath);
    return gitStats.isDirectory() || gitStats.isFile();
  } catch {
    return false;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function pathRelativeToBase(baseRelPath: string, targetRelPath: string): string | null {
  if (!baseRelPath) return targetRelPath;
  if (targetRelPath === baseRelPath) return "";
  if (targetRelPath.startsWith(`${baseRelPath}/`)) {
    return targetRelPath.slice(baseRelPath.length + 1);
  }
  return null;
}

function escapeRegexChar(char: string): string {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

function globToRegexSource(pattern: string): string {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const next = pattern[i + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      i++;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegexChar(char);
  }
  return source;
}

function parseGitignore(content: string, baseRelPath: string): GitIgnoreRule[] {
  const rules: GitIgnoreRule[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "#") continue;

    let pattern = line;
    if (pattern.startsWith("\\#") || pattern.startsWith("\\!")) {
      pattern = pattern.slice(1);
    } else if (pattern.startsWith("#")) {
      continue;
    }

    let negated = false;
    if (pattern.startsWith("!")) {
      negated = true;
      pattern = pattern.slice(1);
    }
    if (!pattern) continue;

    let onlyDirectory = false;
    if (pattern.endsWith("/")) {
      onlyDirectory = true;
      pattern = pattern.slice(0, -1);
    }
    if (!pattern) continue;

    const anchored = pattern.startsWith("/");
    if (anchored) {
      pattern = pattern.slice(1);
    }

    const basenameOnly = !pattern.includes("/");
    const core = globToRegexSource(pattern);
    const source = basenameOnly
      ? `(^|/)${core}$`
      : anchored
        ? `^${core}$`
        : `(^|/)${core}$`;
    rules.push({
      baseRelPath,
      regex: new RegExp(source),
      negated,
      onlyDirectory,
    });
  }

  return rules;
}

function isIgnoredByGitignore(
  targetRelPath: string,
  isDirectory: boolean,
  rules: GitIgnoreRule[],
): boolean {
  const normalizedTarget = normalizePath(targetRelPath);
  let ignored = false;

  for (const rule of rules) {
    if (rule.onlyDirectory && !isDirectory) {
      continue;
    }
    const relativeTarget = pathRelativeToBase(rule.baseRelPath, normalizedTarget);
    if (relativeTarget === null) {
      continue;
    }
    if (rule.regex.test(relativeTarget)) {
      ignored = !rule.negated;
    }
  }

  return ignored;
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
  const repos = new Set<string>();
  const normalizedBase = normalizePath(basePath);

  async function walk(
    currentPath: string,
    currentRelPath: string,
    depth: number,
    inheritedRules: GitIgnoreRule[],
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    let rules = inheritedRules;
    try {
      const gitignore = await readFile(join(currentPath, ".gitignore"), "utf-8");
      rules = [...inheritedRules, ...parseGitignore(gitignore, currentRelPath)];
    } catch {
      // no local gitignore
    }

    const hasGitMetadata = entries.some(
      (entry) => entry.name === ".git" && (entry.isDirectory() || entry.isFile()),
    );
    if (hasGitMetadata) {
      repos.add(currentPath);
    }

    if (depth >= maxDepth) {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".git") continue;

      const childPath = join(currentPath, entry.name);
      const childRelPath = currentRelPath
        ? `${currentRelPath}/${entry.name}`
        : entry.name;
      const normalizedChildRelPath = normalizePath(childRelPath);
      if (!normalizedChildRelPath || normalizedChildRelPath.startsWith("..")) {
        continue;
      }
      const normalizedFull = normalizePath(childPath);
      if (normalizedFull === normalizedBase || normalizedFull.startsWith(`${normalizedBase}/`)) {
        if (isIgnoredByGitignore(normalizedChildRelPath, true, rules)) {
          continue;
        }
        await walk(childPath, normalizedChildRelPath, depth + 1, rules);
      }
    }
  }

  await walk(basePath, "", 0, []);

  return Array.from(repos).sort((a, b) => a.localeCompare(b));
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
