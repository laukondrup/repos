import { relative, resolve } from "path";
import { findReposRecursive, getRepoName } from "../lib/repos.js";
import { loadConfig, saveConfig, resolveCodeDir } from "../lib/config.js";
import { syncRepoDb } from "../lib/repo-db.js";
import type { ExcludeOptions } from "../types.js";

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function toRelativePath(codeDir: string, input: string): string {
  const normalizedInput = input.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalizedInput) return normalizedInput;

  if (normalizedInput.startsWith("/")) {
    const absolute = resolve(normalizedInput);
    const rel = relative(codeDir, absolute).replace(/\\/g, "/");
    return rel && !rel.startsWith("..") ? rel : normalizedInput;
  }

  return normalizedInput;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export async function applyExclusions(
  options: ExcludeOptions,
): Promise<{
  added: string[];
  matchedFromGlobs: string[];
  codeDir: string;
  configPathScope: "global" | "cwd";
}> {
  if (options.repos.length === 0 && options.globs.length === 0) {
    throw new Error("Provide at least one repo directory or --glob pattern.");
  }

  const codeDir = await resolveCodeDir(options.basePath);
  const config = await loadConfig(options.configBasePath);
  const existing = config.exclusions ?? config.exclusionGlobs ?? [];

  const repoDirs = options.repos.map((value) => toRelativePath(codeDir, value));

  const matchedFromGlobs: string[] = [];
  if (options.globs.length > 0) {
    const discovered = await findReposRecursive(codeDir);
    for (const repoPath of discovered) {
      const rel = relative(codeDir, repoPath).replace(/\\/g, "/");
      const name = getRepoName(repoPath);
      for (const pattern of options.globs) {
        const regex = globToRegex(pattern);
        if (regex.test(rel) || regex.test(name)) {
          matchedFromGlobs.push(rel);
          break;
        }
      }
    }
  }

  const nextExclusions = uniqueSorted([...existing, ...repoDirs, ...matchedFromGlobs]);
  const before = new Set(existing);
  const added = nextExclusions.filter((value) => !before.has(value));

  const nextConfig = {
    ...config,
    exclusions: nextExclusions,
  };

  const scoped = Boolean(options.configBasePath);
  await saveConfig(nextConfig, scoped ? "cwd" : "global", options.configBasePath);

  await syncRepoDb({
    basePath: codeDir,
    configBasePath: options.configBasePath,
  });

  return {
    added,
    matchedFromGlobs: uniqueSorted(matchedFromGlobs),
    codeDir,
    configPathScope: scoped ? "cwd" : "global",
  };
}

export async function runExclude(
  repos: string[],
  options: { globs?: string[]; basePath?: string; configBasePath?: string } = {},
): Promise<void> {
  const result = await applyExclusions({
    repos,
    globs: options.globs?.filter(Boolean) ?? [],
    basePath: options.basePath,
    configBasePath: options.configBasePath,
  });

  if (result.matchedFromGlobs.length > 0) {
    console.log(
      `Matched ${result.matchedFromGlobs.length} repos from globs: ${result.matchedFromGlobs.join(", ")}`,
    );
  }
  console.log(
    `Added ${result.added.length} exclusions (${result.configPathScope} config, code dir: ${result.codeDir}).`,
  );
  console.log("Running `repos sync` to update repository exclusion state.");
}
