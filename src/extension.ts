import * as vscode from "vscode";
import { registerDocblockCommands } from "./commands";
import { registerFoldingProvider } from "./providers/phpdocFoldingProvider";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Log activation
  console.log("PHPDoc Generator extension activated");

  registerDocblockCommands(context);
  registerFoldingProvider(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}
