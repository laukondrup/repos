import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

function caseBlock(command: string): string {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`case "${escaped}":[\\s\\S]*?return \\[([\\s\\S]*?)\\];`, "m");
  const match = source.match(regex);
  return match?.[1] ?? "";
}

describe("interactive local repo filtering", () => {
  test("exposes labels, include-excluded, and bypass-org toggles for local repo commands", () => {
    const commands = ["status", "fetch", "pull", "diff", "checkout", "exec", "list", "clean"];

    for (const command of commands) {
      const block = caseBlock(command);
      expect(block).toContain('name: "labels"');
      expect(block).toContain('name: "noExclude"');
      expect(block).toContain('name: "bypassOrg"');
    }
  });

  test("passes labels, noExclude, and bypassOrg to command runners", () => {
    const snippets = [
      'command: "status",',
      'command: "fetch",',
      'command: "pull",',
      'command: "diff",',
      'command: "checkout",',
      'command: "exec",',
      'command: "list",',
      'command: "clean",',
    ];

    for (const snippet of snippets) {
      const idx = source.indexOf(snippet);
      expect(idx).toBeGreaterThanOrEqual(0);
      const tail = source.slice(idx, idx + 700);
      expect(tail).toContain("labels: parseLabelsInput");
      expect(tail).toContain("noExclude: values.noExclude");
      expect(tail).toContain("bypassOrg: values.bypassOrg");
    }
  });
});
