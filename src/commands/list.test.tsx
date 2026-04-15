import { describe, expect, test } from "bun:test";
import { toDisplayRepoPath, toListedRepo } from "./list.js";

describe("list display paths", () => {
  test("renders repo paths relative to code dir", () => {
    const codeDir = "/tmp/code";
    const repoPath = "/tmp/code/clones/api";
    expect(toDisplayRepoPath(codeDir, repoPath)).toBe("clones/api");
  });

  test("falls back to absolute path outside of code dir", () => {
    const codeDir = "/tmp/code";
    const repoPath = "/tmp/other/repo";
    expect(toDisplayRepoPath(codeDir, repoPath)).toBe(repoPath);
  });

  test("builds structured list entry", () => {
    const codeDir = "/tmp/code";
    const repoPath = "/tmp/code/clones/api";
    expect(toListedRepo(codeDir, repoPath)).toEqual({
      name: "api",
      path: repoPath,
      displayPath: "clones/api",
    });
  });
});
