import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as vscode from "vscode";

const execAsync = promisify(exec);

export const HEAD_CONTENT_SCHEME = "shadcn-svelte-head";

const runGit = async (args: string, cwd: string): Promise<string | null> => {
  try {
    const { stdout } = await execAsync(`git ${args}`, { cwd, maxBuffer: 1024 * 1024 * 32 });
    return stdout;
  } catch {
    return null;
  }
};

export const getRepoRoot = async (cwd: string): Promise<string | null> => {
  const out = await runGit("rev-parse --show-toplevel", cwd);
  return out ? out.trim() : null;
};

export type DirtyStatus = {
  isRepo: boolean;
  dirty: boolean;
};

/** Report whether `targetDir` has uncommitted changes (and whether we're in a git repo at all). */
export const getDirtyStatus = async (cwd: string, targetDir: string): Promise<DirtyStatus> => {
  const repoRoot = await getRepoRoot(cwd);
  if (!repoRoot) {
    return { isRepo: false, dirty: false };
  }

  const status = await runGit(`status --porcelain -- "${targetDir}"`, cwd);
  return { isRepo: true, dirty: Boolean(status && status.trim().length > 0) };
};

export type ChangedFile = {
  /** Absolute path to the file on disk. */
  absPath: string;
  /** Path relative to the repository root (used for `git show HEAD:<path>`). */
  repoRelPath: string;
  /** True when the file is newly added (no HEAD version to diff against). */
  added: boolean;
};

/** List files under `targetDir` that changed in the working tree relative to HEAD. */
export const getChangedFiles = async (cwd: string, targetDir: string): Promise<ChangedFile[]> => {
  const repoRoot = await getRepoRoot(cwd);
  if (!repoRoot) {
    return [];
  }

  const status = await runGit(`status --porcelain -- "${targetDir}"`, cwd);
  if (!status) {
    return [];
  }

  const files: ChangedFile[] = [];
  for (const line of status.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    // Porcelain format: "XY <path>" where XY are status codes.
    const code = line.slice(0, 2);
    const filePart = line.slice(3).trim();
    // Renames are reported as "old -> new"; keep the new path.
    const repoRelPath = filePart.includes(" -> ") ? filePart.split(" -> ")[1] : filePart;
    const added = code.includes("?") || code.includes("A");

    files.push({
      absPath: path.join(repoRoot, repoRelPath),
      repoRelPath,
      added,
    });
  }

  return files;
};

/**
 * Provides the HEAD version of a file (via `git show HEAD:<path>`) for use as the left-hand
 * side of a diff. The repo cwd and repo-relative path are encoded in the URI query.
 */
export class HeadContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const cwd = params.get("cwd");
    const repoRelPath = params.get("path");

    if (!cwd || !repoRelPath) {
      return "";
    }

    const content = await runGit(`show "HEAD:${repoRelPath}"`, cwd);
    return content ?? "";
  }
}

/** Build a `shadcn-svelte-head:` URI that the provider resolves to the file's HEAD content. */
export const buildHeadUri = (cwd: string, file: ChangedFile): vscode.Uri => {
  const query = new URLSearchParams({ cwd, path: file.repoRelPath }).toString();
  return vscode.Uri.from({
    scheme: HEAD_CONTENT_SCHEME,
    path: file.repoRelPath,
    query,
  });
};
