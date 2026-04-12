import { relative, resolve } from "path";
import { loadConfig, saveConfig, resolveCodeDir } from "../lib/config.js";
import { syncRepoDb, updateRepoExclusions } from "../lib/repo-db.js";
import type { ExcludeOptions } from "../types.js";

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
  addedConfigExclusions: string[];
  repoMatched: number;
  repoUpdated: number;
  codeDir: string;
  configPathScope: "global" | "cwd";
}> {
  if (options.repos.length === 0 && options.globs.length === 0) {
    throw new Error("Provide at least one repo directory or --glob pattern.");
  }

  const codeDir = await resolveCodeDir(options.basePath);
  const config = await loadConfig(options.configBasePath);
  const existing = config.exclusions ?? [];

  const repoDirs = options.repos.map((value) => toRelativePath(codeDir, value));

  const nextExclusions = uniqueSorted([...existing, ...options.globs]);
  const before = new Set(existing);
  const addedConfigExclusions = nextExclusions.filter((value) => !before.has(value));

  const nextConfig = {
    ...config,
    exclusions: nextExclusions,
  };

  const scoped = Boolean(options.configBasePath);
  await saveConfig(nextConfig, scoped ? "cwd" : "global", options.configBasePath);

  let repoMatched = 0;
  let repoUpdated = 0;
  if (repoDirs.length > 0) {
    const result = await updateRepoExclusions({
      basePath: codeDir,
      configBasePath: options.configBasePath,
      excluded: true,
      targets: repoDirs,
    });
    repoMatched = result.matched;
    repoUpdated = result.updated;
  }

  await syncRepoDb({
    basePath: codeDir,
    configBasePath: options.configBasePath,
  });

  return {
    addedConfigExclusions,
    repoMatched,
    repoUpdated,
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

  if (result.addedConfigExclusions.length > 0) {
    console.log(
      `Added ${result.addedConfigExclusions.length} config exclusions: ${result.addedConfigExclusions.join(", ")}`,
    );
  }
  console.log(
    `Marked ${result.repoUpdated} repositories excluded in DB (${result.repoMatched} matched).`,
  );
  console.log(
    `Updated exclusions (${result.configPathScope} config, code dir: ${result.codeDir}).`,
  );
}
