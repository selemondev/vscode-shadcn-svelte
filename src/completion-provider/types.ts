import * as vscode from "vscode";
import type { Components } from "../utils/registry";
import type {
  SnippetBody,
  SnippetVersion,
  StaticSnippetIndex,
} from "../utils/snippets";

export type RegistryCache = {
  components: Components;
  updatedAt: number;
};

export type RuntimeSnippet = {
  component: string;
  kind: "import" | "usage";
  version: SnippetVersion;
  body: SnippetBody;
  description: string;
  prefixes: string[];
};

export type SnippetScope = "import" | "usage";

export type CompletionData = {
  registryComponents: Components;
};

export type CompletionItemsByLanguage = {
  html: vscode.CompletionItem[];
  svelte: {
    import: vscode.CompletionItem[];
    usage: vscode.CompletionItem[];
  };
  javascript: vscode.CompletionItem[];
  typescript: vscode.CompletionItem[];
};

export type ComponentsConfig = {
  aliases?: {
    lib?: string;
    components?: string;
    ui?: string;
  };
};

export type BuildCompletionItemsParams = {
  registryComponents: Components;
  preferredVersion: SnippetVersion;
  uiAliasBase: string;
  includeIndexJs: boolean;
  staticSnippetData?: Record<SnippetVersion, StaticSnippetIndex>;
  namedImportComponents: ReadonlySet<string>;
};
