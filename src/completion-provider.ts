import * as vscode from "vscode";
import {
  REGISTRY_CACHE_KEY,
  languageSelectors,
  wordPattern,
} from "./completion-provider/constants";
import {
  getIncludeIndexJsSetting,
  getSvelteSnippetScope,
  getUiAliasBaseForDocument,
} from "./completion-provider/document-config";
import {
  buildCompletionItems,
  getNamedImportComponents,
  isRegistryCache,
  isStale,
} from "./completion-provider/snippets";
import type {
  CompletionData,
  CompletionItemsByLanguage,
  RegistryCache,
  SnippetScope,
} from "./completion-provider/types";
import { getSvelteVersion } from "./utils/getSvelteVersion";
import type { Components } from "./utils/registry";
import { getRegistry } from "./utils/registry";
import type { SnippetVersion, StaticSnippetIndex } from "./utils/snippets";
import { loadStaticSnippetData } from "./utils/snippets";

export class ShadcnSnippetCompletionProvider implements vscode.CompletionItemProvider {
  private staticSnippetData?: Record<SnippetVersion, StaticSnippetIndex>;
  private namedImportComponents = new Set<string>();
  private completionItemsCache = new Map<string, CompletionItemsByLanguage>();
  private invalidComponentsConfigWarnings = new Set<string>();
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
        this.completionItemsCache.clear();
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

    const completionItemsByLanguage = await this.getCompletionItemsForDocument(document);

    if (document.languageId === "html") {
      return new vscode.CompletionList(completionItemsByLanguage.html, false);
    }

    if (document.languageId === "javascript") {
      return new vscode.CompletionList(completionItemsByLanguage.javascript, false);
    }

    if (document.languageId === "typescript") {
      return new vscode.CompletionList(completionItemsByLanguage.typescript, false);
    }

    if (document.languageId !== "svelte") {
      return new vscode.CompletionList([], false);
    }

    const preferredScope = this.getSvelteSnippetScope(document, position, currentWord);
    return new vscode.CompletionList(completionItemsByLanguage.svelte[preferredScope], false);
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

    this.preferredVersion = await this.detectPreferredVersion();

    return {
      registryComponents,
    };
  }

  private buildCompletionItems(
    registryComponents: Components,
    preferredVersion: SnippetVersion,
    uiAliasBase: string,
    includeIndexJs: boolean,
  ) {
    return buildCompletionItems({
      registryComponents,
      preferredVersion,
      uiAliasBase,
      includeIndexJs,
      staticSnippetData: this.staticSnippetData,
      namedImportComponents: this.namedImportComponents,
    });
  }

  private async getCompletionItemsForDocument(document: vscode.TextDocument) {
    const uiAliasBase = await this.getUiAliasBaseForDocument(document);
    const includeIndexJs = this.getIncludeIndexJsSetting(document);
    const cacheKey = `${this.preferredVersion}:${uiAliasBase}:${includeIndexJs}`;
    const cached = this.completionItemsCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const items = this.buildCompletionItems(
      this.registryComponents,
      this.preferredVersion,
      uiAliasBase,
      includeIndexJs,
    );
    this.completionItemsCache.set(cacheKey, items);
    return items;
  }

  private getIncludeIndexJsSetting(document: vscode.TextDocument) {
    return getIncludeIndexJsSetting(document);
  }

  private async getUiAliasBaseForDocument(document: vscode.TextDocument) {
    return getUiAliasBaseForDocument(document, this.invalidComponentsConfigWarnings);
  }

  private getSvelteSnippetScope(
    document: vscode.TextDocument,
    position: vscode.Position,
    currentWord: string,
  ): SnippetScope {
    return getSvelteSnippetScope(document, position, currentWord);
  }
}
