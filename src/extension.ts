import * as vscode from "vscode";
import {
  getInitCmd,
  getInstallCmd,
  getComponentDocLink,
  getRegistry,
  shadCnDocUrl,
} from "./utils/registry";
import { executeCommand } from "./utils/vscode";
import type { Component, Components } from "./utils/registry";

const commands = {
  initCli: "shadcn-svelte.initCli",
  addNewComponent: "shadcn-svelte.addNewComponent",
  addMultipleComponents: "shadcn-svelte.addMultipleComponents",
  gotoComponentDoc: "shadcn-svelte.gotoComponentDoc",
  reloadComponentList: "shadcn-svelte.reloadComponentList",
  gotoDoc: "shadcn-svelte.gotoDoc",
} as const;

export async function activate(context: vscode.ExtensionContext) {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder open.");
    return;
  }

  let registryData: Components;

  const disposables: vscode.Disposable[] = [
    vscode.commands.registerCommand(commands.initCli, async () => {
      const intCmd = await getInitCmd();
      executeCommand(intCmd);
    }),
    vscode.commands.registerCommand(commands.addNewComponent, async () => {
      if (!registryData) {
        const newRegistryData = await getRegistry();

        if (!newRegistryData) {
          vscode.window.showErrorMessage("Cannot get the component list");
          return;
        }

        registryData = newRegistryData;
      }

      const selectedComponent = await vscode.window.showQuickPick(registryData, {
        matchOnDescription: true,
      });

      if (!selectedComponent) {
        return;
      }

      const installCmd = await getInstallCmd([selectedComponent.label]);
      executeCommand(installCmd);
    }),

    vscode.commands.registerCommand(commands.addMultipleComponents, async () => {
      if (!registryData) {
        const newRegistryData = await getRegistry();

        if (!newRegistryData) {
          vscode.window.showErrorMessage("Cannot get the component list");
          return;
        }

        registryData = newRegistryData;
      }

      const selectedComponents = await vscode.window.showQuickPick(registryData, {
        matchOnDescription: true,
        canPickMany: true,
      });

      if (!selectedComponents) {
        return;
      }

      const selectedComponent = selectedComponents.map((component: Component) => component.label);

      const installCmd = await getInstallCmd(selectedComponent);
      executeCommand(installCmd);
    }),
    vscode.commands.registerCommand(commands.gotoComponentDoc, async () => {
      if (!registryData) {
        const newRegistryData = await getRegistry();

        if (!newRegistryData) {
          vscode.window.showErrorMessage("Cannot get the component list");
          return;
        }

        registryData = newRegistryData;
      }

      const selectedComponent = await vscode.window.showQuickPick(registryData, {
        matchOnDescription: true,
      });

      if (!selectedComponent) {
        return;
      }

      const componentDocLink = getComponentDocLink(selectedComponent.label);
      vscode.env.openExternal(vscode.Uri.parse(componentDocLink));
    }),
    vscode.commands.registerCommand(commands.reloadComponentList, async () => {
      const newRegistryData = await getRegistry();

      if (!newRegistryData) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData;
      vscode.window.showInformationMessage("shadcn/svelte: Reloaded components");
    }),
    vscode.commands.registerCommand(commands.gotoDoc, async () => {
      vscode.env.openExternal(vscode.Uri.parse(shadCnDocUrl));
    }),
  ];

  context.subscriptions.push(...disposables);
}

// This method is called when your extension is deactivated
export function deactivate() { }
