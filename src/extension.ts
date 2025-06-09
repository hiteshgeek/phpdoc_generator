import * as vscode from "vscode";
import { registerDocblockCommands } from "./commands";
import { registerFoldingProvider } from "./providers/phpdocFoldingProvider";
import { PHPBlock, collectReturnTypesFromFunctionNode } from "./phpdocParser";
import {
  buildDocblock,
  buildPropertyDocblock,
  parseDocblock,
  updateDocblock,
} from "./phpdocDocblock";

// Helper to get indentation for a line
function getLineIndent(document: vscode.TextDocument, line: number): string {
  const text = document.lineAt(line).text;
  return text.match(/^\s*/)?.[0] ?? "";
}

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
