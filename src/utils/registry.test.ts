import { ofetch } from "ofetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ofetch", () => ({
  ofetch: vi.fn(),
}));

vi.mock("./vscode", () => ({
  detectPackageManager: vi.fn(),
}));

import { getComponentDocLink, getInitCmd, getInstallCmd, getRegistry } from "./registry";
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
      .mockResolvedValueOnce("yarn");

    await expect(getInitCmd("/workspace")).resolves.toBe("bunx shadcn-svelte@latest init -c /workspace");
    await expect(getInitCmd("/workspace")).resolves.toBe("pnpm dlx shadcn-svelte@latest init -c /workspace");
    await expect(getInitCmd("/workspace")).resolves.toBe("npx shadcn-svelte@latest init -c /workspace");
    await expect(getComponentDocLink("alert-dialog")).resolves.toBe(
      "https://shadcn-svelte.com/docs/components/alert-dialog",
    );
  });
});
