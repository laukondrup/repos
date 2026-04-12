import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { $ } from "bun";
import { selectLocalRepos } from "./repo-selection.js";
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

  test("respects per-repo exclusion flag in repo DB", async () => {
    const basePath = join(tmpdir(), `repo-select-db-${randomUUID().slice(0, 8)}`);
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
    await syncRepoDb({ basePath });

    const dbPath = join(basePath, ".reposdb.json");
    const db = JSON.parse(await readFile(dbPath, "utf-8"));
    const alpha = db.repos.find((repo: { name: string }) => repo.name === "alpha");
    alpha.excluded = true;
    await writeFile(dbPath, JSON.stringify(db, null, 2) + "\n");

    try {
      const selection = await selectLocalRepos({ basePath });
      expect(selection).toHaveLength(1);
      expect(selection[0]).toContain("beta");
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("forces DB sync during selection", async () => {
    const basePath = join(tmpdir(), `repo-select-sync-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        exclusions: [],
      }),
    );

    await createGitRepo(join(basePath, "alpha"));

    try {
      const selection = await selectLocalRepos({ basePath });
      expect(selection).toHaveLength(1);
      expect(await Bun.file(join(basePath, ".reposdb.json")).exists()).toBe(true);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("filters repositories by labels from repo DB", async () => {
    const basePath = join(tmpdir(), `repo-select-labels-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        exclusions: [],
      }),
    );

    const alphaPath = join(basePath, "alpha");
    const betaPath = join(basePath, "beta");
    await createGitRepo(alphaPath, "https://github.com/acme/alpha.git");
    await createGitRepo(betaPath);

    await writeFile(
      join(basePath, ".reposdb.json"),
      JSON.stringify(
        {
          version: 1,
          repos: [
            {
              id: "local:alpha",
              name: "alpha",
              path: alphaPath,
              originFullName: null,
              labels: ["backend", "critical"],
              excluded: false,
            },
            {
              id: "local:beta",
              name: "beta",
              path: betaPath,
              originFullName: null,
              labels: ["frontend"],
              excluded: false,
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );

    try {
      const backend = await selectLocalRepos({ basePath, labels: ["backend"] });
      expect(backend).toHaveLength(1);
      expect(backend[0]).toContain("alpha");

      const criticalBackend = await selectLocalRepos({
        basePath,
        labels: ["backend", "critical"],
      });
      expect(criticalBackend).toHaveLength(1);
      expect(criticalBackend[0]).toContain("alpha");

      const none = await selectLocalRepos({
        basePath,
        labels: ["backend", "frontend"],
      });
      expect(none).toHaveLength(0);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("scopes selection to configured org by default and supports bypassOrg", async () => {
    const basePath = join(tmpdir(), `repo-select-org-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    const alphaPath = join(basePath, "alpha");
    const betaPath = join(basePath, "beta");
    const gammaPath = join(basePath, "gamma");
    await createGitRepo(alphaPath);
    await createGitRepo(betaPath);
    await createGitRepo(gammaPath);

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        org: "acme",
        exclusions: [],
      }),
    );

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
            {
              id: "origin:other/beta",
              name: "beta",
              path: betaPath,
              originFullName: "other/beta",
              labels: [],
              excluded: false,
            },
            {
              id: `local:gamma:${gammaPath}`,
              name: "gamma",
              path: gammaPath,
              originFullName: null,
              labels: [],
              excluded: false,
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );

    try {
      const scoped = await selectLocalRepos({ basePath });
      expect(scoped).toHaveLength(1);
      expect(scoped[0]).toContain("alpha");

      const bypassed = await selectLocalRepos({ basePath, bypassOrg: true });
      expect(bypassed).toHaveLength(3);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test("uses originFullName owner when DB id does not include origin owner", async () => {
    const basePath = join(tmpdir(), `repo-select-org-fallback-${randomUUID().slice(0, 8)}`);
    await mkdir(basePath, { recursive: true });

    const alphaPath = join(basePath, "alpha");
    await createGitRepo(alphaPath, "https://github.com/acme/alpha.git");

    await writeFile(
      join(basePath, ".reposrc.json"),
      JSON.stringify({
        org: "acme",
        exclusions: [],
      }),
    );

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
              originFullName: "acme/alpha",
              labels: [],
              excluded: false,
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );

    try {
      const scoped = await selectLocalRepos({ basePath });
      expect(scoped).toHaveLength(1);
      expect(scoped[0]).toContain("alpha");
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });
});
