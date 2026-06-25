import * as path from "node:path";
import * as vscode from "vscode";
import { buildHeadUri, getChangedFiles } from "./git";

/**
 * After an update runs, open a diff tab (HEAD -> working tree) for every changed file under
 * the UI directory so the user is walked through each change and can revert via git if needed.
 *
 * @returns the number of changed files for which a diff was opened.
 */
export const openComponentDiffs = async (cwd: string, uiDir: string): Promise<number> => {
  const changedFiles = await getChangedFiles(cwd, uiDir);

  for (const file of changedFiles) {
    const fileUri = vscode.Uri.file(file.absPath);
    const fileName = path.basename(file.absPath);

    // Newly added files have no HEAD version; an empty left side reads as "all new".
    const headUri = buildHeadUri(cwd, file);
    const title = file.added ? `${fileName} (new)` : `${fileName} (updated ↔ HEAD)`;

    await vscode.commands.executeCommand(
      "vscode.diff",
      headUri,
      fileUri,
      title,
      { preview: false },
    );
  }

  return changedFiles.length;
};
