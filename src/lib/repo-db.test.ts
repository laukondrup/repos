import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { $ } from "bun";
import { syncRepoDb } from "./repo-db.js";

async function createGitRepo(path: string, remoteUrl?: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await $`git init ${path}`.quiet();
  await $`git -C ${path} config user.email "test@test.com"`.quiet();
  await $`git -C ${path} config user.name "Test User"`.quiet();
  await $`git -C ${path} checkout -b main`.quiet().nothrow();
  await Bun.write(join(path, "README.md"), "# test\n");
  await $`git -C ${path} add -A`.quiet();
  await $`git -C ${path} commit -m "init"`.quiet();
  if (remoteUrl) {
    await $`git -C ${path} remote add origin ${remoteUrl}`.quiet();
  }
}

describe("repo-db sync", () => {
  test("creates repo DB beside config and links main config", async () => {
    const basePath = join(tmpdir(), `repos-db-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        org: "test-org",
        exclusionGlobs: ["clones/*"],
      }),
    );

    await createGitRepo(
      join(basePath, "alpha"),
      "https://github.com/acme/alpha.git",
    );
    await createGitRepo(
      join(basePath, "clones", "beta"),
      "https://github.com/acme/beta.git",
    );

    try {
      const result = await syncRepoDb({ basePath });
      expect(result.total).toBe(2);

      const config = JSON.parse(
        await readFile(join(basePath, ".reposrc.json"), "utf-8"),
      );
      expect(config.repoDbPath).toBe(".reposdb.json");

      const db = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      expect(Array.isArray(db.repos)).toBe(true);
      expect(db.repos).toHaveLength(2);

      const alpha = db.repos.find((repo: { name: string }) => repo.name === "alpha");
      const beta = db.repos.find((repo: { name: string }) => repo.name === "beta");
      expect(alpha.excluded).toBe(false);
      expect(beta.excluded).toBe(true);
      expect(beta.excludedReasons).toContain("glob");
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("reconciles moved repo path via originFullName and preserves labels", async () => {
    const basePath = join(tmpdir(), `repos-db-move-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusionGlobs: [],
      }),
    );

    await createGitRepo(
      join(basePath, "before-name"),
      "https://github.com/acme/move-me.git",
    );

    await writeFile(
      join(basePath, ".reposdb.json"),
      JSON.stringify(
        {
          version: 1,
          repos: [
            {
              id: "origin:acme/move-me",
              name: "before-name",
              path: join(basePath, "before-name"),
              originFullName: "acme/move-me",
              labels: ["common"],
              manuallyExcluded: true,
              excluded: true,
              excludedReasons: ["manual"],
            },
          ],
        },
        null,
        2,
      ),
    );

    await rm(join(basePath, "before-name"), { recursive: true, force: true });
    await createGitRepo(
      join(basePath, "after-name"),
      "https://github.com/acme/move-me.git",
    );

    try {
      const result = await syncRepoDb({ basePath });
      expect(result.total).toBe(1);
      expect(result.updated).toBe(1);

      const db = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      expect(db.repos).toHaveLength(1);
      expect(db.repos[0].path).toBe(join(basePath, "after-name"));
      expect(db.repos[0].name).toBe("after-name");
      expect(db.repos[0].labels).toEqual(["common"]);
      expect(db.repos[0].manuallyExcluded).toBe(true);
      expect(db.repos[0].excluded).toBe(true);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
