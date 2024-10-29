import { workspace } from "vscode";

export const getProjectDirectory = () => {
    const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
    return workspaceFolder;
};