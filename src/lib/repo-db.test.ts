import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { $ } from "bun";
import { syncRepoDb, updateRepoLabels, listRepoLabels } from "./repo-db.js";

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
        exclusions: ["clones/*"],
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
      const result = await syncRepoDb({ basePath, configBasePath: basePath });
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

      const alpha = db.repos.find(
        (repo: { name: string }) => repo.name === "alpha",
      );
      const beta = db.repos.find(
        (repo: { name: string }) => repo.name === "beta",
      );
      expect(alpha.excluded).toBe(false);
      expect(alpha.allowSubrepos).toBe(false);
      expect(beta.excluded).toBe(false);
      expect(beta.allowSubrepos).toBe(false);

      const persistedConfig = JSON.parse(
        await readFile(join(basePath, ".reposrc.json"), "utf-8"),
      );
      expect(persistedConfig.exclusions).toContain("clones/*");
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("reconciles moved repo path via originFullName, preserves labels, and clears stale exclusion", async () => {
    const basePath = join(
      tmpdir(),
      `repos-db-move-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: [],
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
              excluded: true,
              allowSubrepos: true,
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
      const result = await syncRepoDb({ basePath, configBasePath: basePath });
      expect(result.total).toBe(1);
      expect(result.updated).toBe(1);

      const db = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      expect(db.repos).toHaveLength(1);
      expect(db.repos[0].path).toBe(join(basePath, "after-name"));
      expect(db.repos[0].name).toBe("after-name");
      expect(db.repos[0].labels).toEqual(["common"]);
      expect(db.repos[0].excluded).toBe(false);
      expect(db.repos[0].allowSubrepos).toBe(true);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("stores repo DB beside XDG config and persists repoDbPath", async () => {
    const basePath = join(
      tmpdir(),
      `repos-db-xdg-code-${randomUUID().slice(0, 8)}`,
    );
    const xdgConfigHome = join(
      tmpdir(),
      `repos-db-xdg-home-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(basePath, { recursive: true });
    await mkdir(join(xdgConfigHome, "repos"), { recursive: true });

    const originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = xdgConfigHome;

    await writeFile(
      join(xdgConfigHome, "repos", ".reposrc.json"),
      JSON.stringify({
        org: "test-org",
        codeDir: basePath,
      }),
    );

    await createGitRepo(
      join(basePath, "alpha"),
      "https://github.com/acme/alpha.git",
    );

    try {
      const result = await syncRepoDb({ basePath });
      expect(result.total).toBe(1);

      const configPath = join(xdgConfigHome, "repos", ".reposrc.json");
      const config = JSON.parse(await readFile(configPath, "utf-8"));
      expect(config.repoDbPath).toBe(".reposdb.json");

      const dbPath = join(xdgConfigHome, "repos", ".reposdb.json");
      const db = JSON.parse(await readFile(dbPath, "utf-8"));
      expect(db.repos).toHaveLength(1);
      expect(result.dbPath).toBe(dbPath);
    } finally {
      if (originalXdg === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = originalXdg;
      }
      await rm(basePath, { recursive: true, force: true });
      await rm(xdgConfigHome, { recursive: true, force: true });
    }
  });

  test("does not refresh origin for repos already mapped by path", async () => {
    const basePath = join(
      tmpdir(),
      `repos-db-origin-stable-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: [],
      }),
    );

    const alphaPath = join(basePath, "alpha");
    await createGitRepo(alphaPath, "https://github.com/acme/alpha.git");

    await writeFile(
      join(basePath, ".reposdb.json"),
      JSON.stringify(
        {
          version: 1,
          repos: [
            {
              id: "origin:acme/alpha",
              name: "alpha",
              path: alphaPath,
              originFullName: "acme/alpha",
              labels: ["stable"],
              excluded: false,
              allowSubrepos: false,
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );

    await $`git -C ${alphaPath} remote set-url origin https://github.com/other/alpha.git`.quiet();

    try {
      const result = await syncRepoDb({ basePath, configBasePath: basePath });
      expect(result.total).toBe(1);

      const db = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      expect(db.repos).toHaveLength(1);
      expect(db.repos[0].originFullName).toBe("acme/alpha");
      expect(db.repos[0].id).toBe("origin:acme/alpha");
      expect(db.repos[0].labels).toEqual(["stable"]);
      expect(db.repos[0].allowSubrepos).toBe(false);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("refreshes origin for existing local records mapped by path", async () => {
    const basePath = join(
      tmpdir(),
      `repos-db-origin-refresh-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: [],
      }),
    );

    const alphaPath = join(basePath, "alpha");
    await createGitRepo(alphaPath, "https://github.com/acme/alpha.git");

    await writeFile(
      join(basePath, ".reposdb.json"),
      JSON.stringify(
        {
          version: 1,
          repos: [
            {
              id: `local:alpha:${alphaPath}`,
              name: "alpha",
              path: alphaPath,
              originFullName: null,
              labels: ["stable"],
              excluded: false,
              allowSubrepos: false,
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );

    try {
      const result = await syncRepoDb({ basePath, configBasePath: basePath });
      expect(result.total).toBe(1);

      const db = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      expect(db.repos).toHaveLength(1);
      expect(db.repos[0].originFullName).toBe("acme/alpha");
      expect(db.repos[0].id).toBe(`local:alpha:${alphaPath}`);
      expect(db.repos[0].labels).toEqual(["stable"]);
      expect(db.repos[0].allowSubrepos).toBe(false);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("treats missing allowSubrepos in existing DB rows as false", async () => {
    const basePath = join(
      tmpdir(),
      `repos-db-allow-default-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: [],
      }),
    );

    const alphaPath = join(basePath, "alpha");
    await createGitRepo(alphaPath, "https://github.com/acme/alpha.git");

    await writeFile(
      join(basePath, ".reposdb.json"),
      JSON.stringify(
        {
          version: 1,
          repos: [
            {
              id: "origin:acme/alpha",
              name: "alpha",
              path: alphaPath,
              originFullName: "acme/alpha",
              labels: [],
              excluded: false,
            },
          ],
        },
        null,
        2,
      ),
    );

    try {
      await syncRepoDb({ basePath, configBasePath: basePath });

      const db = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      expect(db.repos).toHaveLength(1);
      expect(db.repos[0].allowSubrepos).toBe(false);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("discovers nested repos only for DB rows with allowSubrepos=true", async () => {
    const basePath = join(
      tmpdir(),
      `repos-db-allow-subrepos-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        repoDbPath: ".reposdb.json",
        exclusions: [],
      }),
    );

    const allowedParent = join(basePath, "allowed-parent");
    const blockedParent = join(basePath, "blocked-parent");
    await createGitRepo(
      allowedParent,
      "https://github.com/acme/allowed-parent.git",
    );
    await createGitRepo(
      blockedParent,
      "https://github.com/acme/blocked-parent.git",
    );

    const allowedNested = join(allowedParent, "nested", "allowed-child");
    const blockedNested = join(blockedParent, "nested", "blocked-child");
    await createGitRepo(
      allowedNested,
      "https://github.com/acme/allowed-child.git",
    );
    await createGitRepo(
      blockedNested,
      "https://github.com/acme/blocked-child.git",
    );

    try {
      await syncRepoDb({ basePath, configBasePath: basePath });

      const firstDb = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      const updatedRepos = firstDb.repos.map((repo: { id: string }) =>
        repo.id === "origin:acme/allowed-parent"
          ? { ...repo, allowSubrepos: true }
          : repo,
      );
      await writeFile(
        join(basePath, ".reposdb.json"),
        JSON.stringify({ version: 1, repos: updatedRepos }, null, 2) + "\n",
      );

      await syncRepoDb({ basePath, configBasePath: basePath });

      const db = JSON.parse(
        await readFile(join(basePath, ".reposdb.json"), "utf-8"),
      );
      const names = db.repos.map((repo: { name: string }) => repo.name).sort();

      expect(names).toContain("allowed-parent");
      expect(names).toContain("blocked-parent");
      expect(names).toContain("allowed-child");
      expect(names).not.toContain("blocked-child");

      const allowedParentRecord = db.repos.find(
        (repo: { name: string }) => repo.name === "allowed-parent",
      );
      const blockedParentRecord = db.repos.find(
        (repo: { name: string }) => repo.name === "blocked-parent",
      );
      expect(allowedParentRecord.allowSubrepos).toBe(true);
      expect(blockedParentRecord.allowSubrepos).toBe(false);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});

describe("repo-db labels", () => {
  test("adds and removes labels via repo args and globs", async () => {
    const basePath = join(
      tmpdir(),
      `repos-db-labels-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        exclusions: [],
      }),
    );

    await createGitRepo(
      join(basePath, "api-one"),
      "https://github.com/acme/api-one.git",
    );
    await createGitRepo(
      join(basePath, "api-two"),
      "https://github.com/acme/api-two.git",
    );
    await createGitRepo(
      join(basePath, "web"),
      "https://github.com/acme/web.git",
    );

    try {
      await syncRepoDb({ basePath, configBasePath: basePath });

      const added = await updateRepoLabels({
        basePath,
        configBasePath: basePath,
        action: "add",
        label: "common",
        targets: ["web"],
        globs: ["api-*"],
      });
      expect(added.matched).toBe(3);

      const labels = await listRepoLabels({
        basePath,
        configBasePath: basePath,
      });
      expect(labels.find((item) => item.name === "api-one")?.labels).toContain(
        "common",
      );
      expect(labels.find((item) => item.name === "api-two")?.labels).toContain(
        "common",
      );
      expect(labels.find((item) => item.name === "web")?.labels).toContain(
        "common",
      );

      const removed = await updateRepoLabels({
        basePath,
        configBasePath: basePath,
        action: "remove",
        label: "common",
        targets: ["api-one"],
        globs: [],
      });
      expect(removed.matched).toBe(1);

      const afterRemove = await listRepoLabels({
        basePath,
        configBasePath: basePath,
      });
      expect(
        afterRemove.find((item) => item.name === "api-one")?.labels,
      ).toEqual([]);
      expect(
        afterRemove.find((item) => item.name === "api-two")?.labels,
      ).toContain("common");
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("scopes label list/mutations to configured org unless bypassed", async () => {
    const basePath = join(
      tmpdir(),
      `repos-db-labels-org-${randomUUID().slice(0, 8)}`,
    );
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        org: "acme",
        exclusions: [],
      }),
    );

    await createGitRepo(
      join(basePath, "alpha"),
      "https://github.com/acme/alpha.git",
    );
    await createGitRepo(
      join(basePath, "beta"),
      "https://github.com/other/beta.git",
    );

    try {
      await syncRepoDb({ basePath, configBasePath: basePath });

      const scopedList = await listRepoLabels({
        basePath,
        configBasePath: basePath,
      });
      expect(scopedList).toHaveLength(1);
      expect(scopedList[0].name).toBe("alpha");

      const overrideList = await listRepoLabels({
        basePath,
        configBasePath: basePath,
        org: "other",
      });
      expect(overrideList).toHaveLength(1);
      expect(overrideList[0].name).toBe("beta");

      await updateRepoLabels({
        basePath,
        configBasePath: basePath,
        action: "add",
        label: "scoped",
        targets: [],
        globs: ["*"],
        org: "other",
      });

      const afterScoped = await listRepoLabels({
        basePath,
        configBasePath: basePath,
        bypassOrg: true,
      });
      expect(afterScoped.find((item) => item.name === "alpha")?.labels, []);
      expect(
        afterScoped.find((item) => item.name === "beta")?.labels,
      ).toContain("scoped");

      await updateRepoLabels({
        basePath,
        configBasePath: basePath,
        action: "add",
        label: "all",
        targets: [],
        globs: ["*"],
        bypassOrg: true,
      });

      const afterBypass = await listRepoLabels({
        basePath,
        configBasePath: basePath,
        bypassOrg: true,
      });
      expect(
        afterBypass.find((item) => item.name === "alpha")?.labels,
      ).toContain("all");
      expect(
        afterBypass.find((item) => item.name === "beta")?.labels,
      ).toContain("all");
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
