export interface GitHubConfig {
  host: string;
  apiUrl: string;
}

export interface ReposConfig {
  github?: GitHubConfig;
  org?: string;
  codeDir?: string;
  daysThreshold?: number;
  parallel?: number;
  timeout?: number;
  diffMaxLines?: number;
  repoDbPath?: string;
  exclusions?: string[];
}

export const DEFAULT_CONFIG: Required<ReposConfig> = {
  github: {
    host: "github.com",
    apiUrl: "https://api.github.com",
  },
  org: "",
  codeDir: "",
  daysThreshold: 90,
  parallel: 10,
  timeout: 30000,
  diffMaxLines: 500,
  repoDbPath: "",
  exclusions: [],
};

export interface RepoStatus {
  name: string;
  path: string;
  branch: string;
  modified: number;
  staged: number;
  untracked: number;
  deleted: number;
  ahead: number;
  behind: number;
  isClean: boolean;
  hasUpstream: boolean;
}

export interface RepoOperationResult {
  name: string;
  success: boolean;
  message: string;
  error?: string;
  details?: string;
}

export interface GitHubRepo {
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  pushedAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface CloneOptions {
  dryRun?: boolean;
  org?: string;
  host?: string;
  days?: number;
  parallel?: number;
  shallow?: boolean;
  interactive?: boolean;
  basePath?: string;
}

export interface StatusOptions {
  summary?: boolean;
  quiet?: boolean;
  filter?: string;
  labels?: string[];
  fetch?: boolean;
  basePath?: string;
  noExclude?: boolean;
  bypassOrg?: boolean;
}

export interface UpdateOptions {
  dryRun?: boolean;
  parallel?: number;
  filter?: string;
  labels?: string[];
  quiet?: boolean;
  interactive?: boolean;
  basePath?: string;
  noExclude?: boolean;
  bypassOrg?: boolean;
}

export interface CleanupOptions {
  dryRun?: boolean;
  force?: boolean;
  all?: boolean;
  filter?: string;
  labels?: string[];
  interactive?: boolean;
  basePath?: string;
  noExclude?: boolean;
  bypassOrg?: boolean;
}

export interface FetchOptions {
  dryRun?: boolean;
  prune?: boolean;
  all?: boolean;
  parallel?: number;
  filter?: string;
  labels?: string[];
  quiet?: boolean;
  interactive?: boolean;
  basePath?: string;
  noExclude?: boolean;
  bypassOrg?: boolean;
}

export interface DiffOptions {
  filter?: string;
  labels?: string[];
  quiet?: boolean;
  stat?: boolean;
  parallel?: number;
  interactive?: boolean;
  basePath?: string;
  maxLines?: number;
  noExclude?: boolean;
  bypassOrg?: boolean;
}

export interface CheckoutOptions {
  branch: string;
  filter?: string;
  labels?: string[];
  create?: boolean;
  force?: boolean;
  parallel?: number;
  interactive?: boolean;
  basePath?: string;
  noExclude?: boolean;
  bypassOrg?: boolean;
}

export interface ExecOptions {
  command: string;
  filter?: string;
  labels?: string[];
  parallel?: number;
  quiet?: boolean;
  interactive?: boolean;
  basePath?: string;
  noExclude?: boolean;
  days?: number;
  bypassOrg?: boolean;
}

export interface ListOptions {
  filter?: string;
  labels?: string[];
  days?: number;
  json?: boolean;
  basePath?: string;
  noExclude?: boolean;
  bypassOrg?: boolean;
}

export interface ExcludeOptions {
  repos: string[];
  globs: string[];
  basePath?: string;
  configBasePath?: string;
  bypassOrg?: boolean;
}

export interface RepoDbRepoRecord {
  id: string;
  name: string;
  path: string;
  originFullName: string | null;
  labels: string[];
  excluded: boolean;
  allowSubrepos: boolean;
}

export interface RepoDb {
  version: number;
  repos: RepoDbRepoRecord[];
}

export interface ConfigOptions {
  get?: string;
  set?: string;
  value?: string;
  list?: boolean;
  location?: "cwd" | "home" | "global";
}

export interface GhCliHost {
  oauthToken?: string;
  user?: string;
  gitProtocol?: string;
}

export interface GhCliConfig {
  hosts: Record<string, GhCliHost>;
}

export interface OperationStats {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
}
