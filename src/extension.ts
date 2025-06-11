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
import { generatePHPDocForFile } from "./commands/commandHandlers";

// Helper to get indentation for a line
function getLineIndent(document: vscode.TextDocument, line: number): string {
  const text = document.lineAt(line).text;
  return text.match(/^\s*/)?.[0] ?? "";
}

let statusBarItem: vscode.StatusBarItem | undefined;

function updateStatusBarItem(
  enabled: boolean,
  context?: vscode.ExtensionContext
) {
  if (!statusBarItem) {
    // Use a unique id for the status bar item
    statusBarItem = vscode.window.createStatusBarItem(
      "phpdoc-generator-on-save",
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.command = "phpdoc-generator.toggleGenerateUpdateOnSave";
    if (context) context.subscriptions.push(statusBarItem);
  }
  statusBarItem.text = enabled
    ? "$(check) PHPDoc: On Save"
    : "$(circle-slash) PHPDoc: On Save";
  statusBarItem.tooltip =
    "Toggle PHPDoc Generate/Update on Save (currently " +
    (enabled ? "Enabled" : "Disabled") +
    ")";
  statusBarItem.show();
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Log activation
  console.log("PHPDoc Generator extension activated");

  registerDocblockCommands(context);
  registerFoldingProvider(context);

  // Status bar toggle for Generate/Update on Save
  const config = vscode.workspace.getConfiguration(
    "phpdoc-generator-hiteshgeek"
  );
  let enabled = config.get<boolean>("generateUpdateOnSave", false);
  updateStatusBarItem(enabled, context);

  // Listen for config changes to keep status bar in sync
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration(
          "phpdoc-generator-hiteshgeek.generateUpdateOnSave"
        )
      ) {
        enabled = vscode.workspace
          .getConfiguration("phpdoc-generator-hiteshgeek")
          .get("generateUpdateOnSave", false);
        updateStatusBarItem(enabled);
      }
    })
  );

  // Register toggle command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.toggleGenerateUpdateOnSave",
      async () => {
        const config = vscode.workspace.getConfiguration(
          "phpdoc-generator-hiteshgeek"
        );
        const current = config.get<boolean>("generateUpdateOnSave", false);
        await config.update(
          "generateUpdateOnSave",
          !current,
          vscode.ConfigurationTarget.Global
        );
        updateStatusBarItem(!current);
      }
    )
  );

  // On save: if enabled, run generatePHPDocForFile
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (
        document.languageId === "php" &&
        vscode.workspace
          .getConfiguration("phpdoc-generator-hiteshgeek")
          .get("generateUpdateOnSave", false)
      ) {
        const editor = vscode.window.visibleTextEditors.find(
          (e) => e.document === document
        );
        if (editor) {
          await vscode.window.showTextDocument(document, { preview: false });
          await generatePHPDocForFile();
        }
      }
    })
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
