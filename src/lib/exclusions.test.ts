import { describe, expect, test } from "bun:test";
import { matchesConfigExclusion } from "./exclusions.js";

describe("config exclusions", () => {
  test("treats plain directory exclusions like gitignore directory patterns", () => {
    const basePath = "/tmp/code";
    const repoPath = "/tmp/code/clones/beta";
    const repoName = "beta";

    expect(
      matchesConfigExclusion(repoPath, repoName, basePath, ["clones"]),
    ).toBe(true);
  });

  test("matches globs relative to code dir", () => {
    const basePath = "/tmp/code";
    const repoPath = "/tmp/code/apps/web";
    const repoName = "web";

    expect(
      matchesConfigExclusion(repoPath, repoName, basePath, ["apps/*"]),
    ).toBe(true);
  });
});
