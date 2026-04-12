import { listRepoLabels, updateRepoLabels } from "../lib/repo-db.js";

export interface LabelMutationOptions {
  globs?: string[];
}

export interface LabelListOptions {
  globs?: string[];
}

function normalizeGlobs(globs?: string[]): string[] {
  return globs?.filter(Boolean) ?? [];
}

export async function runLabelAdd(
  label: string,
  repos: string[],
  options: LabelMutationOptions,
): Promise<void> {
  const result = await updateRepoLabels({
    action: "add",
    label,
    targets: repos ?? [],
    globs: normalizeGlobs(options.globs),
  });

  console.log(`Label '${label}' added to ${result.updated} repositories (${result.matched} matched).`);
}

export async function runLabelRemove(
  label: string,
  repos: string[],
  options: LabelMutationOptions,
): Promise<void> {
  const result = await updateRepoLabels({
    action: "remove",
    label,
    targets: repos ?? [],
    globs: normalizeGlobs(options.globs),
  });

  console.log(`Label '${label}' removed from ${result.updated} repositories (${result.matched} matched).`);
}

export async function runLabelList(): Promise<void> {
  const rows = await listRepoLabels();
  for (const row of rows) {
    const labels = row.labels.length > 0 ? row.labels.join(", ") : "-";
    console.log(`${row.name}\t${labels}\t${row.path}`);
  }
}
