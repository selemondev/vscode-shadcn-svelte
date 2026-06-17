import { ofetch } from "ofetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ofetch", () => ({
  ofetch: vi.fn(),
}));

vi.mock("./vscode", () => ({
  detectPackageManager: vi.fn(),
}));

import { FileSystemError, FileType, workspace } from "vscode";
import { getComponentDocLink, getInitCmd, getInstallCmd, getInstalledComponents, getRegistry, getRegistryIndex, getUpdateCmd } from "./registry";
import { detectPackageManager } from "./vscode";

describe("registry helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters invalid registry entries and removes duplicates", async () => {
    vi.mocked(ofetch).mockResolvedValue([
      {
        type: "registry:ui",
        name: "button",
        files: [],
        registryDependencies: ["bits-ui"],
      },
      {
        type: "registry:ui",
        name: "button",
        files: [],
      },
      {
        type: "registry:ui",
        name: "Button",
        files: [],
      },
      {
        type: "registry:block",
        name: "card",
        files: [],
      },
      {
        type: "registry:ui",
        name: "badge",
        files: [],
      },
    ]);

    await expect(getRegistry()).resolves.toEqual([
      {
        label: "button",
        detail: "dependencies: bits-ui",
      },
      {
        label: "badge",
        detail: "dependencies: no dependency",
      },
    ]);
  });

  it("returns null when the registry request fails", async () => {
    vi.mocked(ofetch).mockRejectedValue(new Error("network"));

    await expect(getRegistry()).resolves.toBeNull();
  });

  it("builds install commands for the supported package managers", async () => {
    vi.mocked(detectPackageManager)
      .mockResolvedValueOnce("bun")
      .mockResolvedValueOnce("pnpm")
      .mockResolvedValueOnce("npm");

    await expect(getInstallCmd(["button", "badge"], "/workspace")).resolves.toBe(
      "bunx shadcn-svelte@latest add button badge -c /workspace",
    );
    await expect(getInstallCmd(["button"], "/workspace")).resolves.toBe(
      "pnpm dlx shadcn-svelte@latest add button -c /workspace",
    );
    await expect(getInstallCmd(["button"], "/workspace")).resolves.toBe(
      "npx shadcn-svelte@latest add button -c /workspace",
    );
  });

  it("builds init commands and documentation links", async () => {
    vi.mocked(detectPackageManager)
      .mockResolvedValueOnce("bun")
      .mockResolvedValueOnce("pnpm")
      .mockResolvedValueOnce("npm");

    await expect(getInitCmd("/workspace")).resolves.toBe("bunx shadcn-svelte@latest init -c /workspace");
    await expect(getInitCmd("/workspace")).resolves.toBe("pnpm dlx shadcn-svelte@latest init -c /workspace");
    await expect(getInitCmd("/workspace")).resolves.toBe("npx shadcn-svelte@latest init -c /workspace");
    await expect(getComponentDocLink("alert-dialog")).resolves.toBe(
      "https://shadcn-svelte.com/docs/components/alert-dialog",
    );
  });
});

describe("getRegistryIndex", () => {
  it("returns the raw registry array", async () => {
    const raw = [
      { name: "button", type: "registry:ui", registryDependencies: [], relativeUrl: "button.json" },
      { name: "badge", type: "registry:ui", registryDependencies: ["label"], relativeUrl: "badge.json" },
    ];
    vi.mocked(ofetch).mockResolvedValue(raw);

    await expect(getRegistryIndex()).resolves.toEqual(raw);
  });

  it("returns null on fetch failure", async () => {
    vi.mocked(ofetch).mockRejectedValue(new Error("network"));
    await expect(getRegistryIndex()).resolves.toBeNull();
  });
});

describe("getInstalledComponents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only subdirectory names", async () => {
    vi.mocked(workspace.fs.readDirectory).mockResolvedValue([
      ["button", FileType.Directory],
      ["badge", FileType.Directory],
      ["index.ts", FileType.File],
    ]);

    await expect(getInstalledComponents("/workspace/src/lib/components/ui")).resolves.toEqual([
      "button",
      "badge",
    ]);
  });

  it("returns empty array on missing path", async () => {
    vi.mocked(workspace.fs.readDirectory).mockRejectedValue(
      FileSystemError.FileNotFound(),
    );

    await expect(getInstalledComponents("/nonexistent")).resolves.toEqual([]);
  });

  it("returns empty array for empty directory", async () => {
    vi.mocked(workspace.fs.readDirectory).mockResolvedValue([]);

    await expect(getInstalledComponents("/workspace/empty")).resolves.toEqual([]);
  });
});

describe("getUpdateCmd", () => {
  it("builds update commands for the supported package managers", async () => {
    vi.mocked(detectPackageManager)
      .mockResolvedValueOnce("bun")
      .mockResolvedValueOnce("pnpm")
      .mockResolvedValueOnce("npm");

    await expect(getUpdateCmd(["button"], "/workspace")).resolves.toBe(
      "bunx shadcn-svelte@latest add button -c /workspace",
    );
    await expect(getUpdateCmd(["button"], "/workspace")).resolves.toBe(
      "pnpm dlx shadcn-svelte@latest add button -c /workspace",
    );
    await expect(getUpdateCmd(["button"], "/workspace")).resolves.toBe(
      "npx shadcn-svelte@latest add button -c /workspace",
    );
  });
});
