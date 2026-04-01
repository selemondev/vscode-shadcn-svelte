import * as fs from "node:fs/promises";
import * as path from "node:path";

export type SnippetBody = string[];

type RawSnippet = {
  prefix?: string | string[];
  body?: string | string[];
  description?: string;
};

type GeneratedSnippetManifest = {
  components?: Record<string, {
    description?: string;
    import?: string[];
    usage?: string[];
  }>;
};

export type SnippetKind = "import" | "usage";
export type SnippetVersion = 4 | 5;

export type StaticSnippet = {
  component: string;
  body: SnippetBody;
  description?: string;
  prefixes: string[];
};

type ComponentSnippetSet = {
  import?: StaticSnippet;
  usage?: StaticSnippet;
};

export type StaticSnippetIndex = Map<string, ComponentSnippetSet>;

const COMPONENT_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SNIPPET_LINES = 200;
const MAX_SNIPPET_LINE_LENGTH = 500;

const STATIC_SNIPPET_FILES: Array<{
  file: string;
  kind: SnippetKind;
  version: SnippetVersion;
}> = [
  {
    file: "src/snippets/imports-code-snippets.json",
    kind: "import",
    version: 4,
  },
  {
    file: "src/snippets/imports-code-snippets-next.json",
    kind: "import",
    version: 5,
  },
  {
    file: "src/snippets/usage-code-snippets.json",
    kind: "usage",
    version: 4,
  },
  {
    file: "src/snippets/usage-code-snippets-next.json",
    kind: "usage",
    version: 5,
  },
];

const GENERATED_SNIPPET_MANIFEST = "src/snippets/generated-upstream-next.json";

const IMPORT_PREFIX_RE = /^cni(?:-x)?-(.+)$/;
const USAGE_PREFIX_RE = /^cnx-(.+?)(?:-next)?$/;

const toArray = (value: string | string[] | undefined): string[] => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const normalizeBody = (value: string | string[] | undefined): SnippetBody => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const isSafeSnippetBody = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= MAX_SNIPPET_LINES &&
  value.every((line) => typeof line === "string" && line.length <= MAX_SNIPPET_LINE_LENGTH);

const getComponentFromPrefixes = (prefixes: string[], kind: SnippetKind) => {
  const matcher = kind === "import" ? IMPORT_PREFIX_RE : USAGE_PREFIX_RE;

  for (const prefix of prefixes) {
    const match = prefix.match(matcher);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
};

const loadSnippetIndex = async (
  extensionPath: string,
  file: string,
  kind: SnippetKind,
): Promise<Map<string, StaticSnippet>> => {
  const filePath = path.join(extensionPath, file);
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw) as Record<string, RawSnippet>;
  const snippets = new Map<string, StaticSnippet>();

  for (const value of Object.values(data)) {
    const prefixes = toArray(value.prefix);
    const component = getComponentFromPrefixes(prefixes, kind);

    if (!component) {
      continue;
    }

    snippets.set(component, {
      component,
      body: normalizeBody(value.body),
      description: value.description,
      prefixes,
    });
  }

  return snippets;
};

export const loadStaticSnippetData = async (
  extensionPath: string,
): Promise<Record<SnippetVersion, StaticSnippetIndex>> => {
  const versionedData: Record<SnippetVersion, StaticSnippetIndex> = {
    4: new Map(),
    5: new Map(),
  };

  for (const snippetFile of STATIC_SNIPPET_FILES) {
    const snippets = await loadSnippetIndex(extensionPath, snippetFile.file, snippetFile.kind);
    const versionData = versionedData[snippetFile.version];

    for (const [component, snippet] of snippets) {
      const existing = versionData.get(component) ?? {};
      existing[snippetFile.kind] = snippet;
      versionData.set(component, existing);
    }
  }

  const generatedManifestPath = path.join(extensionPath, GENERATED_SNIPPET_MANIFEST);
  const generatedManifest = await fs.readFile(generatedManifestPath, "utf8")
    .then((raw) => JSON.parse(raw) as GeneratedSnippetManifest)
    .catch(() => null);

  if (generatedManifest?.components) {
    for (const [component, snippets] of Object.entries(generatedManifest.components)) {
      if (!COMPONENT_NAME_RE.test(component)) {
        continue;
      }

      const existing = versionedData[5].get(component) ?? {};

      if (isSafeSnippetBody(snippets.import)) {
        existing.import = {
          component,
          body: snippets.import,
          description: snippets.description,
          prefixes: [`shadcn-ix-${component}`, `cni-x-${component}`],
        };
      }

      if (isSafeSnippetBody(snippets.usage)) {
        existing.usage = {
          component,
          body: snippets.usage,
          description: snippets.description,
          prefixes: [`shadcn-x-${component}-next`, `cnx-${component}-next`],
        };
      }

      versionedData[5].set(component, existing);
    }
  }

  return versionedData;
};
