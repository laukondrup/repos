import { filterRepos, getRepoName } from "./repos.js";
import { getRepoDb, getRepoOwnerFromRecord } from "./repo-db.js";
import { loadConfig, resolveCodeDir } from "./config.js";
import { matchesConfigExclusion } from "./exclusions.js";
import type { RepoDbRepoRecord } from "../types.js";

export interface SelectLocalReposOptions {
  basePath?: string;
  filter?: string;
  labels?: string[];
  noExclude?: boolean;
  bypassOrg?: boolean;
  org?: string;
}

export async function selectLocalRepos(
  options: SelectLocalReposOptions = {},
): Promise<string[]> {
  const codeDir = await resolveCodeDir(options.basePath);
  const configBasePath = options.basePath ? codeDir : undefined;
  const config = await loadConfig(configBasePath);
  const { db } = await getRepoDb({
    basePath: codeDir,
    configBasePath,
  });

  let selectedRecords: RepoDbRepoRecord[] = db.repos;
  const configuredOrg = (options.org ?? config.org)?.trim().toLowerCase();
  if (configuredOrg && !options.bypassOrg) {
    selectedRecords = selectedRecords.filter(
      (repo) => getRepoOwnerFromRecord(repo) === configuredOrg,
    );
  }

  let repoPaths = selectedRecords.map((repo) => repo.path);

  if (!options.noExclude) {
    const configExclusions = config.exclusions ?? [];
    repoPaths = repoPaths.filter(
      (repoPath) =>
        !matchesConfigExclusion(
          repoPath,
          getRepoName(repoPath),
          codeDir,
          configExclusions,
        ),
    );

    const excludedPaths = new Set(
      db.repos.filter((repo) => repo.excluded).map((repo) => repo.path),
    );
    repoPaths = repoPaths.filter((repoPath) => !excludedPaths.has(repoPath));
  }

  const normalizedLabels = (options.labels ?? [])
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
  if (normalizedLabels.length > 0) {
    const labelsByPath = new Map(
      db.repos.map((repo) => [
        repo.path,
        new Set(repo.labels.map((label) => label.toLowerCase())),
      ]),
    );
    repoPaths = repoPaths.filter((repoPath) => {
      const repoLabels = labelsByPath.get(repoPath);
      if (!repoLabels) return false;
      return normalizedLabels.every((label) => repoLabels.has(label));
    });
  }

  if (options.filter) {
    repoPaths = filterRepos(repoPaths, options.filter);
  }

  return repoPaths;
}
