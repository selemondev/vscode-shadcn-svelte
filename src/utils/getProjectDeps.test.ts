import { existsSync } from "fs";
import { readPackageJSON } from "pkg-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("pkg-types", () => ({
  readPackageJSON: vi.fn(),
}));

vi.mock("./getProjectDir", () => ({
  getProjectDirectory: vi.fn(() => "/workspace/project"),
}));

import { getProjectDependencies } from "./getProjectDeps";

describe("getProjectDependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty array when package.json does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await expect(getProjectDependencies()).resolves.toEqual([]);
    expect(readPackageJSON).not.toHaveBeenCalled();
  });

  it("returns parsed dev dependency versions", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readPackageJSON).mockResolvedValue({
      dependencies: {
        svelte: "^5.1.0",
      },
      devDependencies: {
        typescript: "^5.9.2",
        eslint: "~9.37.0",
      },
    });

    await expect(getProjectDependencies()).resolves.toEqual([
      { name: "typescript", version: 5 },
      { name: "eslint", version: 9 },
    ]);
  });
});
