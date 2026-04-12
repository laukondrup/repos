import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();

function commandBlock(command: string): string {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRegex = new RegExp(
    `\\.command\\("${escaped}"\\)([\\s\\S]*?)\\.action\\(`,
    "m",
  );
  const match = source.match(blockRegex);
  return match?.[1] ?? "";
}

describe("CLI dry-run aliases", () => {
  test("uses -n alias for every --dry-run option", () => {
    const commandsWithDryRun = [
      "fetch",
      "pull",
      "clone",
      "clean",
    ];

    for (const command of commandsWithDryRun) {
      const block = commandBlock(command);
      expect(block).toContain('-n, --dry-run');
    }
  });
});

describe("CLI exclusion flags", () => {
  test("supports --no-exclude on local repo commands", () => {
    const commands = [
      "status",
      "fetch",
      "pull",
      "clean",
      "diff",
      "checkout <branch>",
      "exec <command>",
      "list",
    ];

    for (const command of commands) {
      const block = commandBlock(command);
      expect(block).toContain('--no-exclude');
    }
  });

  test("inverts commander --no-exclude flag into noExclude option", () => {
    const commands = [
      "status",
      "fetch",
      "pull",
      "clean",
      "diff",
      "checkout <branch>",
      "exec <command>",
      "list",
    ];

    for (const command of commands) {
      const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const actionRegex = new RegExp(
        `\\.command\\("${escaped}"\\)[\\s\\S]*?\\.action\\(async \\([^)]*\\) => \\{([\\s\\S]*?)\\}\\);`,
        "m",
      );
      const match = source.match(actionRegex);
      const actionBody = match?.[1] ?? "";
      expect(actionBody).toContain("noExclude: !options.exclude");
    }
  });
});

describe("CLI exec options", () => {
  test("supports --days for local activity filtering", () => {
    const block = commandBlock("exec <command>");
    expect(block).toContain('--days <number>');
  });
});

describe("CLI list options", () => {
  test("supports --days and --no-exclude for repo preview selection", () => {
    const block = commandBlock("list");
    expect(block).toContain('--days <number>');
    expect(block).toContain('--no-exclude');
  });
});

describe("CLI exclude options", () => {
  test("supports repo args and --glob for exclusions", () => {
    const block = commandBlock("exclude [repos...]");
    expect(block).toContain('--glob <pattern>');
  });
});

describe("CLI command registry", () => {
  test("includes sync command", () => {
    expect(source).toContain('.command("sync")');
  });

  test("includes label command family", () => {
    expect(source).toContain('.command("label")');
    expect(source).toContain('.command("add <label> [repos...]")');
    expect(source).toContain('.command("rm <label> [repos...]")');
    expect(source).toContain('.command("list [repos...]")');
  });
});
