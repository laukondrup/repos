import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { $ } from "bun";
import { selectLocalRepos } from "./repo-selection.js";
import { syncRepoDb } from "./repo-db.js";

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

describe("repo selection", () => {
  test("applies exclusions by default and bypasses with noExclude", async () => {
    const basePath = join(tmpdir(), `repo-select-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: ["clones/*"],
      }),
    );

    await createGitRepo(join(basePath, "alpha"));
    await createGitRepo(join(basePath, "clones", "beta"));
    await syncRepoDb({ basePath });

    try {
      const defaultSelection = await selectLocalRepos({ basePath });
      expect(defaultSelection.length).toBe(1);
      expect(defaultSelection[0]).toContain("alpha");

      const bypassSelection = await selectLocalRepos({ basePath, noExclude: true });
      expect(bypassSelection).toHaveLength(2);
      expect(bypassSelection.some((repo) => repo.includes("clones/beta"))).toBe(true);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("respects explicit path exclusions from config", async () => {
    const basePath = join(tmpdir(), `repo-select-path-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: ["alpha"],
      }),
    );

    await createGitRepo(join(basePath, "alpha"));
    await createGitRepo(join(basePath, "beta"));
    await syncRepoDb({ basePath });

    try {
      const selection = await selectLocalRepos({ basePath });
      expect(selection).toHaveLength(1);
      expect(selection[0]).toContain("beta");
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
