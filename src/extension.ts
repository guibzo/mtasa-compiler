import * as vscode from "vscode";
import { registerCompileCommands } from "./commands/compile.commands";

export function activate(context: vscode.ExtensionContext): void {
  registerCompileCommands(context);
}

export function deactivate(): void {}
