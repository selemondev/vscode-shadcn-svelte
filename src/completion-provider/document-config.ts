import * as vscode from "vscode";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { DEFAULT_LIB_ALIAS, DEFAULT_UI_ALIAS, IMPORTS_INCLUDE_INDEX_JS_SETTING } from "./constants";
import type { ComponentsConfig, SnippetScope } from "./types";

/**
 * Strip trailing whitespace and slashes from an alias value.
 * Returns `undefined` when the input is `undefined`.
 */
const normalizeAlias = (value: string | undefined) =>
  value?.trim().replace(/\/+$/, "");

/**
 * Resolve the UI alias base from a parsed `components.json` config.
 *
 * Fallback chain:
 * 1. `aliases.ui` — used directly
 * 2. `aliases.components` — appended with `/ui`
 * 3. `aliases.lib` — appended with `/components/ui`
 * 4. `DEFAULT_LIB_ALIAS` — appended with `/components/ui`
 *
 * @param config — Parsed components.json or `null`
 * @returns Resolved UI alias path (e.g. `$lib/components/ui`)
 */
export const resolveUiAliasBase = (config: ComponentsConfig | null) => {
  const uiAlias = normalizeAlias(config?.aliases?.ui);
  if (uiAlias) {return uiAlias;}

  const componentsAlias = normalizeAlias(config?.aliases?.components);
  if (componentsAlias) {return `${componentsAlias}/ui`;}

  const libAlias = normalizeAlias(config?.aliases?.lib) ?? DEFAULT_LIB_ALIAS;
  return `${libAlias}/components/ui`;
};

/**
 * Read and parse `components.json` from the given workspace directory.
 *
 * @param cwd — Workspace root directory path
 * @returns Parsed config object, or `null` if the file is missing or invalid
 */
export const readComponentsConfig = (cwd: string): ComponentsConfig | null => {
  const configPath = resolve(cwd, "components.json");
  if (!existsSync(configPath)) {return null;}

  try {
    const raw = readFileSync(configPath, "utf8");
    return JSON.parse(raw) as ComponentsConfig;
  } catch {
    return null;
  }
};

/**
 * Convert an alias path like `$lib/components/ui` or `@/components/ui`
 * into a relative filesystem path.
 *
 * - `$lib`  → `src/lib`  (SvelteKit convention)
 * - `@`     → `src`      (Vite convention, handles `@/` and `@scope/`)
 * - Other   → used as-is (assumed relative path)
 */
const resolveAliasToFilesystem = (alias: string): string => {
  if (alias.startsWith("$lib")) {
    const rest = alias.slice(4); // strip "$lib"
    return `src/lib${rest}`;
  }

  if (alias.startsWith("@")) {
    const withoutAt = alias.startsWith("@/") ? alias.slice(2) : alias.slice(1);
    return `src/${withoutAt}`;
  }

  return alias;
};

/**
 * Resolve the UI components directory to an absolute filesystem path.
 *
 * Reads `components.json` from the workspace, resolves the `aliases.ui`
 * alias, and converts it to an absolute path. Supports common aliases:
 * - `$lib/components/ui` → `<cwd>/src/lib/components/ui` (SvelteKit)
 * - `@/components/ui`    → `<cwd>/src/components/ui`     (Vite)
 *
 * @param cwd — Workspace root directory path
 * @returns Absolute path to the UI components directory, or `null` if
 *          `components.json` is missing or unreadable
 */
export const resolveUiComponentsPath = (cwd: string): string | null => {
  const config = readComponentsConfig(cwd);
  if (!config) {return null;}

  const uiAlias = resolveUiAliasBase(config);
  const fsPath = resolveAliasToFilesystem(uiAlias);
  return resolve(cwd, fsPath);
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
