import * as vscode from "vscode";
import {
  getInitCmd,
  getInstallCmd,
  getComponentDocLink,
  getRegistry,
} from "./utils/registry";
import { executeCommand } from "./utils/vscode";
import { getSvelteVersion } from "./utils/getSvelteVersion";
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
  let registryData: Components;

  const disposables: vscode.Disposable[] = [
    vscode.commands.registerCommand("shadcn-svelte.initCli", async () => {
      const intCmd = await getInitCmd();
      executeCommand(intCmd);
    }),
    vscode.commands.registerCommand("shadcn-svelte.addNewComponent", async () => {
      registryData = [];
      const newRegistryData = await getRegistry();

      if (!newRegistryData) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData;

      const selectedComponent = await vscode.window.showQuickPick(registryData, {
        matchOnDescription: true,
      });

      if (!selectedComponent) {
        return;
      }

      const installCmd = await getInstallCmd([selectedComponent.label]);
      executeCommand(installCmd);
    }),

    vscode.commands.registerCommand("shadcn-svelte.addMultipleComponents", async () => {
      registryData = [];
      const newRegistryData = await getRegistry();

      if (!newRegistryData) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData;

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
    vscode.commands.registerCommand("shadcn-svelte.gotoComponentDoc", async () => {
      registryData = [];
      const newRegistryData = await getRegistry();

      if (!newRegistryData) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData;

      const selectedComponent = await vscode.window.showQuickPick(registryData, {
        matchOnDescription: true,
      });

      if (!selectedComponent) {
        return;
      }

      const componentDocLink = await getComponentDocLink(selectedComponent.label);
      vscode.env.openExternal(vscode.Uri.parse(componentDocLink));
    }),
    vscode.commands.registerCommand("shadcn-svelte.reloadComponentList", async () => {
      registryData = [];
      const newRegistryData = await getRegistry();

      if (!newRegistryData) {
        vscode.window.showErrorMessage("Cannot get the component list");
        return;
      }

      registryData = newRegistryData;
      vscode.window.showInformationMessage("shadcn/svelte: Reloaded components");
    }),
    vscode.commands.registerCommand("shadcn-svelte.gotoDoc", async () => {
      const svelteVersion = await getSvelteVersion();
      const shadCnDocUrl = svelteVersion >= 5 ? "https://next.shadcn-svelte.com/docs" : "https://shadcn-svelte.com/docs";
      vscode.env.openExternal(vscode.Uri.parse(shadCnDocUrl));
    }),
  ];

  context.subscriptions.push(...disposables);
}

// This method is called when your extension is deactivated
export function deactivate() { }
