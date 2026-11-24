import { posix, win32 } from "node:path";
import * as vscode from "vscode";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export const executeCommand = (cmd: string, createNew = true): void => {
  let terminal = vscode.window.activeTerminal;
  if (createNew || !terminal) {
    terminal = vscode.window.createTerminal();
  }

  terminal.show();
  terminal.sendText(cmd);
};

export const getFileStat = async (fileName: string) => {
  // Get the currently opened workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) {
    return null;
  }

  for (const workspaceFolder of workspaceFolders) {
    const filePath = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
    try {
      const fileMetadata = await vscode.workspace.fs.stat(filePath);

      return fileMetadata;
    } catch (error) {
      return null;
    }
  }
};

export const detectPackageManager = async (): Promise<PackageManager> => {
  const lockFiles = ["bun.lock", "bun.lockb"];
  const results = await Promise.all(
    lockFiles.map((file) =>
      getFileStat(file).catch((err) =>
        err.code === "ENOENT" ? false : Promise.reject(err),
      ),
    ),
  );

  if (results.some(Boolean)) {
    return "bun";
  }

  const pnpmLockExists = await getFileStat("pnpm-lock.yaml");
  if (pnpmLockExists) {
    return "pnpm";
  }

  const yarnLockExists = await getFileStat("yarn.lock");
  if (yarnLockExists) {
    return "yarn";
  }

  return "npm";
};

const WORKSPACE_FOLDER_VAR = "${workspaceFolder}";

// win32.isAbsolute treats both drive paths and leading-slash paths as absolute,
// so POSIX and Windows values are recognized on either host.
const isAbsolutePath = (value: string): boolean => win32.isAbsolute(value);

const joinWorkspacePath = (workspacePath: string, relativePath: string): string => {
  const pathApi = workspacePath.includes("\\") || /^[A-Za-z]:/.test(workspacePath) ? win32 : posix;
  return pathApi.join(workspacePath, relativePath);
};

const workspaceFolderSuffix = (configured: string): string | undefined => {
  if (configured === WORKSPACE_FOLDER_VAR) {
    return "";
  }

  if (!configured.startsWith(WORKSPACE_FOLDER_VAR)) {
    return undefined;
  }

  const rest = configured.slice(WORKSPACE_FOLDER_VAR.length);
  if (rest.startsWith("/") || rest.startsWith("\\")) {
    return rest.replace(/^[\\/]+/, "");
  }

  return undefined;
};

const resolveConfiguredCwd = (configured: string, workspacePath: string): string | undefined => {
  if (isAbsolutePath(configured)) {
    return configured;
  }

  const suffix = workspaceFolderSuffix(configured);
  const relativePath = suffix ?? configured;
  if (!workspacePath) {
    return undefined;
  }

  if (!relativePath) {
    return workspacePath;
  }

  return joinWorkspacePath(workspacePath, relativePath);
};

export const getOrChooseCwd = async (): Promise<string> => {
  const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(
    (f) => f.uri.scheme === "file",
  );
  const workspacePath = workspaceFolders[0]?.uri.fsPath ?? "";
  const cwdFromConfig = vscode.workspace
    .getConfiguration()
    .get<string>("shadcn-svelte.cwd")
    ?.trim();

  if (cwdFromConfig) {
    const resolved = resolveConfiguredCwd(cwdFromConfig, workspacePath);
    if (resolved) {
      return resolved;
    }
  }

  if (!workspaceFolders.length) {
    return "./";
  }

  const choice = await vscode.window.showQuickPick(
    workspaceFolders.map((f) => f.name),
  );

  if (!choice) {
    return "./";
  }

  return workspaceFolders.find((f) => f.name === choice)?.uri.fsPath ?? "./";
};
