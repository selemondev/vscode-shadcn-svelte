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
      getFileStat(file).catch(err => err.code === 'ENOENT' ? false : Promise.reject(err))
    )
  );

  if (results.some(Boolean)) {
    return 'bun';
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
  let cwd = "";
  const prefix = "${workspaceFolder}/";

  const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).filter(
    (f) => f.uri.scheme === "file"
  );

  if (!workspaceFolders.length) { return "./"; }

  const workspacePath = workspaceFolders[0]?.uri.fsPath ?? "";
  const cwdFromConfig = vscode.workspace
    .getConfiguration()
    .get<string>("terminal.integrated.cwd")
    ?.trim();

  if (cwdFromConfig) {
    if (cwdFromConfig.startsWith(prefix)) {
      cwd = cwdFromConfig.slice(prefix.length);
    }
    else if (cwdFromConfig.startsWith(workspacePath)) {
      cwd = cwdFromConfig.replace(new RegExp(`^${workspacePath}/?`), "");
    } else {
      cwd = cwdFromConfig;
    }

    return `${workspacePath}/${cwd}`;
  }

  const choice = await vscode.window.showQuickPick(
    workspaceFolders.map((f) => f.name)
  );

  if (!choice) { return "./"; }

  return workspaceFolders.find((f) => f.name === choice)?.uri.fsPath ?? "./";
};
