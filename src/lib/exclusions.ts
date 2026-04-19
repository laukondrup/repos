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
    const normalized = item.trim().replace(/\\/g, "/");
    if (!normalized) return false;

    if (normalized.startsWith("/")) {
      if (isGlobPattern(normalized)) {
        const relFromRoot = relative(basePath, resolve(normalized)).replace(
          /\\/g,
          "/",
        );
        if (!relFromRoot.startsWith("..")) {
          const regex = globToRegex(relFromRoot);
          return regex.test(relPath);
        }
      }
      return resolve(normalized) === resolve(recordPath);
    }

    if (isGlobPattern(normalized)) {
      const regex = globToRegex(normalized.replace(/^\.?\//, ""));
      return (
        regex.test(relPath) ||
        (!normalized.includes("/") && regex.test(repoName))
      );
    }

    const trimmed = normalized.replace(/^\.?\//, "").replace(/\/+$/, "");
    if (!trimmed) return false;

    if (trimmed.includes("/")) {
      return relPath === trimmed || relPath.startsWith(`${trimmed}/`);
    }

    if (relPath === trimmed || relPath.startsWith(`${trimmed}/`)) {
      return true;
    }

    const segments = relPath.split("/");
    return segments.includes(trimmed) || repoName === trimmed;
  });
}
