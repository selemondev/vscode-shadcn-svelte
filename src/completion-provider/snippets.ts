import * as vscode from "vscode";
import type { Components } from "../utils/registry";
import type {
  SnippetBody,
  SnippetVersion,
  StaticSnippet,
  StaticSnippetIndex,
} from "../utils/snippets";
import { DEFAULT_UI_ALIAS, REGISTRY_CACHE_TTL_MS } from "./constants";
import type {
  BuildCompletionItemsParams,
  CompletionItemsByLanguage,
  RegistryCache,
  RuntimeSnippet,
} from "./types";

const specialSymbolNames = new Map([
  ["input-otp", "InputOTP"],
]);

const toPascalCase = (value: string) => {
  const specialName = specialSymbolNames.get(value);
  if (specialName) {
    return specialName;
  }

  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
};

const getDocBaseUrl = (version: SnippetVersion) =>
  version === 5 ? "https://next.shadcn-svelte.com/docs/components" : "https://shadcn-svelte.com/docs/components";

const escapeSnippetText = (value: string) => value.replaceAll("$", "\\$");

const getImportPath = (
  component: string,
  version: SnippetVersion,
  uiAliasBase: string,
  includeIndexJs: boolean,
) => {
  const suffix = version === 5 && includeIndexJs ? "/index.js" : "";
  return `${escapeSnippetText(uiAliasBase)}/${component}${suffix}`;
};

const rewriteUiImportLine = (line: string, uiAliasBase: string, includeIndexJs: boolean) => {
  const match = line.match(/(["'])([^"']*\/components\/ui\/([^"']+?))(\/index\.js)?\1/);

  if (!match) {
    return line;
  }

  const [matchedImportPath, quote, , suffix] = match;
  const importPath = `${escapeSnippetText(uiAliasBase)}/${suffix}${includeIndexJs ? "/index.js" : ""}`;
  return line.replace(matchedImportPath, () => `${quote}${importPath}${quote}`);
};

const createImportPlaceholderBody = (
  component: string,
  version: SnippetVersion,
  uiAliasBase: string,
  includeIndexJs: boolean,
): SnippetBody => {
  const symbol = toPascalCase(component);
  const importPath = getImportPath(component, version, uiAliasBase, includeIndexJs);

  return [
    `// Verify the exported API for "${component}" after installation.`,
    `// import { ${symbol} } from "${importPath}"`,
    `// import * as ${symbol} from "${importPath}"`,
  ];
};

const createUsagePlaceholderBody = (component: string): SnippetBody => {
  const symbol = toPascalCase(component);

  return [
    `<!-- Verify the "${component}" component API after import. -->`,
    `<!-- <${symbol} /> -->`,
    `<!-- <${symbol}.Root>...</${symbol}.Root> -->`,
  ];
};

const inferNamespaceUsage = (usageSnippet: StaticSnippet | undefined, symbol: string) =>
  usageSnippet?.body.some((line) => line.includes(`<${symbol}.Root`)) ?? false;

const createGenericImportBody = (
  component: string,
  version: SnippetVersion,
  uiAliasBase: string,
  includeIndexJs: boolean,
  namedImportComponents: ReadonlySet<string>,
  usageSnippet?: StaticSnippet,
): SnippetBody => {
  const symbol = toPascalCase(component);
  const importPath = getImportPath(component, version, uiAliasBase, includeIndexJs);

  if (inferNamespaceUsage(usageSnippet, symbol)) {
    return [`import * as ${symbol} from "${importPath}"`];
  }

  if (namedImportComponents.has(component)) {
    return [`import { ${symbol} } from "${importPath}"`];
  }

  return createImportPlaceholderBody(component, version, uiAliasBase, includeIndexJs);
};

const createGenericUsageBody = (
  component: string,
  version: SnippetVersion,
  namedImportComponents: ReadonlySet<string>,
  staticImport?: StaticSnippet,
): SnippetBody => {
  const importBody =
    staticImport?.body[0]
    ?? createGenericImportBody(component, version, DEFAULT_UI_ALIAS, true, namedImportComponents)[0];
  const namedImportMatch = importBody.match(/import\s+\{\s*([A-Za-z0-9_]+)\s*\}\s+from/);

  if (namedImportMatch?.[1]) {
    return [`<${namedImportMatch[1]}>`, "  $1", `</${namedImportMatch[1]}>`];
  }

  const symbol = toPascalCase(component);
  return [`<${symbol}.Root>`, "  $1", `</${symbol}.Root>`];
};

const getPrefixes = (component: string, kind: "import" | "usage", version: SnippetVersion) => {
  if (kind === "import") {
    return version === 5
      ? [`shadcn-ix-${component}`, `cni-x-${component}`]
      : [`shadcn-i-${component}`, `cni-${component}`];
  }

  return version === 5
    ? [`shadcn-x-${component}-next`, `cnx-${component}-next`]
    : [`shadcn-x-${component}`, `cnx-${component}`];
};

