import {
  FileSystemError,
  Position,
  Uri,
  window,
  workspace,
} from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getIncludeIndexJsSetting,
  getSvelteSnippetScope,
  getUiAliasBaseForDocument,
  resolveUiAliasBase,
} from "./document-config";
import { DEFAULT_UI_ALIAS, IMPORTS_INCLUDE_INDEX_JS_SETTING } from "./constants";

type MockDocument = {
  uri: ReturnType<typeof Uri.file>;
  getText: (range?: { end: Position }) => string;
};

type MockWorkspaceFolder = {
  index: number;
  name: string;
  uri: ReturnType<typeof Uri.file>;
};

const getOffset = (text: string, position: Position) => {
  const lines = text.split("\n");
  let offset = 0;

  for (let index = 0; index < position.line; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }

  return offset + position.character;
};

const createDocument = (text: string) => ({
  uri: Uri.file("/workspace/App.svelte"),
  getText: (range?: { end: Position }) =>
    range ? text.slice(0, getOffset(text, range.end)) : text,
}) as unknown as MockDocument;

describe("document config helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (workspace as { workspaceFolders: MockWorkspaceFolder[] | undefined }).workspaceFolders = undefined;
  });

  it("resolves the UI alias from config fallbacks", () => {
    expect(resolveUiAliasBase({ aliases: { ui: "@/ui/" } })).toBe("@/ui");
    expect(resolveUiAliasBase({ aliases: { components: "@/components/" } })).toBe("@/components/ui");
    expect(resolveUiAliasBase({ aliases: { lib: "@lib/" } })).toBe("@lib/components/ui");
    expect(resolveUiAliasBase(null)).toBe(DEFAULT_UI_ALIAS);
  });

  it("reads the includeIndexJs setting from the workspace configuration", () => {
    const get = vi.fn().mockReturnValue(false);
    vi.mocked(workspace.getConfiguration).mockReturnValue({ get } as never);

    expect(getIncludeIndexJsSetting(createDocument("") as never)).toBe(false);
    expect(get).toHaveBeenCalledWith(IMPORTS_INCLUDE_INDEX_JS_SETTING, true);
  });

  it("reads and normalizes the UI alias from components.json", async () => {
    const workspaceFolder: MockWorkspaceFolder = { index: 0, name: "app", uri: Uri.file("/workspace") };
    vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder as never);
    (workspace as { workspaceFolders: MockWorkspaceFolder[] | undefined }).workspaceFolders = [workspaceFolder];
    vi.mocked(workspace.fs.readFile).mockResolvedValue(
      Buffer.from(JSON.stringify({ aliases: { ui: "@/custom-ui/" } })),
    );

    await expect(getUiAliasBaseForDocument(createDocument("") as never, new Set())).resolves.toBe("@/custom-ui");
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it("falls back to the default alias when components.json is missing", async () => {
    const workspaceFolder: MockWorkspaceFolder = { index: 0, name: "app", uri: Uri.file("/workspace") };
    vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder as never);
    vi.mocked(workspace.fs.readFile).mockRejectedValue(FileSystemError.FileNotFound());

    await expect(getUiAliasBaseForDocument(createDocument("") as never, new Set())).resolves.toBe(DEFAULT_UI_ALIAS);
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it("warns once when components.json is invalid", async () => {
    const workspaceFolder: MockWorkspaceFolder = { index: 0, name: "app", uri: Uri.file("/workspace") };
    const warnings = new Set<string>();
    vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder as never);
    vi.mocked(workspace.fs.readFile).mockResolvedValue(Buffer.from("{invalid json"));

    await expect(getUiAliasBaseForDocument(createDocument("") as never, warnings)).resolves.toBe(DEFAULT_UI_ALIAS);
    await expect(getUiAliasBaseForDocument(createDocument("") as never, warnings)).resolves.toBe(DEFAULT_UI_ALIAS);

    expect(window.showWarningMessage).toHaveBeenCalledTimes(1);
  });

  it("detects import and usage snippet scopes", () => {
    const document = createDocument(`<script>\n  const value = true;\n</script>\n\n<Button />`);

    expect(getSvelteSnippetScope(document as never, new Position(0, 3), "cni-button")).toBe("import");
    expect(getSvelteSnippetScope(document as never, new Position(0, 8), "shadcn-x-button")).toBe("usage");
    expect(getSvelteSnippetScope(document as never, new Position(1, 5), "Button")).toBe("import");
    expect(getSvelteSnippetScope(document as never, new Position(4, 5), "Button")).toBe("usage");
  });
});
