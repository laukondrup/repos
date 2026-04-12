import { dirname, join, relative, resolve } from "path";
import { readFile } from "fs/promises";
import { loadConfig, getCwdConfigPath, getHomeConfigPath } from "./config.js";
import { findReposRecursive, getRepoName } from "./repos.js";
import { getOriginRepoFullName } from "./git.js";
import type { RepoDb, RepoDbRepoRecord, ReposConfig } from "../types.js";

const DEFAULT_DB_FILENAME = ".reposdb.json";

export interface SyncRepoDbOptions {
  basePath?: string;
}

export interface RepoLabelUpdateOptions {
  basePath?: string;
  action: "add" | "remove";
  label: string;
  targets: string[];
  globs: string[];
}

export interface RepoLabelListOptions {
  basePath?: string;
}

export interface SyncRepoDbResult {
  total: number;
  created: number;
  updated: number;
  removed: number;
  dbPath: string;
}

interface ConfigContext {
  config: ReposConfig;
  configPath: string;
}

function normalizeConfigForWrite(config: ReposConfig): ReposConfig {
  const normalized: ReposConfig = {
    ...config,
    exclusionGlobs: config.exclusionGlobs ?? [],
  };
  if (!normalized.repoDbPath) {
    delete normalized.repoDbPath;
  }
  return normalized;
}

async function getConfigContext(basePath?: string): Promise<ConfigContext> {
  const config = await loadConfig(basePath);
  const cwdConfigPath = getCwdConfigPath(basePath);
  const homeConfigPath = getHomeConfigPath();

  if (await Bun.file(cwdConfigPath).exists()) {
    return { config, configPath: cwdConfigPath };
  }
  if (await Bun.file(homeConfigPath).exists()) {
    return { config, configPath: homeConfigPath };
  }
  return { config, configPath: cwdConfigPath };
}

export function resolveRepoDbPath(configPath: string, repoDbPath?: string): string {
  if (!repoDbPath) {
    return join(dirname(configPath), DEFAULT_DB_FILENAME);
  }
  if (repoDbPath.startsWith("/")) {
    return repoDbPath;
  }
  return resolve(dirname(configPath), repoDbPath);
}

async function loadRepoDb(dbPath: string): Promise<RepoDb> {
  try {
    const content = await readFile(dbPath, "utf-8");
    const parsed = JSON.parse(content) as RepoDb;
    if (Array.isArray(parsed.repos)) {
      return parsed;
    }
  } catch {
  }
  return { version: 1, repos: [] };
}

