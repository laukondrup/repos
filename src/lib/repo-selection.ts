import { filterRepos, findReposRecursive } from "./repos.js";
import { getRepoDb } from "./repo-db.js";

export interface SelectLocalReposOptions {
  basePath?: string;
  filter?: string;
  noExclude?: boolean;
}

export async function selectLocalRepos(
  options: SelectLocalReposOptions = {},
): Promise<string[]> {
  let repoPaths = await findReposRecursive(options.basePath);

  if (!options.noExclude) {
    const { db } = await getRepoDb({ basePath: options.basePath });
    const excludedPaths = new Set(
      db.repos.filter((repo) => repo.excluded).map((repo) => repo.path),
    );
    repoPaths = repoPaths.filter((repoPath) => !excludedPaths.has(repoPath));
  }

  if (options.filter) {
    repoPaths = filterRepos(repoPaths, options.filter);
  }

  return repoPaths;
}
