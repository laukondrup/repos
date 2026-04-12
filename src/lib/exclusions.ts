import { relative, resolve } from "path";

export function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function isGlobPattern(value: string): boolean {
  return /[*?\[\]]/.test(value);
}

export function matchesConfigExclusion(
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
