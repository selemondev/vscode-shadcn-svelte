import * as vscode from "vscode";
import { ofetch } from "ofetch";
import { to } from "./index";
import { detectPackageManager } from "./vscode";

type OgComponent = {
  type: "registry:ui";
  name: string;
  files: string[];
  dependencies?: string[];
  registryDependencies?: string[];
};

export type Component = {
  label: string;
  detail?: string;
};

export type RegistryItem = {
  name: string;
  type: string;
  registryDependencies?: string[];
  relativeUrl: string;
};

export type Components = Component[];

const COMPONENT_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_REGISTRY_COMPONENTS = 500;

export const getRegistry = async (): Promise<Components | null> => {
  const reqUrl = "https://shadcn-svelte.com/registry/index.json";
  const [res, err] = await to(ofetch(reqUrl));

  if (err || !res) {
    return null;
  }

  const [data] = await to(res);

  if (!data) {
    return null;
  }

  const seen = new Set<string>();
  const components: Components = [];

  for (const component of data as OgComponent[]) {
    if (component.type !== "registry:ui") {
      continue;
    }

    if (!COMPONENT_NAME_RE.test(component.name) || seen.has(component.name)) {
      continue;
    }

    seen.add(component.name);
    components.push({
      label: component.name,
      detail: `dependencies: ${component.registryDependencies && component.registryDependencies.length > 0 ? component.registryDependencies.join(", ") : "no dependency"}`,
    });

    if (components.length >= MAX_REGISTRY_COMPONENTS) {
      break;
    }
  }

  return components;
};

export const getInstallCmd = async (components: string[], cwd: string) => {
  const packageManager = await detectPackageManager();
  const componentStr = components.join(" ");

  if (packageManager === "bun") {
    return `bunx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
  }

  if (packageManager === "pnpm") {
    return `pnpm dlx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
  }

  return `npx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
};

export const getInitCmd = async (cwd: string) => {
  const packageManager = await detectPackageManager();

  if (packageManager === "bun") {
    return `bunx shadcn-svelte@latest init -c ${cwd}`;
  }

  if (packageManager === "pnpm") {
    return `pnpm dlx shadcn-svelte@latest init -c ${cwd}`;
  }

  return `npx shadcn-svelte@latest init -c ${cwd}`;
};

export const getComponentDocLink = async (component: string) => {
  const shadCnDocUrl = "https://shadcn-svelte.com/docs";
  return `${shadCnDocUrl}/components/${component}`;
};

/**
 * Fetch the full shadcn-svelte registry index.
 *
 * Unlike {@link getRegistry}, this returns the raw `RegistryItem[]`
 * with every entry from the index (ui components, blocks, hooks, libs, etc.)
 * without filtering, deduplication, or simplification.
 *
 * @returns The full array of registry items, or `null` on network error.
 */
export const getRegistryIndex = async (): Promise<RegistryItem[] | null> => {
  const reqUrl = "https://shadcn-svelte.com/registry/index.json";
  const [res, err] = await to(ofetch(reqUrl));

  if (err || !res) {
    return null;
  }

  const [data] = await to(res);

  if (!data) {
    return null;
  }

  return data as RegistryItem[];
};

/**
 * List installed shadcn-svelte component directories under the resolved UI path.
 *
 * Reads the given absolute path with `vscode.workspace.fs.readDirectory`
 * and returns only the basenames of directory entries. Missing or inaccessible
 * paths are handled gracefully and return an empty array.
 *
 * @param absUiPath - Absolute filesystem path to the UI components directory
 *                    (e.g. `/workspace/src/lib/components/ui`).
 * @returns Array of installed component names (directory basenames).
 */
export const getInstalledComponents = async (absUiPath: string): Promise<string[]> => {
  const uri = vscode.Uri.file(absUiPath);

  try {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries
      .filter(([, fileType]) => fileType === vscode.FileType.Directory)
      .map(([name]) => name);
  } catch (error) {
    if (error instanceof vscode.FileSystemError) {
      return [];
    }
    throw error;
  }
};

/**
 * Build a CLI update command for the given components.
 *
 * Identical in format to {@link getInstallCmd} — the `add` subcommand
 * already overwrites existing files when a component is already installed.
 *
 * @param components - Component names to update.
 * @param cwd - Working directory (the project root passed as `-c` flag).
 * @returns The CLI command string ready to be executed in a terminal.
 */
export const getUpdateCmd = async (components: string[], cwd: string) => {
  const packageManager = await detectPackageManager();
  const componentStr = components.join(" ");

  if (packageManager === "bun") {
    return `bunx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
  }

  if (packageManager === "pnpm") {
    return `pnpm dlx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
  }

  return `npx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
};
