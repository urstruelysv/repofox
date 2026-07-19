import * as vscode from "vscode"
import { SidebarProvider } from "./sidebar/SidebarProvider"
import { SecretStore } from "./storage/SecretStore"
import { StateManager } from "./state/StateManager"

let sidebarProvider: SidebarProvider | undefined

export function activate(context: vscode.ExtensionContext): void {
  const secrets = new SecretStore(context.secrets)
  const state = new StateManager(context.globalState)

  sidebarProvider = new SidebarProvider(context.extensionUri, secrets, state)

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("repofox.sidebar", sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("repofox.runWorkflow", () => {
      sidebarProvider?.triggerWorkflow()
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("repofox.openSettings", () => {
      sidebarProvider?.openSettings()
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("repofox.runDiagnostics", () => {
      void sidebarProvider?.runDiagnostics()
    }),
  )
}

export function deactivate(): void {
  sidebarProvider = undefined
}
