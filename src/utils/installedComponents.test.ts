import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, Uri, workspace } from "../test/vscode";
import { aliasToRelativeDir, getInstalledComponents } from "./installedComponents";
import type { Components } from "./registry";

describe("aliasToRelativeDir", () => {
  it("maps the default $lib alias to src/lib", () => {
    expect(aliasToRelativeDir("$lib/components/ui")).toBe("src/lib/components/ui");
    expect(aliasToRelativeDir("$lib")).toBe("src/lib");
  });

  it("strips other path-alias markers and trailing slashes", () => {
    expect(aliasToRelativeDir("@/components/ui/")).toBe("components/ui");
    expect(aliasToRelativeDir("./src/lib/components/ui")).toBe("src/lib/components/ui");
  });
});

describe("getInstalledComponents", () => {
  const registry: Components = [
    { label: "button", detail: "dependencies: no dependency" },
    { label: "card", detail: "dependencies: no dependency" },
    { label: "alert-dialog", detail: "dependencies: button" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("intersects directories on disk with the registry and flags unknowns", async () => {
    vi.mocked(workspace.fs.readFile).mockResolvedValue(
      Buffer.from(JSON.stringify({ aliases: { ui: "$lib/components/ui" } })),
    );
    vi.mocked(workspace.fs.readDirectory).mockResolvedValue([
      ["button", FileType.Directory],
      ["card", FileType.Directory],
      ["my-custom-thing", FileType.Directory],
      ["index.ts", FileType.File],
    ]);

    const result = await getInstalledComponents(Uri.file("/workspace") as unknown as import("vscode").Uri, registry);

    expect(result.uiDir.fsPath).toBe("/workspace/src/lib/components/ui");
    expect(result.components.map((c) => c.label)).toEqual(["button", "card"]);
    expect(result.unknown).toEqual(["my-custom-thing"]);
  });

  it("falls back to the default UI dir when components.json is missing", async () => {
    vi.mocked(workspace.fs.readFile).mockRejectedValue(new Error("not found"));
    vi.mocked(workspace.fs.readDirectory).mockResolvedValue([
      ["button", FileType.Directory],
    ]);

    const result = await getInstalledComponents(Uri.file("/workspace") as unknown as import("vscode").Uri, registry);

    expect(result.uiDir.fsPath).toBe("/workspace/src/lib/components/ui");
    expect(result.components.map((c) => c.label)).toEqual(["button"]);
  });

  it("returns empty results when the UI directory has no component folders", async () => {
    vi.mocked(workspace.fs.readFile).mockResolvedValue(
      Buffer.from(JSON.stringify({ aliases: { ui: "$lib/components/ui" } })),
    );
    vi.mocked(workspace.fs.readDirectory).mockResolvedValue([]);

    const result = await getInstalledComponents(Uri.file("/workspace") as unknown as import("vscode").Uri, registry);

    expect(result.components).toEqual([]);
    expect(result.unknown).toEqual([]);
  });
});
