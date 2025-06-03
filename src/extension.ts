// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { parsePHPBlocks, PHPBlock } from "./phpdocParser";
import { parseDocblock, buildDocblock, updateDocblock } from "./phpdocDocblock";
import { updateSettingsCacheAll, readSettingsCache } from "./settingsFetcher";
import * as path from "path";
import * as fs from "fs";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.command = "phpdoc-generator.generatePHPDoc";
  statusBar.text = "$(book) PHPDoc";
  statusBar.tooltip = "Generate or update PHPDoc for current block";
  context.subscriptions.push(statusBar);

  function showStatus(msg: string, timeout = 2000) {
    statusBar.text = `$(book) ${msg}`;
    statusBar.show();
    setTimeout(() => statusBar.hide(), timeout);
  }

  async function ensureSettingsCache(
    settings: string[]
  ): Promise<Record<string, string>> {
    const cachePath = path.resolve(__dirname, "../settings_cache.json");
    let cache: Record<string, string> = {};
    try {
      // If cache file does not exist, or is empty/empty object, fetch and update
      if (!fs.existsSync(cachePath)) {
        await updateSettingsCacheAll(cachePath);
      } else {
        const stat = fs.statSync(cachePath);
        if (stat.size === 0) {
          await updateSettingsCacheAll(cachePath);
        } else {
          const content = fs.readFileSync(cachePath, "utf-8");
          if (
            !content.trim() ||
            content.trim() === "{}" ||
            content.trim() === "[]"
          ) {
            await updateSettingsCacheAll(cachePath);
          }
        }
      }
      cache = readSettingsCache(cachePath);
    } catch (e) {
      cache = readSettingsCache(cachePath);
    }
    return cache;
  }

  async function generatePHPDoc() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "php") return;
    const { document } = editor;
    const text = document.getText();
    const blocks = parsePHPBlocks(text);
    const pos = editor.selection.active;
    const block = blocks.find((b) => b.startLine === pos.line);
    if (!block) {
      vscode.window.showInformationMessage(
        "Cursor must be on the first line of a PHP block."
      );
      return;
    }

    // Find settings in function body (search for getSettings("Setting Name"))
    let settings: string[] | undefined = undefined;
    if (block.type === "function") {
      // Find the function body text
      const funcStart = document.lineAt(block.startLine).range.start;
      const funcEnd = document.lineAt(block.endLine).range.end;
      const funcText = document.getText(new vscode.Range(funcStart, funcEnd));
      // Remove commented lines (single-line and multi-line)
      const uncommented = funcText
        .replace(/\/\*.*?\*\//gs, "") // remove /* ... */
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      const settingsMatches = [
        ...uncommented.matchAll(/getSettings\(["'](.+?)["']\)/g),
      ];
      if (settingsMatches.length > 0) {
        settings = Array.from(new Set(settingsMatches.map((m) => m[1])));
      }
    }
    let settingsDescriptions: Record<string, string> = {};
    if (settings && settings.length > 0) {
      settingsDescriptions = await ensureSettingsCache(settings);
    }

    // Check for existing docblock
    let docStart = block.startLine - 1;
    let hasDoc = false;
    let docEnd = docStart;
    while (docStart >= 0) {
      const line = document.lineAt(docStart).text.trim();
      if (line === "") {
        docStart--;
        docEnd--;
        continue;
      }
      if (line.startsWith("/**")) {
        hasDoc = true;
        break;
      }
      if (!line.startsWith("*") && !line.startsWith("//")) break;
      docStart--;
    }
    if (hasDoc) {
      docEnd = docStart;
      while (docEnd < block.startLine) {
        if (document.lineAt(docEnd).text.includes("*/")) break;
        docEnd++;
      }
    }
    await editor.edit((editBuilder) => {
      if (!hasDoc) {
        // Insert new docblock
        const docblock = buildDocblock({
          summary: "",
          params: block.params || [],
          returnType: block.returnType,
          lines: [],
          name: block.name, // Pass function name for docblock
          settings: settings?.map((s) => {
            const desc = settingsDescriptions[s];
            if (desc && desc.trim() && desc.trim() !== s) {
              return `${s} : ${desc}`;
            } else if (desc && desc.trim()) {
              return `${s} : ${desc}`;
            } else {
              return `${s}`;
            }
          }),
          type: block.type,
        });
        editBuilder.insert(
          document.lineAt(block.startLine).range.start,
          docblock.join("\n") + "\n"
        );
        showStatus("PHPDoc generated");
      } else {
        // Update existing docblock
        const docRange = new vscode.Range(
          new vscode.Position(docStart, 0),
          new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
        );
        const oldDocLines = document.getText(docRange).split("\n");
        const oldDoc = parseDocblock(oldDocLines);
        // If settings are present, update; if not, remove from docblock
        const updated = {
          ...updateDocblock(oldDoc, block.params || [], block.returnType),
          name: block.name,
          settings: settings?.map((s) =>
            settingsDescriptions[s] ? `${s} : ${settingsDescriptions[s]}` : s
          ),
          type: block.type,
        };
        const newDoc = buildDocblock(updated);
        editBuilder.replace(docRange, newDoc.join("\n"));
        showStatus("PHPDoc updated");
      }
    });
  }

  async function generatePHPDocForAll() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "php") return;
    const { document } = editor;
    const text = document.getText();
    const blocks = parsePHPBlocks(text);
    // Collect all unique settings used in all blocks
    const allSettings = new Set<string>();
    for (const block of blocks) {
      if (block.type === "function") {
        const funcStart = document.lineAt(block.startLine).range.start;
        const funcEnd = document.lineAt(block.endLine).range.end;
        const funcText = document.getText(new vscode.Range(funcStart, funcEnd));
        const uncommented = funcText
          .replace(/\/\*.*?\*\//gs, "")
          .split("\n")
          .filter((line) => !line.trim().startsWith("//"))
          .join("\n");
        const settingsMatches = [
          ...uncommented.matchAll(/getSettings\(["'](.+?)["']\)/g),
        ];
        if (settingsMatches.length > 0) {
          settingsMatches.forEach((m) => allSettings.add(m[1]));
        }
      }
    }
    // Fetch settings descriptions cache once
    let settingsDescriptions: Record<string, string> = {};
    if (allSettings.size > 0) {
      settingsDescriptions = await ensureSettingsCache(Array.from(allSettings));
    }
    // Sort blocks by startLine descending to avoid shifting lines when inserting
    blocks.sort((a, b) => b.startLine - a.startLine);
    await editor.edit((editBuilder) => {
      for (const block of blocks) {
        let settings: string[] | undefined = undefined;
        if (block.type === "function") {
          const funcStart = document.lineAt(block.startLine).range.start;
          const funcEnd = document.lineAt(block.endLine).range.end;
          const funcText = document.getText(
            new vscode.Range(funcStart, funcEnd)
          );
          const uncommented = funcText
            .replace(/\/\*.*?\*\//gs, "")
            .split("\n")
            .filter((line) => !line.trim().startsWith("//"))
            .join("\n");
          const settingsMatches = [
            ...uncommented.matchAll(/getSettings\(["'](.+?)["']\)/g),
          ];
          if (settingsMatches.length > 0) {
            settings = Array.from(new Set(settingsMatches.map((m) => m[1])));
          }
        }
        // Check for existing docblock
        let docStart = block.startLine - 1;
        let hasDoc = false;
        let docEnd = docStart;
        while (docStart >= 0) {
          const line = document.lineAt(docStart).text.trim();
          if (line === "") {
            docStart--;
            docEnd--;
            continue;
          }
          if (line.startsWith("/**")) {
            hasDoc = true;
            break;
          }
          if (!line.startsWith("*") && !line.startsWith("//")) break;
          docStart--;
        }
        if (hasDoc) {
          docEnd = docStart;
          while (docEnd < block.startLine) {
            if (document.lineAt(docEnd).text.includes("*/")) break;
            docEnd++;
          }
        }
        if (!hasDoc) {
          // Insert new docblock
          const docblock = buildDocblock({
            summary: "",
            params: block.params || [],
            returnType: block.returnType,
            lines: [],
            name: block.name,
            settings: settings?.map((s) => {
              const desc = settingsDescriptions[s];
              if (desc && desc.trim() && desc.trim() !== s) {
                return `${s} : ${desc}`;
              } else if (desc && desc.trim()) {
                return `${s} : ${desc}`;
              } else {
                return `${s}`;
              }
            }),
            type: block.type,
          });
          editBuilder.insert(
            document.lineAt(block.startLine).range.start,
            docblock.join("\n") + "\n"
          );
        } else {
          // Update existing docblock
          const docRange = new vscode.Range(
            new vscode.Position(docStart, 0),
            new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
          );
          const oldDocLines = document.getText(docRange).split("\n");
          const oldDoc = parseDocblock(oldDocLines);
          const updated = {
            ...updateDocblock(oldDoc, block.params || [], block.returnType),
            name: block.name,
            settings: settings?.map((s) =>
              settingsDescriptions[s] ? `${s} : ${settingsDescriptions[s]}` : s
            ),
            type: block.type,
          };
          const newDoc = buildDocblock(updated);
          editBuilder.replace(docRange, newDoc.join("\n"));
        }
      }
    });
    showStatus("PHPDoc generated for all blocks");
  }

  async function refreshSettingsCacheForAll() {
    const cachePath = path.resolve(__dirname, "../settings_cache.json");
    await updateSettingsCacheAll(cachePath);
    showStatus("Settings cache refreshed");
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.generatePHPDoc",
      generatePHPDoc
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.generatePHPDocForAll",
      generatePHPDocForAll
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.refreshSettingsCache",
      refreshSettingsCacheForAll
    )
  );

  // Keybinding is set in package.json
}

// This method is called when your extension is deactivated
export function deactivate() {}
