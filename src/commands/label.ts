import { listRepoLabels, updateRepoLabels } from "../lib/repo-db.js";

export interface LabelMutationOptions {
  globs?: string[];
  bypassOrg?: boolean;
}

export interface LabelListOptions {
  bypassOrg?: boolean;
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
    bypassOrg: options.bypassOrg,
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
    bypassOrg: options.bypassOrg,
  });

  console.log(`Label '${label}' removed from ${result.updated} repositories (${result.matched} matched).`);
}

export async function runLabelList(options: LabelListOptions = {}): Promise<void> {
  const rows = await listRepoLabels({ bypassOrg: options.bypassOrg });
  for (const row of rows) {
    const labels = row.labels.length > 0 ? row.labels.join(", ") : "-";
    console.log(`${row.name}\t${labels}\t${row.path}`);
  }
}
