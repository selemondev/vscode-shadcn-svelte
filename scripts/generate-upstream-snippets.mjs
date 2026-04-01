import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);

const getArgValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
};

const upstreamDir = path.resolve(getArgValue("--upstream-dir", "/tmp/shadcn-svelte-upstream"));
const outputPath = path.resolve(
  getArgValue("--output", "src/snippets/generated-upstream-next.json"),
);
const overridesPath = path.resolve(
  getArgValue("--overrides", "scripts/upstream-snippet-overrides.json"),
);

const DOCS_COMPONENTS_DIR = path.join(upstreamDir, "docs", "content", "components");
const REGISTRY_DIR = path.join(upstreamDir, "docs", "static", "registry", "styles", "luma");
const DOCS_URL_BASE = "https://shadcn-svelte.com/docs/components";

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));

const toPosix = (value) => value.replaceAll(path.sep, "/");

const stripCodeFence = (value) => value.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "");

const normalizeCode = (value) => {
  const normalized = value
    .replaceAll("\r\n", "\n")
    .replaceAll("$lib/registry/", "$lib/components/")
    .trim();

  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return lines.map((line) => line.slice(minIndent));
};

const parseFrontmatter = (source) => {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { body: source, data: {} };
  }

  const frontmatter = match[1];
  const data = {};

  for (const line of frontmatter.split("\n")) {
    const keyValueMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
    if (!keyValueMatch) {
      continue;
    }

    const [, key, rawValue] = keyValueMatch;
    if (rawValue === "true" || rawValue === "false") {
      data[key] = rawValue === "true";
      continue;
    }

    data[key] = rawValue;
  }

  return {
    body: source.slice(match[0].length),
    data,
  };
};

const extractSection = (source, heading) => {
  const headingPattern = new RegExp(`^## ${heading}\\s*$`, "m");
  const headingMatch = headingPattern.exec(source);

  if (!headingMatch) {
    return null;
  }

  const start = headingMatch.index + headingMatch[0].length;
  const rest = source.slice(start);
  const nextHeadingMatch = /^##\s/m.exec(rest);
  const end = nextHeadingMatch ? start + nextHeadingMatch.index : source.length;

  return source.slice(start, end).trim();
};

const extractSvelteBlocks = (source) => {
  const blocks = [];
  const pattern = /```svelte[^\n]*\n([\s\S]*?)```/g;

  for (const match of source.matchAll(pattern)) {
    blocks.push(stripCodeFence(match[0]));
  }

  return blocks;
};

const parseSnippetBlock = (block) => {
  const normalized = block.replaceAll("\r\n", "\n").trim();
  const scriptMatch = normalized.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/);
  const importStatements = [];

  if (scriptMatch) {
    const lines = scriptMatch[1].split("\n");
    let currentImport = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (currentImport.length === 0 && trimmed.startsWith("import ")) {
        currentImport.push(line);
        if (trimmed.endsWith(";")) {
          importStatements.push(currentImport.join("\n"));
          currentImport = [];
        }
        continue;
      }

      if (currentImport.length > 0) {
        currentImport.push(line);
        if (trimmed.endsWith(";")) {
          importStatements.push(currentImport.join("\n"));
          currentImport = [];
        }
      }
    }
  }

  const importBody = importStatements.length > 0
    ? importStatements.flatMap((statement, index) => {
        const normalizedStatement = normalizeCode(statement);
        if (index === importStatements.length - 1) {
          return normalizedStatement;
        }

        return [...normalizedStatement, ""];
      })
    : null;
  const markupBody = normalized.replace(/<script[\s\S]*?<\/script>\s*/g, "").trim();
  const usageBody = markupBody ? normalizeCode(markupBody) : null;

  return { importBody, usageBody };
};

const selectSnippetFromBlocks = (blocks) => {
  let importBody = null;
  let usageBody = null;

  for (const block of blocks) {
    const parsed = parseSnippetBlock(block);
    if (!importBody && parsed.importBody) {
      importBody = parsed.importBody;
    }

    if (!usageBody && parsed.usageBody) {
      usageBody = parsed.usageBody;
    }

    if (importBody && usageBody) {
      break;
    }
  }

  return { importBody, usageBody };
};

const loadRegistryUiNames = async () => {
  const entries = await fs.readdir(REGISTRY_DIR);
  const names = new Set();

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(REGISTRY_DIR, entry);
    const data = await readJson(filePath);
    if (data.type === "registry:ui" && typeof data.name === "string") {
      names.add(data.name);
    }
  }

  return [...names].sort((left, right) => left.localeCompare(right));
};

const ensureDirectory = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const getUpstreamCommit = () => {
  try {
    return execFileSync("git", ["-C", upstreamDir, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
};

const createManifestEntry = ({
  component,
  importBody,
  usageBody,
  sourceType,
  docPath,
  examplePath,
}) => ({
  description: `${DOCS_URL_BASE}/${component}`,
  import: importBody,
  usage: usageBody,
  source: sourceType,
  docPath: toPosix(path.relative(upstreamDir, docPath)),
  examplePath: examplePath ? toPosix(path.relative(upstreamDir, examplePath)) : null,
});

const main = async () => {
  const overrides = await readJson(overridesPath).catch(() => ({}));
  const registryUiNames = await loadRegistryUiNames();
  const manifest = {};
  const unresolved = [];

  for (const component of registryUiNames) {
    const docPath = path.join(DOCS_COMPONENTS_DIR, `${component}.md`);
    const docSource = await fs.readFile(docPath, "utf8").catch(() => null);

    if (!docSource) {
      unresolved.push(`${component}: missing docs page`);
      continue;
    }

    const { body } = parseFrontmatter(docSource);

    const override = overrides[component] ?? {};
    if (override.strategy === "legacy") {
      continue;
    }

    if (override.strategy === "manual") {
      if (!Array.isArray(override.import) || !Array.isArray(override.usage)) {
        unresolved.push(`${component}: manual override must define import and usage arrays`);
        continue;
      }

      manifest[component] = createManifestEntry({
        component,
        importBody: override.import,
        usageBody: override.usage,
        sourceType: "manual",
        docPath,
        examplePath: null,
      });
      continue;
    }

    const usageSection = extractSection(body, "Usage");
    const primaryBlocks = usageSection ? extractSvelteBlocks(usageSection) : [];
    let { importBody, usageBody } = selectSnippetFromBlocks(primaryBlocks);
    let sourceType = usageSection ? "docs-usage" : null;
    let examplePath = null;

    if (!importBody || !usageBody) {
      unresolved.push(
        `${component}: missing ${!importBody ? "import" : "usage"} snippet source`,
      );
      continue;
    }

    manifest[component] = createManifestEntry({
      component,
      importBody,
      usageBody,
      sourceType: sourceType ?? "unknown",
      docPath,
      examplePath,
    });
  }

  if (unresolved.length > 0) {
    throw new Error(`Failed to resolve snippets:\n${unresolved.join("\n")}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    upstreamCommit: getUpstreamCommit(),
    upstreamRepository: "https://github.com/huntabyte/shadcn-svelte",
    components: manifest,
  };

  await ensureDirectory(outputPath);
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Generated ${Object.keys(manifest).length} upstream snippets at ${outputPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
