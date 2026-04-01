import * as vscode from "vscode";
import { getSvelteVersion } from "./utils/getSvelteVersion";
import type { Components } from "./utils/registry";
import { getRegistry } from "./utils/registry";
import type {
  SnippetBody,
  SnippetVersion,
  StaticSnippet,
  StaticSnippetIndex,
} from "./utils/snippets";
import { loadStaticSnippetData } from "./utils/snippets";

type RegistryCache = {
  components: Components;
  updatedAt: number;
};

type RuntimeSnippet = {
  component: string;
  kind: "import" | "usage";
  version: SnippetVersion;
  body: SnippetBody;
  description: string;
  prefixes: string[];
};

type SnippetScope = "import" | "usage";

type CompletionData = {
  itemsByLanguage: CompletionItemsByLanguage;
  registryComponents: Components;
};

type CompletionItemsByLanguage = {
  html: vscode.CompletionItem[];
  svelte: {
    import: vscode.CompletionItem[];
    usage: vscode.CompletionItem[];
  };
  javascript: vscode.CompletionItem[];
  typescript: vscode.CompletionItem[];
};

const REGISTRY_CACHE_KEY = "shadcn-svelte.registry-cache";
const REGISTRY_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

const languageSelectors: vscode.DocumentSelector = [
  { language: "svelte" },
  { language: "html" },
  { language: "javascript" },
  { language: "typescript" },
];

const wordPattern = /[A-Za-z0-9_-]+$/;

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

const getImportPath = (component: string, version: SnippetVersion) =>
  version === 5
    ? `$$lib/components/ui/${component}/index.js`
    : `$$lib/components/ui/${component}`;

const createImportPlaceholderBody = (component: string, version: SnippetVersion): SnippetBody => {
  const symbol = toPascalCase(component);
  const importPath = getImportPath(component, version);

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
  namedImportComponents: ReadonlySet<string>,
  usageSnippet?: StaticSnippet,
): SnippetBody => {
  const symbol = toPascalCase(component);
  const importPath = getImportPath(component, version);

  if (inferNamespaceUsage(usageSnippet, symbol)) {
    return [`import * as ${symbol} from "${importPath}"`];
  }

  if (namedImportComponents.has(component)) {
    return [`import { ${symbol} } from "${importPath}"`];
  }

  return createImportPlaceholderBody(component, version);
};

