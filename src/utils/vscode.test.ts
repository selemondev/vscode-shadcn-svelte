import { beforeEach, describe, expect, it, vi } from "vitest";
import { Uri, window, workspace } from "vscode";
import { getOrChooseCwd } from "./vscode";

type MockFolder = {
  name: string;
  fsPath: string;
  scheme?: string;
};

const setWorkspace = (folders?: MockFolder[]) => {
  (workspace as { workspaceFolders: MockFolder[] | undefined }).workspaceFolders = folders?.map((folder) => ({
    name: folder.name,
    uri: folder.scheme && folder.scheme !== "file"
      ? { scheme: folder.scheme, fsPath: folder.fsPath, path: folder.fsPath }
      : Uri.file(folder.fsPath),
  })) as unknown as MockFolder[] | undefined;
};

const setCwdSetting = (value: string | undefined) => {
  const get = vi.fn((key: string) => (key === "shadcn-svelte.cwd" ? value : undefined));
  vi.mocked(workspace.getConfiguration).mockReturnValue({ get } as never);
  return get;
};

describe("getOrChooseCwd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWorkspace(undefined);
    vi.mocked(window.showQuickPick).mockResolvedValue(undefined);
  });

  it("returns a POSIX absolute path unchanged", async () => {
    setWorkspace([{ name: "app", fsPath: "/Users/foo/my-app" }]);
    const get = setCwdSetting("/tmp/other");

    await expect(getOrChooseCwd()).resolves.toBe("/tmp/other");
    expect(get).toHaveBeenCalledWith("shadcn-svelte.cwd");
    expect(window.showQuickPick).not.toHaveBeenCalled();
  });

  it("returns a POSIX path inside the workspace unchanged", async () => {
    setWorkspace([{ name: "app", fsPath: "/Users/foo/my-app" }]);
    setCwdSetting("/Users/foo/my-app/packages/web");

    await expect(getOrChooseCwd()).resolves.toBe("/Users/foo/my-app/packages/web");
  });

  it("does not treat a POSIX sibling directory as inside the workspace", async () => {
    setWorkspace([{ name: "app", fsPath: "/Users/foo/my-app" }]);
    setCwdSetting("/Users/foo/my-app-other");

    await expect(getOrChooseCwd()).resolves.toBe("/Users/foo/my-app-other");
  });

  it("returns a Windows absolute path unchanged", async () => {
    setWorkspace([{ name: "app", fsPath: "C:\\Users\\foo\\my-app" }]);
    setCwdSetting("D:\\other");

    await expect(getOrChooseCwd()).resolves.toBe("D:\\other");
    expect(window.showQuickPick).not.toHaveBeenCalled();
  });

  it("returns a Windows drive path written with forward slashes unchanged", async () => {
    setWorkspace([{ name: "app", fsPath: "C:\\Users\\foo\\my-app" }]);
    setCwdSetting("C:/other");

    await expect(getOrChooseCwd()).resolves.toBe("C:/other");
  });

  it("keeps a Windows path under the workspace even when the path contains regex metacharacters", async () => {
    setWorkspace([{ name: "app", fsPath: "C:\\Users\\foo\\my.app" }]);
    setCwdSetting("C:\\Users\\foo\\my.app\\src");

    await expect(getOrChooseCwd()).resolves.toBe("C:\\Users\\foo\\my.app\\src");
  });

  it("does not treat a Windows sibling directory as inside the workspace", async () => {
    setWorkspace([{ name: "app", fsPath: "C:\\Users\\foo\\my-app" }]);
    setCwdSetting("C:\\Users\\foo\\my-app-other");

    await expect(getOrChooseCwd()).resolves.toBe("C:\\Users\\foo\\my-app-other");
  });

  it("resolves a relative path against the workspace folder", async () => {
    setWorkspace([{ name: "app", fsPath: "/Users/foo/my-app" }]);
    setCwdSetting("  packages/web  ");

    await expect(getOrChooseCwd()).resolves.toBe("/Users/foo/my-app/packages/web");
  });

  it("resolves a Windows-separator relative path against a Windows workspace", async () => {
    setWorkspace([{ name: "app", fsPath: "C:\\Users\\foo\\my-app" }]);
    setCwdSetting("packages\\web");

    await expect(getOrChooseCwd()).resolves.toBe("C:\\Users\\foo\\my-app\\packages\\web");
  });

  it("resolves ${workspaceFolder} to the workspace folder", async () => {
    setWorkspace([{ name: "app", fsPath: "/Users/foo/my-app" }]);
    setCwdSetting("${workspaceFolder}");

    await expect(getOrChooseCwd()).resolves.toBe("/Users/foo/my-app");
  });

  it("resolves ${workspaceFolder} for a Windows workspace", async () => {
    setWorkspace([{ name: "app", fsPath: "C:\\Users\\foo\\my-app" }]);
    setCwdSetting("${workspaceFolder}");

    await expect(getOrChooseCwd()).resolves.toBe("C:\\Users\\foo\\my-app");
  });

  it("resolves ${workspaceFolder}/sub against the workspace folder", async () => {
    setWorkspace([{ name: "app", fsPath: "/Users/foo/my-app" }]);
    setCwdSetting("${workspaceFolder}/packages/web");

    await expect(getOrChooseCwd()).resolves.toBe("/Users/foo/my-app/packages/web");
  });

  it("resolves ${workspaceFolder}\\sub against a Windows workspace", async () => {
    setWorkspace([{ name: "app", fsPath: "C:\\Users\\foo\\my-app" }]);
    setCwdSetting("${workspaceFolder}\\packages\\web");

    await expect(getOrChooseCwd()).resolves.toBe("C:\\Users\\foo\\my-app\\packages\\web");
  });

  it("resolves ${workspaceFolder}/sub against a Windows workspace", async () => {
    setWorkspace([{ name: "app", fsPath: "C:\\Users\\foo\\my-app" }]);
    setCwdSetting("${workspaceFolder}/packages/web");

    await expect(getOrChooseCwd()).resolves.toBe("C:\\Users\\foo\\my-app\\packages\\web");
  });

  it("asks for a folder when the setting is empty", async () => {
    setWorkspace([
      { name: "app", fsPath: "/Users/foo/my-app" },
      { name: "other", fsPath: "/Users/foo/other" },
    ]);
    setCwdSetting("   ");
    vi.mocked(window.showQuickPick).mockResolvedValue("other" as never);

    await expect(getOrChooseCwd()).resolves.toBe("/Users/foo/other");
    expect(window.showQuickPick).toHaveBeenCalledWith(["app", "other"]);
  });

  it("returns ./ when the folder picker is dismissed", async () => {
    setWorkspace([{ name: "app", fsPath: "/Users/foo/my-app" }]);
    setCwdSetting(undefined);

    await expect(getOrChooseCwd()).resolves.toBe("./");
  });

  it("returns ./ when there are no workspace folders", async () => {
    setWorkspace(undefined);
    setCwdSetting("");

    await expect(getOrChooseCwd()).resolves.toBe("./");
    expect(window.showQuickPick).not.toHaveBeenCalled();
  });

  it("returns ./ when the workspace folder list is empty", async () => {
    setWorkspace([]);
    setCwdSetting(undefined);

    await expect(getOrChooseCwd()).resolves.toBe("./");
  });

  it("returns a configured absolute path when there are no workspace folders", async () => {
    setWorkspace(undefined);
    setCwdSetting("C:\\other");

    await expect(getOrChooseCwd()).resolves.toBe("C:\\other");
  });

  it("returns ./ for a workspace variable when there are no workspace folders", async () => {
    setWorkspace([]);
    setCwdSetting("${workspaceFolder}/sub");

    await expect(getOrChooseCwd()).resolves.toBe("./");
  });

  it("ignores non-file workspace folders when resolving a relative path", async () => {
    setWorkspace([
      { name: "remote", fsPath: "/remote/app", scheme: "vscode-remote" },
      { name: "app", fsPath: "/Users/foo/my-app" },
    ]);
    setCwdSetting("src");

    await expect(getOrChooseCwd()).resolves.toBe("/Users/foo/my-app/src");
  });
});