async function saveRepoDb(dbPath: string, db: RepoDb): Promise<void> {
  await Bun.write(dbPath, JSON.stringify(db, null, 2) + "\n");
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesExclusion(
  recordPath: string,
  repoName: string,
  basePath: string,
  globs: string[],
): boolean {
  if (globs.length === 0) return false;
  const relPath = relative(basePath, recordPath).replace(/\\/g, "/");

  return globs.some((glob) => {
    const regex = globToRegex(glob);
    return regex.test(relPath) || regex.test(repoName);
  });
}

function matchesPattern(
  recordPath: string,
  repoName: string,
  basePath: string,
  pattern: string,
): boolean {
  const relPath = relative(basePath, recordPath).replace(/\\/g, "/");
  const regex = globToRegex(pattern);
  return regex.test(relPath) || regex.test(repoName);
}

function ensureComputedExclusion(
  record: RepoDbRepoRecord,
  basePath: string,
  globs: string[],
): RepoDbRepoRecord {
  const reasons: Array<"manual" | "glob"> = [];
  if (record.manuallyExcluded) reasons.push("manual");
  if (matchesExclusion(record.path, record.name, basePath, globs)) reasons.push("glob");

  return {
    ...record,
    excluded: reasons.length > 0,
    excludedReasons: reasons,
  };
}

function nextRecordId(originFullName: string | null, name: string, path: string): string {
  if (originFullName) return `origin:${originFullName.toLowerCase()}`;
  return `local:${name.toLowerCase()}:${path}`;
}

async function ensureDbContext(basePath?: string): Promise<{
  basePath: string;
  configPath: string;
  dbPath: string;
  config: ReposConfig;
}> {
  const resolvedBasePath = basePath ?? process.cwd();
  const { config, configPath } = await getConfigContext(resolvedBasePath);
  const dbPath = resolveRepoDbPath(configPath, config.repoDbPath || DEFAULT_DB_FILENAME);
  return { basePath: resolvedBasePath, configPath, dbPath, config };
}

export async function syncRepoDb(options: SyncRepoDbOptions = {}): Promise<SyncRepoDbResult> {
  const basePath = options.basePath ?? process.cwd();
  const { config, configPath } = await getConfigContext(basePath);
  const globs = config.exclusionGlobs ?? [];

  const ensuredConfig: ReposConfig = { ...config };
  if (!ensuredConfig.repoDbPath) {
    ensuredConfig.repoDbPath = DEFAULT_DB_FILENAME;
    await Bun.write(configPath, JSON.stringify(normalizeConfigForWrite(ensuredConfig), null, 2) + "\n");
  }

  const dbPath = resolveRepoDbPath(configPath, ensuredConfig.repoDbPath);
  const existingDb = await loadRepoDb(dbPath);
  const byOrigin = new Map<string, RepoDbRepoRecord>();
  for (const record of existingDb.repos) {
    if (record.originFullName) {
      byOrigin.set(record.originFullName.toLowerCase(), record);
    }
  }

  let created = 0;
  let updated = 0;
  const nextRepos: RepoDbRepoRecord[] = [];
  const discovered = await findReposRecursive(basePath);

  for (const repoPath of discovered) {
    const name = getRepoName(repoPath);
    const originFullName = await getOriginRepoFullName(repoPath);
    const originKey = originFullName?.toLowerCase() ?? null;

    let existing: RepoDbRepoRecord | undefined;
    if (originKey) {
      existing = byOrigin.get(originKey);
    }
    if (!existing) {
      existing = existingDb.repos.find((repo) => repo.path === repoPath);
    }
    if (!existing) {
      existing = existingDb.repos.find(
        (repo) => !repo.originFullName && repo.name === name,
      );
    }

    const baseRecord: RepoDbRepoRecord = existing
      ? {
          ...existing,
          name,
          path: repoPath,
          originFullName,
        }
      : {
          id: nextRecordId(originFullName, name, repoPath),
          name,
          path: repoPath,
          originFullName,
          labels: [],
          manuallyExcluded: false,
          excluded: false,
          excludedReasons: [],
        };

    const computed = ensureComputedExclusion(baseRecord, basePath, globs);
    if (existing) {
      updated++;
    } else {
      created++;
    }
    nextRepos.push(computed);
  }

  const nextDb: RepoDb = {
    version: 1,
    repos: nextRepos,
  };

  await saveRepoDb(dbPath, nextDb);

  return {
    total: nextRepos.length,
    created,
    updated,
    removed: Math.max(0, existingDb.repos.length - nextRepos.length),
    dbPath,
  };
}

function resolveTargetMatches(
  repos: RepoDbRepoRecord[],
  targets: string[],
  globs: string[],
  basePath: string,
): RepoDbRepoRecord[] {
  const matched = new Set<RepoDbRepoRecord>();

  for (const target of targets) {
    const hasPathSeparator = target.includes("/");
    if (hasPathSeparator) {
      const targetPath = target.startsWith("/") ? target : resolve(basePath, target);
      const pathMatch = repos.find((repo) => repo.path === targetPath);
      if (pathMatch) {
        matched.add(pathMatch);
      }
      continue;
    }

    const sameName = repos.filter((repo) => repo.name === target);
    if (sameName.length > 1) {
      throw new Error(
        `Ambiguous repo target '${target}'. Use a path instead.`,
      );
    }
    if (sameName.length === 1) {
      matched.add(sameName[0]);
    }
  }

  for (const glob of globs) {
    for (const repo of repos) {
      if (matchesPattern(repo.path, repo.name, basePath, glob)) {
        matched.add(repo);
      }
    }
  }

  return Array.from(matched);
}

export async function updateRepoLabels(
  options: RepoLabelUpdateOptions,
): Promise<{ matched: number; updated: number }> {
  if (!options.label.trim()) {
    throw new Error("Label is required");
  }

  const syncResult = await syncRepoDb({ basePath: options.basePath });
  const { basePath, dbPath } = await ensureDbContext(options.basePath);
  const db = await loadRepoDb(dbPath);
  if (syncResult.total !== db.repos.length) {
    // defensive re-sync guard if db changed during write
    const refreshed = await loadRepoDb(dbPath);
    db.repos = refreshed.repos;
  }

  const matches = resolveTargetMatches(
    db.repos,
    options.targets,
    options.globs,
    basePath,
  );

  let updated = 0;
  const targetIds = new Set(matches.map((repo) => repo.id));
  db.repos = db.repos.map((repo) => {
    if (!targetIds.has(repo.id)) return repo;

    const current = new Set(repo.labels);
    const sizeBefore = current.size;
    if (options.action === "add") {
      current.add(options.label);
    } else {
      current.delete(options.label);
    }
    if (current.size !== sizeBefore) {
      updated++;
    }

    return {
      ...repo,
      labels: Array.from(current).sort(),
    };
  });

  await saveRepoDb(dbPath, db);
  return { matched: matches.length, updated };
}

export async function listRepoLabels(
  options: RepoLabelListOptions = {},
): Promise<Array<{ name: string; path: string; labels: string[] }>> {
  await syncRepoDb({ basePath: options.basePath });
  const { dbPath } = await ensureDbContext(options.basePath);
  const db = await loadRepoDb(dbPath);

  return db.repos
    .map((repo) => ({
      name: repo.name,
      path: repo.path,
      labels: [...repo.labels],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
