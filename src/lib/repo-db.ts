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
