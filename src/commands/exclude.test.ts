import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { $ } from "bun";
import { applyExclusions } from "./exclude.js";
import { syncRepoDb } from "../lib/repo-db.js";

async function createGitRepo(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await $`git init ${path}`.quiet();
  await $`git -C ${path} config user.email "test@test.com"`.quiet();
  await $`git -C ${path} config user.name "Test User"`.quiet();
  await $`git -C ${path} checkout -b main`.quiet().nothrow();
  await Bun.write(join(path, "README.md"), "# test\n");
  await $`git -C ${path} add -A`.quiet();
  await $`git -C ${path} commit -m "init"`.quiet();
}

describe("exclude command", () => {
  test("adds direct repo exclusions and syncs DB", async () => {
    const basePath = join(tmpdir(), `exclude-cmd-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: [],
      }),
    );

    await createGitRepo(join(basePath, "alpha"));
    await createGitRepo(join(basePath, "beta"));
    await syncRepoDb({ basePath, configBasePath: basePath });

    try {
      const result = await applyExclusions({
        repos: ["alpha"],
        globs: [],
        basePath,
        configBasePath: basePath,
      });
      expect(result.repoMatched).toBe(1);
      expect(result.repoUpdated).toBe(1);

      const config = JSON.parse(
        await readFile(join(basePath, ".reposrc.json"), "utf-8"),
      );
      expect(config.exclusions).toEqual([]);

      const db = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      const alpha = db.repos.find(
        (repo: { name: string }) => repo.name === "alpha",
      );
      expect(alpha.excluded).toBe(true);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("stores glob exclusions in config without expanding to concrete repo dirs", async () => {
    const basePath = join(tmpdir(), `exclude-glob-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: [],
      }),
    );

    await createGitRepo(join(basePath, "apps", "web"));
    await createGitRepo(join(basePath, "apps", "api"));
    await createGitRepo(join(basePath, "tools"));

    try {
      const result = await applyExclusions({
        repos: [],
        globs: ["apps/*"],
        basePath,
        configBasePath: basePath,
      });

      expect(result.addedConfigExclusions).toContain("apps/*");

      const config = JSON.parse(
        await readFile(join(basePath, ".reposrc.json"), "utf-8"),
      );
      expect(config.exclusions).toContain("apps/*");
      expect(config.exclusions).not.toContain("apps/web");
      expect(config.exclusions).not.toContain("apps/api");

      const db = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      const web = db.repos.find(
        (repo: { name: string }) => repo.name === "web",
      );
      const api = db.repos.find(
        (repo: { name: string }) => repo.name === "api",
      );
      const tools = db.repos.find(
        (repo: { name: string }) => repo.name === "tools",
      );
      expect(web.excluded).toBe(false);
      expect(api.excluded).toBe(false);
      expect(tools.excluded).toBe(false);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("stores globs relative to the code directory", async () => {
    const basePath = join(tmpdir(), `exclude-rel-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: [],
      }),
    );

    await createGitRepo(join(basePath, "clones", "alpha"));
    await createGitRepo(join(basePath, "beta"));

    try {
      const result = await applyExclusions({
        repos: [],
        globs: [resolve(basePath, "clones/*")],
        basePath,
        configBasePath: basePath,
      });

      expect(result.addedConfigExclusions).toContain("clones/*");

      const config = JSON.parse(
        await readFile(join(basePath, ".reposrc.json"), "utf-8"),
      );
      expect(config.exclusions).toContain("clones/*");
      expect(config.exclusions).not.toContain(resolve(basePath, "clones/*"));
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("stores direct repo exclusion in config when no repo matches locally", async () => {
    const basePath = join(
      tmpdir(),
      `exclude-missing-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: [],
      }),
    );

    await createGitRepo(join(basePath, "alpha"));
    await syncRepoDb({ basePath, configBasePath: basePath });

    try {
      const result = await applyExclusions({
        repos: ["obsidian-notes"],
        globs: [],
        basePath,
        configBasePath: basePath,
      });

      expect(result.repoMatched).toBe(0);
      expect(result.repoUpdated).toBe(0);
      expect(result.addedConfigExclusions).toContain("obsidian-notes");

      const config = JSON.parse(
        await readFile(join(basePath, ".reposrc.json"), "utf-8"),
      );
      expect(config.exclusions).toContain("obsidian-notes");
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
