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
      "update",
      "clone",
      "clean",
      "cleanup",
    ];

    for (const command of commandsWithDryRun) {
      const block = commandBlock(command);
      expect(block).toContain('-n, --dry-run');
    }
  });
});