const createSnippet = (
  component: string,
  kind: "import" | "usage",
  version: SnippetVersion,
  uiAliasBase: string,
  includeIndexJs: boolean,
  staticSnippets: StaticSnippetIndex,
  namedImportComponents: ReadonlySet<string>,
): RuntimeSnippet => {
  const staticSnippet = staticSnippets.get(component)?.[kind];
  const staticImport = staticSnippets.get(component)?.import;
  const staticUsage = staticSnippets.get(component)?.usage;

  return {
    component,
    kind,
    version,
    body:
      kind === "import" && staticSnippet?.body
        ? staticSnippet.body.map((line) => rewriteUiImportLine(line, uiAliasBase, includeIndexJs))
        : staticSnippet?.body
          ?? (kind === "import"
            ? createGenericImportBody(component, version, uiAliasBase, includeIndexJs, namedImportComponents, staticUsage)
            : staticImport
              ? createGenericUsageBody(component, version, namedImportComponents, staticImport)
              : createUsagePlaceholderBody(component)),
    description: staticSnippet?.description ?? `${getDocBaseUrl(version)}/${component}.html`,
    prefixes: staticSnippet?.prefixes ?? getPrefixes(component, kind, version),
  };
};

const createCompletionItem = (
  snippet: RuntimeSnippet,
  prefix: string,
  preferredVersion: SnippetVersion,
): vscode.CompletionItem => {
  const item = new vscode.CompletionItem(prefix, vscode.CompletionItemKind.Snippet);
  item.insertText = new vscode.SnippetString(snippet.body.join("\n"));
  item.label = {
    label: prefix,
    description: snippet.kind,
  };
  item.detail = `shadcn/svelte ${snippet.kind} snippet (${snippet.version === 5 ? "Svelte 5" : "Svelte 4"})`;
  item.documentation = new vscode.MarkdownString(`[Docs](${snippet.description})`);
  item.sortText = `${snippet.version === preferredVersion ? "0" : "1"}-${snippet.kind}-${prefix}`;
  item.filterText = prefix;
  item.preselect = snippet.version === preferredVersion;
  item.keepWhitespace = true;

  return item;
};

const toComponentNames = (
  staticSnippetData: Record<SnippetVersion, StaticSnippetIndex>,
  registryComponents: Components,
) => {
  const names = new Set(registryComponents.map((component) => component.label));

  for (const version of [4, 5] as const) {
    for (const component of staticSnippetData[version].keys()) {
      names.add(component);
    }
  }

  return [...names].sort((left, right) => left.localeCompare(right));
};

const createItemsByLanguage = (
  importItems: vscode.CompletionItem[],
  usageItems: vscode.CompletionItem[],
): CompletionItemsByLanguage => ({
  html: usageItems,
  svelte: {
    import: importItems,
    usage: usageItems,
  },
  javascript: importItems,
  typescript: importItems,
});

export const createEmptyItemsByLanguage = (): CompletionItemsByLanguage => createItemsByLanguage([], []);

export const getNamedImportComponents = (staticSnippetData: Record<SnippetVersion, StaticSnippetIndex>) => {
  const namedImports = new Set<string>();

  for (const version of [4, 5] as const) {
    for (const [component, snippetSet] of staticSnippetData[version]) {
      const importLine = snippetSet.import?.body[0]?.trim() ?? "";
      if (importLine.startsWith("import {")) {
        namedImports.add(component);
      }
    }
  }

  return namedImports;
};

export const buildCompletionItems = ({
  registryComponents,
  preferredVersion,
  uiAliasBase,
  includeIndexJs,
  staticSnippetData,
  namedImportComponents,
}: BuildCompletionItemsParams) => {
  if (!staticSnippetData) {
    return createEmptyItemsByLanguage();
  }

  const componentNames = toComponentNames(staticSnippetData, registryComponents);
  const importItems: vscode.CompletionItem[] = [];
  const usageItems: vscode.CompletionItem[] = [];

  for (const version of [4, 5] as const) {
    const staticSnippets = staticSnippetData[version];

    for (const component of componentNames) {
      for (const kind of ["import", "usage"] as const) {
        const snippet = createSnippet(
          component,
          kind,
          version,
          uiAliasBase,
          includeIndexJs,
          staticSnippets,
          namedImportComponents,
        );

        for (const prefix of snippet.prefixes) {
          const item = createCompletionItem(snippet, prefix, preferredVersion);
          if (kind === "import") {
            importItems.push(item);
            continue;
          }

          usageItems.push(item);
        }
      }
    }
  }

  return createItemsByLanguage(importItems, usageItems);
};

export const isStale = (cache: RegistryCache | undefined) =>
  !cache || Date.now() - cache.updatedAt > REGISTRY_CACHE_TTL_MS;

export const isRegistryCache = (value: unknown): value is RegistryCache => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RegistryCache>;
  return Array.isArray(candidate.components) && typeof candidate.updatedAt === "number";
};
