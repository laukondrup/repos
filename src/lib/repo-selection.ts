import { filterRepos, findReposRecursive } from "./repos.js";
import { getRepoDb } from "./repo-db.js";
import { resolveCodeDir } from "./config.js";

export interface SelectLocalReposOptions {
  basePath?: string;
  filter?: string;
  noExclude?: boolean;
}

export async function selectLocalRepos(
  options: SelectLocalReposOptions = {},
): Promise<string[]> {
  const codeDir = await resolveCodeDir(options.basePath);
  let repoPaths = await findReposRecursive(codeDir);

  if (!options.noExclude) {
    const { db } = await getRepoDb({
      basePath: codeDir,
      configBasePath: options.basePath ? codeDir : undefined,
    });
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
