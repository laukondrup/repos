import { describe, expect, test } from "bun:test";
import { applyCloneExclusions } from "./clone.js";
import type { GitHubRepo } from "../types.js";

function makeRepo(name: string): GitHubRepo {
  return {
    name,
    fullName: `acme/${name}`,
    cloneUrl: `https://github.com/acme/${name}.git`,
    sshUrl: `git@github.com:acme/${name}.git`,
    pushedAt: "2026-04-12T00:00:00Z",
    updatedAt: "2026-04-12T00:00:00Z",
    archived: false,
  };
}

describe("clone exclusions", () => {
  test("excludes matching repo names from clone candidates", () => {
    const repos = [
      makeRepo("alpha"),
      makeRepo("obsidian-notes"),
      makeRepo("beta"),
    ];

    const filtered = applyCloneExclusions(repos, "/tmp/code", [
      "obsidian-notes",
    ]);

    expect(filtered.map((repo) => repo.name)).toEqual(["alpha", "beta"]);
  });

  test("supports glob exclusions for clone candidates", () => {
    const repos = [makeRepo("app-api"), makeRepo("app-web"), makeRepo("infra")];

    const filtered = applyCloneExclusions(repos, "/tmp/code", ["app-*"]);

    expect(filtered.map((repo) => repo.name)).toEqual(["infra"]);
  });
});