const createGenericUsageBody = (
  component: string,
  version: SnippetVersion,
  namedImportComponents: ReadonlySet<string>,
  staticImport?: StaticSnippet,
): SnippetBody => {
  const importBody = staticImport?.body[0] ?? createGenericImportBody(component, version, namedImportComponents)[0];
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
      staticSnippet?.body ??
      (kind === "import"
        ? createGenericImportBody(component, version, namedImportComponents, staticUsage)
        : staticImport
          ? createGenericUsageBody(component, version, namedImportComponents, staticImport)
          : createUsagePlaceholderBody(component)),
    description:
      staticSnippet?.description ??
      `${getDocBaseUrl(version)}/${component}.html`,
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

const getNamedImportComponents = (staticSnippetData: Record<SnippetVersion, StaticSnippetIndex>) => {
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

const createEmptyItemsByLanguage = (): CompletionItemsByLanguage => createItemsByLanguage([], []);

const isStale = (cache: RegistryCache | undefined) =>
  !cache || Date.now() - cache.updatedAt > REGISTRY_CACHE_TTL_MS;

const isRegistryCache = (value: unknown): value is RegistryCache => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RegistryCache>;
  return Array.isArray(candidate.components) && typeof candidate.updatedAt === "number";
};

export class ShadcnSnippetCompletionProvider implements vscode.CompletionItemProvider {
  private staticSnippetData?: Record<SnippetVersion, StaticSnippetIndex>;
  private namedImportComponents = new Set<string>();
  private completionItemsByLanguage: CompletionItemsByLanguage = createEmptyItemsByLanguage();
  private registryComponents: Components = [];
  private preferredVersion: SnippetVersion = 5;
  private refreshPromise?: Promise<CompletionData>;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async initialize() {
    this.staticSnippetData = await loadStaticSnippetData(this.context.extensionPath);
    this.namedImportComponents = getNamedImportComponents(this.staticSnippetData);
    this.preferredVersion = await this.detectPreferredVersion();

    const cachedRegistry = this.getCachedRegistry();
    this.registryComponents = cachedRegistry?.components ?? [];
    this.completionItemsByLanguage = this.buildCompletionItems(this.registryComponents, this.preferredVersion);

    if (isStale(cachedRegistry)) {
      void this.refresh();
    }
  }

  register() {
    return vscode.languages.registerCompletionItemProvider(
      languageSelectors,
      this,
      "-",
    );
  }

  async refresh(force = false) {
    if (!force && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.loadLatestCompletionData()
      .then((data) => {
        this.registryComponents = data.registryComponents;
        this.completionItemsByLanguage = data.itemsByLanguage;
        return data;
      })
      .finally(() => {
        this.refreshPromise = undefined;
      });

    return this.refreshPromise;
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionList<vscode.CompletionItem>> {
    const range = document.getWordRangeAtPosition(position, wordPattern);
    const currentWord = range ? document.getText(range) : "";

    if (!currentWord.startsWith("cn") && !currentWord.startsWith("shadcn")) {
      return new vscode.CompletionList([]);
    }

    if (document.languageId !== "svelte") {
      if (document.languageId === "html") {
        return new vscode.CompletionList(this.completionItemsByLanguage.html, false);
      }

      if (document.languageId === "javascript") {
        return new vscode.CompletionList(this.completionItemsByLanguage.javascript, false);
      }

      if (document.languageId === "typescript") {
        return new vscode.CompletionList(this.completionItemsByLanguage.typescript, false);
      }

      return new vscode.CompletionList([], false);
    }

    const preferredScope = this.getSvelteSnippetScope(document, position, currentWord);
    return new vscode.CompletionList(this.completionItemsByLanguage.svelte[preferredScope], false);
  }

  getRegistryComponents() {
    return this.registryComponents;
  }

  private async detectPreferredVersion(): Promise<SnippetVersion> {
    const version = await getSvelteVersion();
    return version >= 5 ? 5 : 4;
  }

  private getCachedRegistry() {
    const cached = this.context.globalState.get<unknown>(REGISTRY_CACHE_KEY);
    return isRegistryCache(cached) ? cached : undefined;
  }

  private async loadLatestCompletionData(): Promise<CompletionData> {
    const registryComponents = (await getRegistry()) ?? this.registryComponents;

    if (registryComponents.length > 0) {
      await this.context.globalState.update(REGISTRY_CACHE_KEY, {
        components: registryComponents,
        updatedAt: Date.now(),
      } satisfies RegistryCache);
    }

    const preferredVersion = await this.detectPreferredVersion();
    this.preferredVersion = preferredVersion;

    return {
      registryComponents,
      itemsByLanguage: this.buildCompletionItems(registryComponents, preferredVersion),
    };
  }

  private buildCompletionItems(
    registryComponents: Components,
    preferredVersion: SnippetVersion,
  ) {
    if (!this.staticSnippetData) {
      return createEmptyItemsByLanguage();
    }

    const componentNames = toComponentNames(this.staticSnippetData, registryComponents);
    const importItems: vscode.CompletionItem[] = [];
    const usageItems: vscode.CompletionItem[] = [];

    for (const version of [4, 5] as const) {
      const staticSnippets = this.staticSnippetData[version];

      for (const component of componentNames) {
        for (const kind of ["import", "usage"] as const) {
          const snippet = createSnippet(
            component,
            kind,
            version,
            staticSnippets,
            this.namedImportComponents,
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
  }

  private getSvelteSnippetScope(
    document: vscode.TextDocument,
    position: vscode.Position,
    currentWord: string,
  ): SnippetScope {
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
  }
}
