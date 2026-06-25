import * as vscode from "vscode";
import { ShadcnSnippetCompletionProvider } from "./completion-provider";
import {
  getInitCmd,
  getInstallCmd,
  getUpdateCmd,
  getComponentDocLink,
} from "./utils/registry";
import { executeCommand, getOrChooseCwd } from "./utils/vscode";
import { getSvelteVersion } from "./utils/getSvelteVersion";
import { getInstalledComponents } from "./utils/installedComponents";
import { getDirtyStatus, HeadContentProvider, HEAD_CONTENT_SCHEME } from "./utils/git";
import { runCommand } from "./utils/exec";
import { openComponentDiffs } from "./utils/diff";
import type { Component, Components } from "./utils/registry";

const commands = {
  initCli: "shadcn-svelte.initCli",
  addNewComponent: "shadcn-svelte.addNewComponent",
  addMultipleComponents: "shadcn-svelte.addMultipleComponents",
  updateComponents: "shadcn-svelte.updateComponents",
  gotoComponentDoc: "shadcn-svelte.gotoComponentDoc",
  reloadComponentList: "shadcn-svelte.reloadComponentList",
  gotoDoc: "shadcn-svelte.gotoDoc",
} as const;

export async function activate(context: vscode.ExtensionContext) {
  const snippetCompletionProvider = new ShadcnSnippetCompletionProvider(context);
  await snippetCompletionProvider.initialize();

  const outputChannel = vscode.window.createOutputChannel("shadcn/svelte");

  let registryData: Components = snippetCompletionProvider.getRegistryComponents();
  const requireWorkspace = () => {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return false;
    }

    return true;
  };

  const disposables: vscode.Disposable[] = [
    outputChannel,
    snippetCompletionProvider.register(),
    vscode.workspace.registerTextDocumentContentProvider(
      HEAD_CONTENT_SCHEME,
      new HeadContentProvider(),
    ),
    vscode.commands.registerCommand(commands.initCli, async () => {
      if (!requireWorkspace()) {
        return;
      }

      const cwd = await getOrChooseCwd();
      const intCmd = await getInitCmd(cwd);
      executeCommand(intCmd);
    }),
    vscode.commands.registerCommand(commands.addNewComponent, async () => {
      if (!requireWorkspace()) {
        return;
      }

      const newRegistryData = await snippetCompletionProvider.refresh();

      if (!newRegistryData.registryComponents.length) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData.registryComponents;

      const selectedComponent = await vscode.window.showQuickPick(registryData, {
        matchOnDescription: true,
      });

      if (!selectedComponent) {
        return;
      }
      const cwd = await getOrChooseCwd();
      const installCmd = await getInstallCmd([selectedComponent.label], cwd);
      executeCommand(installCmd);
    }),

    vscode.commands.registerCommand(commands.addMultipleComponents, async () => {
      if (!requireWorkspace()) {
        return;
      }

      const newRegistryData = await snippetCompletionProvider.refresh();

      if (!newRegistryData.registryComponents.length) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData.registryComponents;

      const selectedComponents = await vscode.window.showQuickPick(registryData, {
        matchOnDescription: true,
        canPickMany: true,
      });

      if (!selectedComponents) {
        return;
      }

      const selectedComponent = selectedComponents.map((component: Component) => component.label);
      const cwd = await getOrChooseCwd();
      const installCmd = await getInstallCmd(selectedComponent, cwd);
      executeCommand(installCmd);
    }),

    vscode.commands.registerCommand(commands.updateComponents, async () => {
      if (!requireWorkspace()) {
        return;
      }

      const newRegistryData = await snippetCompletionProvider.refresh();

      if (!newRegistryData.registryComponents.length) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData.registryComponents;

      const cwd = await getOrChooseCwd();
      const installed = await getInstalledComponents(vscode.Uri.file(cwd), registryData);

      if (!installed.components.length) {
        vscode.window.showInformationMessage(
          "shadcn/svelte: No installed components found to update.",
        );
        return;
      }

      const selectedComponents = await vscode.window.showQuickPick(installed.components, {
        matchOnDescription: true,
        canPickMany: true,
        placeHolder: "Select installed components to update (re-installs the latest version)",
      });

      if (!selectedComponents || !selectedComponents.length) {
        return;
      }

      const componentNames = selectedComponents.map((component: Component) => component.label);

      // Guard against silently overwriting user customizations. A clean baseline is also
      // what makes the post-update diff and per-file revert reliable.
      const { isRepo, dirty } = await getDirtyStatus(cwd, installed.uiDir.fsPath);

      let warning: string | undefined;
      if (!isRepo) {
        warning =
          "This folder isn't a git repository, so changes can't be reviewed or reverted. Updating will overwrite the selected components in place.";
      } else if (dirty) {
        warning =
          "Your components directory has uncommitted changes. Updating will overwrite the selected components and you may lose those edits.";
      }

      if (warning) {
        const proceed = await vscode.window.showWarningMessage(
          warning,
          { modal: true },
          "Update anyway",
        );
        if (proceed !== "Update anyway") {
          return;
        }
      } else {
        const proceed = await vscode.window.showWarningMessage(
          `Overwrite ${componentNames.length} component(s) with the latest version?\n\n${componentNames.join(", ")}`,
          { modal: true },
          "Update",
        );
        if (proceed !== "Update") {
          return;
        }
      }

      const updateCmd = await getUpdateCmd(componentNames, cwd);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `shadcn/svelte: Updating ${componentNames.length} component(s)…`,
          cancellable: false,
        },
        async () => {
          // Run silently: stream to the (hidden) output channel without revealing it.
          // The progress notification, diff tabs, and toast are the only visible UI.
          const result = await runCommand(updateCmd, cwd, outputChannel);

          if (result.code !== 0) {
            vscode.window.showErrorMessage(
              `shadcn/svelte: Update failed (exit code ${result.code}). See the "shadcn/svelte" output for details.`,
            );
            return;
          }

          if (isRepo) {
            const diffCount = await openComponentDiffs(cwd, installed.uiDir.fsPath);
            vscode.window.showInformationMessage(
              diffCount > 0
                ? `shadcn/svelte: Updated ${componentNames.length} component(s). Review ${diffCount} changed file(s) in the opened diffs.`
                : `shadcn/svelte: ${componentNames.length} component(s) were already up to date.`,
            );
          } else {
            vscode.window.showInformationMessage(
              `shadcn/svelte: Updated ${componentNames.length} component(s).`,
            );
          }
        },
      );
    }),
    vscode.commands.registerCommand(commands.gotoComponentDoc, async () => {
      const newRegistryData = await snippetCompletionProvider.refresh();

      if (!newRegistryData.registryComponents.length) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData.registryComponents;

      const selectedComponent = await vscode.window.showQuickPick(registryData, {
        matchOnDescription: true,
      });

      if (!selectedComponent) {
        return;
      }

      const componentDocLink = await getComponentDocLink(selectedComponent.label);
      vscode.env.openExternal(vscode.Uri.parse(componentDocLink));
    }),
    vscode.commands.registerCommand(commands.reloadComponentList, async () => {
      const newRegistryData = await snippetCompletionProvider.refresh(true);

      if (!newRegistryData.registryComponents.length) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData.registryComponents;
      vscode.window.showInformationMessage(`shadcn/svelte: Reloaded ${registryData.length} components and snippets`);
    }),
    vscode.commands.registerCommand(commands.gotoDoc, async () => {
      const svelteVersion = await getSvelteVersion();
      const shadCnDocUrl = svelteVersion >= 5 ? "https://next.shadcn-svelte.com/docs" : "https://shadcn-svelte.com/docs";
      vscode.env.openExternal(vscode.Uri.parse(shadCnDocUrl));
    }),
  ];

  context.subscriptions.push(...disposables);
}

// This method is called when your extension is deactivated
export function deactivate() { }
