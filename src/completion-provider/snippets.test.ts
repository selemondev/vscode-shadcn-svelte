import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCompletionItems, createEmptyItemsByLanguage, getNamedImportComponents, isRegistryCache, isStale } from "./snippets";
import type { StaticSnippetIndex, SnippetVersion } from "../utils/snippets";
import { REGISTRY_CACHE_TTL_MS } from "./constants";

const createStaticSnippetData = (): Record<SnippetVersion, StaticSnippetIndex> => ({
  4: new Map([
    [
      "button",
      {
        import: {
          component: "button",
          body: ["import { Button } from \"$lib/components/ui/button\""],
          prefixes: ["cni-button"],
        },
        usage: {
          component: "button",
          body: ["<Button>", "  $1", "</Button>"],
          prefixes: ["cnx-button"],
        },
      },
    ],
    [
      "popover",
      {
        usage: {
          component: "popover",
          body: ["<Popover.Root>", "  $1", "</Popover.Root>"],
          prefixes: ["cnx-popover"],
        },
      },
    ],
  ]),
  5: new Map([
    [
      "button",
      {
        import: {
          component: "button",
          body: ["import { Button } from \"$lib/components/ui/button/index.js\""],
          prefixes: ["cni-x-button"],
        },
      },
    ],
  ]),
});

describe("completion snippets", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("detects named imports from static snippets", () => {
    expect(getNamedImportComponents(createStaticSnippetData())).toEqual(new Set(["button"]));
  });

  it("builds completion items with rewritten aliases and generic fallbacks", () => {
    const staticSnippetData = createStaticSnippetData();
    const items = buildCompletionItems({
      registryComponents: [
        { label: "button" },
        { label: "popover" },
        { label: "input-otp" },
      ],
      preferredVersion: 5,
      uiAliasBase: "@/custom-ui",
      includeIndexJs: false,
      staticSnippetData,
      namedImportComponents: getNamedImportComponents(staticSnippetData),
    });

    const importItem = items.svelte.import.find((item) =>
      typeof item.label !== "string" && item.label.label === "cni-x-button");
    const namespaceImport = items.svelte.import.find((item) =>
      typeof item.label !== "string" && item.label.label === "cni-popover");
    const placeholderImport = items.svelte.import.find((item) =>
      typeof item.label !== "string" && item.label.label === "cni-x-input-otp");
    const usageItem = items.svelte.usage.find((item) =>
      typeof item.label !== "string" && item.label.label === "cnx-button");

    expect(String(importItem?.insertText)).toBe("import { Button } from \"@/custom-ui/button\"");
    expect(String(namespaceImport?.insertText)).toBe("import * as Popover from \"@/custom-ui/popover\"");
    expect(String(placeholderImport?.insertText)).toContain("InputOTP");
    expect(String(usageItem?.insertText)).toBe("<Button>\n  $1\n</Button>");
    expect(importItem?.detail).toContain("Svelte 5");
    expect(importItem?.documentation?.toString()).toContain("https://");
    expect(importItem?.sortText?.startsWith("0-")).toBe(true);
    expect(items.html).toHaveLength(items.svelte.usage.length);
    expect(items.javascript).toHaveLength(items.svelte.import.length);
    expect(items.typescript).toHaveLength(items.svelte.import.length);
  });

  it("returns empty completion items when no static snippets are loaded", () => {
    expect(buildCompletionItems({
      registryComponents: [{ label: "button" }],
      preferredVersion: 4,
      uiAliasBase: "@/ui",
      includeIndexJs: true,
      namedImportComponents: new Set(),
    })).toEqual(createEmptyItemsByLanguage());
  });

  it("detects stale registry cache entries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));

    expect(isStale(undefined)).toBe(true);
    expect(isStale({
      components: [],
      updatedAt: Date.now() - REGISTRY_CACHE_TTL_MS - 1,
    })).toBe(true);
    expect(isStale({
      components: [],
      updatedAt: Date.now() - REGISTRY_CACHE_TTL_MS + 1,
    })).toBe(false);
  });

  it("validates registry cache shapes", () => {
    expect(isRegistryCache({
      components: [],
      updatedAt: Date.now(),
    })).toBe(true);
    expect(isRegistryCache({
      updatedAt: Date.now(),
    })).toBe(false);
    expect(isRegistryCache(null)).toBe(false);
  });
});
