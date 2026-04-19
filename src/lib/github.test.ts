import { afterEach, describe, expect, mock, test } from "bun:test";
import { listUserRepos } from "./github.js";

describe("github.ts", () => {
  const originalFetch = global.fetch;
  const originalGithubToken = process.env.GITHUB_TOKEN;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }
    mock.restore();
  });

  test("uses authenticated user endpoint for own account to include private repos", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const calledUrls: string[] = [];

    global.fetch = mock(async (input: unknown) => {
      const url = String(input);
      calledUrls.push(url);

      if (url.endsWith("/user")) {
        return {
          ok: true,
          json: async () => ({ login: "laukondrup" }),
          text: async () => "",
        } as Response;
      }

      if (url.includes("/user/repos?") && url.includes("page=1")) {
        return {
          ok: true,
          json: async () => [
            {
              name: "testing-123",
              full_name: "laukondrup/testing-123",
              clone_url: "https://github.com/laukondrup/testing-123.git",
              ssh_url: "git@github.com:laukondrup/testing-123.git",
              pushed_at: "2026-04-12T00:00:00Z",
              updated_at: "2026-04-12T00:00:00Z",
              archived: false,
              default_branch: "main",
            },
          ],
          text: async () => "",
        } as Response;
      }

      if (url.includes("/user/repos?") && url.includes("page=2")) {
        return {
          ok: true,
          json: async () => [],
          text: async () => "",
        } as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;

    const repos = await listUserRepos("laukondrup");

    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe("testing-123");
    expect(calledUrls.some((url) => url.includes("/user/repos?"))).toBe(true);
  });

  test("uses public user endpoint for other accounts", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const calledUrls: string[] = [];

    global.fetch = mock(async (input: unknown) => {
      const url = String(input);
      calledUrls.push(url);

      if (url.endsWith("/user")) {
        return {
          ok: true,
          json: async () => ({ login: "someone-else" }),
          text: async () => "",
        } as Response;
      }

      if (url.includes("/users/laukondrup/repos?") && url.includes("page=1")) {
        return {
          ok: true,
          json: async () => [],
          text: async () => "",
        } as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;

    await listUserRepos("laukondrup");

    expect(
      calledUrls.some((url) => url.includes("/users/laukondrup/repos?")),
    ).toBe(true);
    expect(calledUrls.some((url) => url.includes("/user/repos?"))).toBe(false);
  });
});
