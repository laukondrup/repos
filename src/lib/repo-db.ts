import { dirname, join, relative, resolve } from "path";
import { mkdir, readFile } from "fs/promises";
import { loadConfig, getCwdConfigPath, getHomeConfigPath, resolveCodeDir } from "./config.js";
import { findReposRecursive, getRepoName } from "./repos.js";
import { getOriginRepoFullName } from "./git.js";
import type { RepoDb, RepoDbRepoRecord, ReposConfig } from "../types.js";

const DEFAULT_DB_FILENAME = ".reposdb.json";

export interface SyncRepoDbOptions {
  basePath?: string;
  configBasePath?: string;
}

export interface RepoLabelUpdateOptions {
  basePath?: string;
  configBasePath?: string;
  action: "add" | "remove";
  label: string;
  targets: string[];
  globs: string[];
}

export interface RepoLabelListOptions {
  basePath?: string;
  configBasePath?: string;
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
  const normalizedExclusions = config.exclusions ?? config.exclusionGlobs ?? [];
  const normalized: ReposConfig = {
    ...config,
    exclusions: normalizedExclusions,
    exclusionGlobs: normalizedExclusions,
  };
  if (!normalized.repoDbPath) {
    delete normalized.repoDbPath;
  }
  return normalized;
}

async function getConfigContext(configBasePath?: string): Promise<ConfigContext> {
  if (configBasePath) {
    const scopedPath = getCwdConfigPath(configBasePath);
    const config = await loadConfig(configBasePath);
    return { config, configPath: scopedPath };
  }

  const homeConfigPath = getHomeConfigPath();
  const config = await loadConfig();
  return { config, configPath: homeConfigPath };
}

async function resolveConfigBasePath(
  basePath?: string,
  configBasePath?: string,
): Promise<string | undefined> {
  if (configBasePath) {
    return configBasePath;
  }
  if (!basePath) {
    return undefined;
  }

  const scopedPath = getCwdConfigPath(basePath);
  if (await Bun.file(scopedPath).exists()) {
    return basePath;
  }

  return undefined;
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

function isGlobPattern(value: string): boolean {
  return /[*?\[\]]/.test(value);
}

function matchesExclusion(
  recordPath: string,
  repoName: string,
  basePath: string,
  exclusions: string[],
): boolean {
  if (exclusions.length === 0) return false;
  const relPath = relative(basePath, recordPath).replace(/\\/g, "/");

  return exclusions.some((item) => {
    if (isGlobPattern(item)) {
      const regex = globToRegex(item);
      return regex.test(relPath) || regex.test(repoName);
    }

    if (item.startsWith("/")) {
      return resolve(item) === resolve(recordPath);
    }

    return item === relPath || item === repoName;
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
  exclusions: string[],
): RepoDbRepoRecord {
  const excluded = matchesExclusion(record.path, record.name, basePath, exclusions);

  return {
    ...record,
    excluded,
  };
}

function nextRecordId(originFullName: string | null, name: string, path: string): string {
  if (originFullName) return `origin:${originFullName.toLowerCase()}`;
  return `local:${name.toLowerCase()}:${path}`;
}

async function ensureDbContext(basePath?: string, configBasePath?: string): Promise<{
  basePath: string;
  configPath: string;
  dbPath: string;
  config: ReposConfig;
}> {
  const resolvedBasePath = await resolveCodeDir(basePath);
  const resolvedConfigBasePath = await resolveConfigBasePath(
    resolvedBasePath,
    configBasePath,
  );
  const { config, configPath } = await getConfigContext(resolvedConfigBasePath);
  const dbPath = resolveRepoDbPath(configPath, config.repoDbPath || DEFAULT_DB_FILENAME);
  return { basePath: resolvedBasePath, configPath, dbPath, config };
}

export async function getRepoDb(options: SyncRepoDbOptions = {}): Promise<{
  db: RepoDb;
  dbPath: string;
  basePath: string;
}> {
  await syncRepoDb({ basePath: options.basePath, configBasePath: options.configBasePath });
  const { dbPath, basePath } = await ensureDbContext(options.basePath, options.configBasePath);
  const db = await loadRepoDb(dbPath);
  return { db, dbPath, basePath };
}

export async function syncRepoDb(options: SyncRepoDbOptions = {}): Promise<SyncRepoDbResult> {
  const basePath = await resolveCodeDir(options.basePath);
  const configBasePath = await resolveConfigBasePath(
    basePath,
    options.configBasePath,
  );
  const { config, configPath } = await getConfigContext(configBasePath);
  const exclusions = config.exclusions ?? config.exclusionGlobs ?? [];

  const ensuredConfig: ReposConfig = { ...config };
  if (!ensuredConfig.repoDbPath) {
    ensuredConfig.repoDbPath = DEFAULT_DB_FILENAME;
    await mkdir(dirname(configPath), { recursive: true });
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
          excluded: false,
        };

    const computed = ensureComputedExclusion(baseRecord, basePath, exclusions);
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

  const expandedExclusions = new Set(exclusions);
  const globExclusions = exclusions.filter(isGlobPattern);
  if (globExclusions.length > 0) {
    for (const record of nextRepos) {
      const relPath = relative(basePath, record.path).replace(/\\/g, "/");
      for (const pattern of globExclusions) {
        const regex = globToRegex(pattern);
        if (regex.test(relPath) || regex.test(record.name)) {
          expandedExclusions.add(relPath);
          break;
        }
      }
    }
  }

  const expandedList = Array.from(expandedExclusions).sort();
  const configList = [...exclusions].sort();
  if (expandedList.join("\n") !== configList.join("\n")) {
    const nextConfig: ReposConfig = {
      ...ensuredConfig,
      exclusions: expandedList,
      exclusionGlobs: expandedList,
    };
    await mkdir(dirname(configPath), { recursive: true });
    await Bun.write(
      configPath,
      JSON.stringify(normalizeConfigForWrite(nextConfig), null, 2) + "\n",
    );
  }

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

  const syncResult = await syncRepoDb({
    basePath: options.basePath,
    configBasePath: options.configBasePath,
  });
  const { basePath, dbPath } = await ensureDbContext(
    options.basePath,
    options.configBasePath,
  );
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
  const { db } = await getRepoDb({
    basePath: options.basePath,
    configBasePath: options.configBasePath,
  });

  return db.repos
    .map((repo) => ({
      name: repo.name,
      path: repo.path,
      labels: [...repo.labels],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
