import * as vscode from "vscode";
import {
  generatePHPDoc,
  generatePHPDocForFile,
  generatePHPDocForProject,
  refreshSettingsCacheForAll,
  collapseAllDocblocks,
  expandAllDocblocks,
} from "./commandHandlers";

export function registerDocblockCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.generatePHPDoc",
      generatePHPDoc
    ),
    vscode.commands.registerCommand(
      "phpdoc-generator.generatePHPDocForFile",
      generatePHPDocForFile
    ),
    vscode.commands.registerCommand(
      "phpdoc-generator.generatePHPDocForProject",
      generatePHPDocForProject
    ),
    vscode.commands.registerCommand(
      "phpdoc-generator.refreshSettingsCache",
      refreshSettingsCacheForAll
    ),
    vscode.commands.registerCommand(
      "phpdoc-generator.collapseAllDocblocks",
      collapseAllDocblocks
    ),
    vscode.commands.registerCommand(
      "phpdoc-generator.expandAllDocblocks",
      expandAllDocblocks
    )
  );
}
