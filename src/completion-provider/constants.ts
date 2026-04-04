import * as vscode from "vscode";

export const REGISTRY_CACHE_KEY = "shadcn-svelte.registry-cache";
export const REGISTRY_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
export const DEFAULT_LIB_ALIAS = "$lib";
export const DEFAULT_UI_ALIAS = `${DEFAULT_LIB_ALIAS}/components/ui`;
export const IMPORTS_INCLUDE_INDEX_JS_SETTING = "shadcn-svelte.imports.includeIndexJs";

export const languageSelectors: vscode.DocumentSelector = [
  { language: "svelte" },
  { language: "html" },
  { language: "javascript" },
  { language: "typescript" },
];

export const wordPattern = /[A-Za-z0-9_-]+$/;
