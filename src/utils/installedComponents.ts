import * as vscode from "vscode";
import { resolveUiAliasBase } from "../completion-provider/document-config";
import { DEFAULT_LIB_ALIAS, DEFAULT_UI_ALIAS } from "../completion-provider/constants";
import type { ComponentsConfig } from "../completion-provider/types";
import type { Component, Components } from "./registry";

/**
 * Convert a resolved UI alias (e.g. `$lib/components/ui`) into a workspace-relative
 * filesystem directory (e.g. `src/lib/components/ui`).
 *
 * SvelteKit maps `$lib` to `src/lib` by default; we assume that default. Aliases that
 * don't use the `$lib` convention are returned with any leading `$`/`@` marker stripped
 * so they resolve against the workspace root.
 */
export const aliasToRelativeDir = (aliasBase: string): string => {
  const normalized = aliasBase.trim().replace(/^\.?\/+/, "").replace(/\/+$/, "");

  if (normalized === DEFAULT_LIB_ALIAS || normalized.startsWith(`${DEFAULT_LIB_ALIAS}/`)) {
    return normalized.replace(DEFAULT_LIB_ALIAS, "src/lib");
  }

  // Strip a leading path-alias marker (e.g. `@/components/ui` -> `components/ui`).
  return normalized.replace(/^[$@][^/]*\//, "");
};

const readComponentsConfig = async (
  baseUri: vscode.Uri,
): Promise<ComponentsConfig | null> => {
  try {
    const configPath = vscode.Uri.joinPath(baseUri, "components.json");
    const configContent = await vscode.workspace.fs.readFile(configPath);
    const rawConfig = Buffer.from(configContent).toString("utf8");
    return JSON.parse(rawConfig) as ComponentsConfig;
  } catch {
    return null;
  }
};

const listSubdirectories = async (dir: vscode.Uri): Promise<string[]> => {
  try {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    return entries
      .filter(([, fileType]) => fileType === vscode.FileType.Directory)
      .map(([name]) => name);
  } catch {
    return [];
  }
};

export type InstalledComponentsResult = {
  uiDir: vscode.Uri;
  /** QuickPick items for components that are both installed and present in the registry. */
  components: Components;
  /** Directory names found on disk that are not present in the registry. */
  unknown: string[];
};

/**
 * Discover installed UI components by reading `components.json`, resolving the UI alias to
 * a directory, and intersecting the directories on disk with the known registry.
 */
export const getInstalledComponents = async (
  baseUri: vscode.Uri,
  registry: Components,
): Promise<InstalledComponentsResult> => {
  const config = await readComponentsConfig(baseUri);
  const aliasBase = config ? resolveUiAliasBase(config) : DEFAULT_UI_ALIAS;
  const relativeDir = aliasToRelativeDir(aliasBase);
  const uiDir = vscode.Uri.joinPath(baseUri, relativeDir);

  const installedNames = await listSubdirectories(uiDir);
  if (!installedNames.length) {
    return { uiDir, components: [], unknown: [] };
  }

  const registryByName = new Map<string, Component>(
    registry.map((component) => [component.label, component]),
  );

  const components: Components = [];
  const unknown: string[] = [];

  for (const name of installedNames) {
    const match = registryByName.get(name);
    if (match) {
      components.push(match);
    } else {
      unknown.push(name);
    }
  }

  components.sort((a, b) => a.label.localeCompare(b.label));

  return { uiDir, components, unknown };
};
