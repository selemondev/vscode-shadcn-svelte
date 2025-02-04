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
  const bunLockExists = await getFileStat("bun.lockb");
  if (bunLockExists) {
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

export const getOrChooseCwd = async (): Promise<string> => {
  const cwdFromConfig = vscode.workspace
    .getConfiguration("shadcn-svelte")
    .get<string>("cwd")
    ?.trim();

  // Always use the value from settings if it's provided
  if (cwdFromConfig) {
    return cwdFromConfig;
  }

  // Get the currently opened workspace folders
  const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(
    (f) => f.uri.scheme === "file"
  );

  // If there are no workspace folders open, just use the current working dir
  if (!workspaceFolders.length) {
    return "./";
  }

  // If there are multiple workspaces open, allow the user to pick which one
  // they want to use.
  const choice = await vscode.window.showQuickPick(
    workspaceFolders.map((f) => f.name)
  );

  if (!choice) {
    return "./";
  }

  // Map the chosen workspace name to absolute path
  const fsPath = workspaceFolders.find((f) => f.name === choice)?.uri.fsPath;

  return fsPath ?? "./";
};