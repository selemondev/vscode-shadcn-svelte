import * as vscode from "vscode";
import { ShadcnSnippetCompletionProvider } from "./completion-provider";
import {
  getInitCmd,
  getInstallCmd,
  getInstalledComponents,
  getUpdateCmd,
  getComponentDocLink,
} from "./utils/registry";
import { resolveUiComponentsPath } from "./completion-provider/document-config";
import { executeCommand, getOrChooseCwd } from "./utils/vscode";
import { getSvelteVersion } from "./utils/getSvelteVersion";
import type { Component, Components } from "./utils/registry";

const commands = {
  initCli: "shadcn-svelte.initCli",
  addNewComponent: "shadcn-svelte.addNewComponent",
  addMultipleComponents: "shadcn-svelte.addMultipleComponents",
  gotoComponentDoc: "shadcn-svelte.gotoComponentDoc",
  reloadComponentList: "shadcn-svelte.reloadComponentList",
  gotoDoc: "shadcn-svelte.gotoDoc",
  updateInstalledComponents: "shadcn-svelte.updateInstalledComponents",
} as const;

export async function activate(context: vscode.ExtensionContext) {
  const snippetCompletionProvider = new ShadcnSnippetCompletionProvider(context);
  await snippetCompletionProvider.initialize();

  let registryData: Components = snippetCompletionProvider.getRegistryComponents();
  const requireWorkspace = () => {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return false;
    }

    return true;
  };

  const disposables: vscode.Disposable[] = [
    snippetCompletionProvider.register(),
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
    vscode.commands.registerCommand(commands.updateInstalledComponents, async () => {
      if (!requireWorkspace()) {
        return;
      }

      const cwd = await getOrChooseCwd();

      const absUiPath = resolveUiComponentsPath(cwd);
      if (!absUiPath) {
        vscode.window.showInformationMessage("No components.json found. Run shadcn-svelte init first.");
        return;
      }

      const installedNames = await getInstalledComponents(absUiPath);
      if (installedNames.length === 0) {
        vscode.window.showInformationMessage("No installed shadcn/svelte components found.");
        return;
      }

      const newRegistryData = await snippetCompletionProvider.refresh();
      if (!newRegistryData.registryComponents.length) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData.registryComponents;

      const registryByName = new Map<string, Component>();
      for (const component of registryData) {
        registryByName.set(component.label, component);
      }

      const quickPickItems: vscode.QuickPickItem[] = installedNames.map((name) => {
        const registryComponent = registryByName.get(name);
        if (registryComponent) {
          return {
            label: name,
            description: registryComponent.detail,
            detail: "Installed",
          };
        }
        return {
          label: name,
          detail: "Not in registry",
        };
      });

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        canPickMany: true,
        matchOnDescription: true,
        placeHolder: "Select components to update (components will be re-downloaded from registry)",
      });

      if (!selected || selected.length === 0) {
        return;
      }

      const selectedLabels = selected.map((item) => item.label!);
      const updateCmd = await getUpdateCmd(selectedLabels, cwd);
      executeCommand(updateCmd);
    }),
  ];

  context.subscriptions.push(...disposables);
}

// This method is called when your extension is deactivated
export function deactivate() { }
