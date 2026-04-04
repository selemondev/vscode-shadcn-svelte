import * as vscode from "vscode";
import { DEFAULT_LIB_ALIAS, DEFAULT_UI_ALIAS, IMPORTS_INCLUDE_INDEX_JS_SETTING } from "./constants";
import type { ComponentsConfig, SnippetScope } from "./types";

const normalizeAlias = (value: string | undefined) => value?.trim().replace(/\/+$/, "");

export const resolveUiAliasBase = (config: ComponentsConfig | null) => {
  const uiAlias = normalizeAlias(config?.aliases?.ui);
  if (uiAlias) {
    return uiAlias;
  }

  const componentsAlias = normalizeAlias(config?.aliases?.components);
  if (componentsAlias) {
    return `${componentsAlias}/ui`;
  }

  const libAlias = normalizeAlias(config?.aliases?.lib) ?? DEFAULT_LIB_ALIAS;
  return `${libAlias}/components/ui`;
};

export const getIncludeIndexJsSetting = (document: vscode.TextDocument) =>
  vscode.workspace
    .getConfiguration(undefined, document.uri)
    .get<boolean>(IMPORTS_INCLUDE_INDEX_JS_SETTING, true);

export const getUiAliasBaseForDocument = async (
  document: vscode.TextDocument,
  invalidComponentsConfigWarnings: Set<string>,
) => {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    ?? vscode.workspace.workspaceFolders?.find((folder) => folder.uri.scheme === "file");

  if (!workspaceFolder) {
    return DEFAULT_UI_ALIAS;
  }

  try {
    const configPath = vscode.Uri.joinPath(workspaceFolder.uri, "components.json");
    const configContent = await vscode.workspace.fs.readFile(configPath);
    const rawConfig = Buffer.from(configContent).toString("utf8");
    const config = JSON.parse(rawConfig) as ComponentsConfig;

    invalidComponentsConfigWarnings.delete(workspaceFolder.uri.toString());
    return resolveUiAliasBase(config);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
      return DEFAULT_UI_ALIAS;
    }

    warnInvalidComponentsConfig(workspaceFolder, invalidComponentsConfigWarnings);
    return DEFAULT_UI_ALIAS;
  }
};

const warnInvalidComponentsConfig = (
  workspaceFolder: vscode.WorkspaceFolder,
  invalidComponentsConfigWarnings: Set<string>,
) => {
  const workspaceKey = workspaceFolder.uri.toString();
  if (invalidComponentsConfigWarnings.has(workspaceKey)) {
    return;
  }

  invalidComponentsConfigWarnings.add(workspaceKey);
  void vscode.window.showWarningMessage(
    `shadcn/svelte: Failed to parse components.json in ${workspaceFolder.name}. Falling back to ${DEFAULT_UI_ALIAS}.`,
  );
};

export const getSvelteSnippetScope = (
  document: vscode.TextDocument,
  position: vscode.Position,
  currentWord: string,
): SnippetScope => {
  if (currentWord.startsWith("cni") || currentWord.startsWith("shadcn-i")) {
    return "import";
  }

  if (currentWord.startsWith("cnx") || currentWord.startsWith("shadcn-x")) {
    return "usage";
  }

  const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const lastOpenScript = textBeforeCursor.lastIndexOf("<script");
  const lastCloseScript = textBeforeCursor.lastIndexOf("</script>");

  return lastOpenScript > lastCloseScript ? "import" : "usage";
};
