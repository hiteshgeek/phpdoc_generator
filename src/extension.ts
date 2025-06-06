import * as vscode from "vscode";
import { parsePHPBlocks, PHPBlock } from "./phpdocParser";
import { buildDocblock, parseDocblock, updateDocblock } from "./phpdocDocblock";
import {
  readSettingsCache,
  getDBConfigFromVSCode,
  isDBConfigComplete,
  fetchAllSettingsDescriptions,
  updateSettingsCacheAll,
} from "./settingsFetcher";
import * as path from "path";
import * as fs from "fs";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Log activation
  console.log("PHPDoc Generator extension activated");

  // Display message when extension is activated
  vscode.window.showInformationMessage("PHPDoc Generator extension activated");

  // Check settings
  const config = vscode.workspace.getConfiguration(
    "phpdoc-generator-hiteshgeek"
  );
  console.log("DB Host setting:", config.get("dbHost"));
  console.log("DB Port setting:", config.get("dbPort"));

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
    const dbConfig = getDBConfigFromVSCode();
    if (!isDBConfigComplete(dbConfig)) {
      // Mark that settings should be skipped using a string property unlikely to conflict
      return { __SKIP_SETTINGS: "1" };
    }
    let cache: Record<string, string> = {};
    try {
      // If cache file does not exist, or is empty/empty object, fetch and upd̥̥ate
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

  // Helper: Get leading whitespace for a line
  function getLineIndent(document: vscode.TextDocument, line: number): string {
    const text = document.lineAt(line).text;
    const match = text.match(/^\s*/);
    return match ? match[0] : "";
  }

  // Helper: Recursively generate docblocks for all blocks (with correct padding)
  async function generateDocblocksRecursive({
    document,
    editBuilder,
    block,
    settingsDescriptions = {},
    skipSettings = false,
    recurse = true, // default to true for file/project
  }: {
    document: vscode.TextDocument;
    editBuilder: vscode.TextEditorEdit;
    block: PHPBlock;
    settingsDescriptions?: Record<string, string>;
    skipSettings?: boolean;
    recurse?: boolean;
  }) {
    // Get indentation for the block's own start line
    const lineText = document.lineAt(block.startLine).text;
    const padding = getLineIndent(document, block.startLine);
    const paddingLength = padding.length;
    // DEBUG: Log the block name, line text, and its padding for troubleshooting
    console.log(
      `Docblock for '${block.name}' at line ${
        block.startLine
      }: line='${lineText}', padding='${JSON.stringify(
        padding
      )}', length=${paddingLength}`
    );
    // Find settings in function body (search for getSettings("Setting Name"))
    let settings: string[] | undefined = undefined;
    let throwsTypes: string[] = [];
    if (block.type === "function") {
      const funcStart = document.lineAt(block.startLine).range.start;
      const funcEnd = document.lineAt(block.endLine).range.end;
      const funcText = document.getText(new vscode.Range(funcStart, funcEnd));
      // Remove commented lines (single-line and multi-line)
      const uncommented = funcText
        .replace(/\/\*.*?\*\//gs, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      // Settings
      const settingsMatches = [
        ...uncommented.matchAll(/getSettings\(["'](.+?)["']\)/g),
      ];
      if (settingsMatches.length > 0) {
        settings = Array.from(new Set(settingsMatches.map((m) => m[1])));
      }
      // Throws: find all throw new ExceptionType (ignore commented lines)
      const throwMatches = [
        ...uncommented.matchAll(/throw\s+new\s+([\w\\]+)/g),
      ];
      throwsTypes = Array.from(
        new Set(throwMatches.map((m: RegExpMatchArray) => m[1]))
      );
      // Infer return type if not declared
      if (!block.returnType) {
        // Find all return statements
        const returnMatches = Array.from(
          uncommented.matchAll(/return\s+([^;]*);/g)
        );
        let inferredTypes: string[] = [];
        if (returnMatches.length > 0) {
          for (const m of returnMatches) {
            const val = m[1].trim();
            let inferredType: string | undefined = undefined;
            if (!val) continue;
            if (val === "null") {
              inferredType = "null";
            } else if (val === "true" || val === "false") {
              inferredType = "bool";
            } else if (/^\[.*\]$/.test(val) || /^array\s*\(/.test(val)) {
              inferredType = "array";
            } else if (/^-?\d+$/.test(val)) {
              inferredType = "int";
            } else if (/^-?\d*\.\d+$/.test(val)) {
              inferredType = "float";
            } else if (/^".*"$/.test(val) || /^'.*'$/.test(val)) {
              inferredType = "string";
            } else if (/^new\s+(static|self)\s*\(/.test(val)) {
              const match = val.match(/^new\s+(static|self)\s*\(/);
              inferredType = match ? match[1] : "mixed";
            } else if (/^new\s+([\\\w]+)\s*\(/.test(val)) {
              const match = val.match(/^new\s+([\\\w]+)\s*\(/);
              inferredType = match ? match[1] : "mixed";
            } else if (
              /^\$?[a-zA-Z_][\w]*\s*[+\-*/%]\s*\$?[a-zA-Z_][\w]*$/.test(val)
            ) {
              if (block.params && block.params.length >= 2) {
                const varMatch = val.match(
                  /^([\$]?[a-zA-Z_][\w]*)\s*[+\-*/%]\s*([\$]?[a-zA-Z_][\w]*)$/
                );
                if (varMatch) {
                  const v1 = varMatch[1].replace(/^\$/, "");
                  const v2 = varMatch[2].replace(/^\$/, "");
                  const p1 = block.params.find((p) => p.name === v1);
                  const p2 = block.params.find((p) => p.name === v2);
                  if (
                    (p1 && p1.type === "float") ||
                    (p2 && p2.type === "float")
                  ) {
                    inferredType = "float";
                  } else if (
                    p1 &&
                    p1.type === "int" &&
                    p2 &&
                    p2.type === "int"
                  ) {
                    inferredType = "int";
                  } else {
                    inferredType = "mixed";
                  }
                } else {
                  inferredType = "mixed";
                }
              } else {
                inferredType = "mixed";
              }
            } else if (
              /^\$?[a-zA-Z_][\w]*\s*\.\s*\$?[a-zA-Z_][\w]*$/.test(val)
            ) {
              if (block.params && block.params.length >= 2) {
                const varMatch = val.match(
                  /^([\$]?[a-zA-Z_][\w]*)\s*\.\s*([\$]?[a-zA-Z_][\w]*)$/
                );
                if (varMatch) {
                  const v1 = varMatch[1].replace(/^\$/, "");
                  const v2 = varMatch[2].replace(/^\$/, "");
                  const p1 = block.params.find((p) => p.name === v1);
                  const p2 = block.params.find((p) => p.name === v2);
                  if (
                    p1 &&
                    p1.type === "string" &&
                    p2 &&
                    p2.type === "string"
                  ) {
                    inferredType = "string";
                  } else {
                    inferredType = "mixed";
                  }
                } else {
                  inferredType = "mixed";
                }
              } else {
                inferredType = "mixed";
              }
            } else if (/^(['"][^'"]*['"]\s*\.)+['"][^'"]*['"]$/.test(val)) {
              inferredType = "string";
            } else if (
              /^(.+)?\?\s*(['"][^'"]*['"]|\d+|true|false|null)\s*:\s*(['"][^'"]*['"]|\d+|true|false|null)$/.test(
                val
              )
            ) {
              const ternaryMatch = val.match(
                /^.+\?\s*(['"][^'"]*['"]|\d+|true|false|null)\s*:\s*(['"][^'"]*['"]|\d+|true|false|null)$/
              );
              if (ternaryMatch && ternaryMatch[1] && ternaryMatch[2]) {
                const branchTypes = [ternaryMatch[1], ternaryMatch[2]].map(
                  (branch) => {
                    if (/^['"]/.test(branch)) return "string";
                    if (/^\d+$/.test(branch)) return "int";
                    if (/-?\d*\.\d+$/.test(branch)) return "float";
                    if (branch === "true" || branch === "false") return "bool";
                    if (branch === "null") return "null";
                    return "mixed";
                  }
                );
                inferredType =
                  branchTypes[0] === branchTypes[1] ? branchTypes[0] : "mixed";
              } else {
                inferredType = "mixed";
              }
            } else if (
              /^\$[\w_]+$/.test(val) ||
              /\w+\(.*\)/.test(val) ||
              /^[A-Z_][A-Z0-9_]*$/.test(val) ||
              /->/.test(val) ||
              /::/.test(val)
            ) {
              inferredType = "mixed";
            } else {
              inferredType = "mixed";
            }
            if (inferredType) {
              inferredTypes.push(inferredType);
            }
          }
          // Remove duplicates and void
          inferredTypes = Array.from(new Set(inferredTypes.filter(Boolean)));
          if (inferredTypes.length === 0) {
            inferredTypes = ["void"];
          }
          block.returnType = inferredTypes.join("|");
        } else {
          block.returnType = "void";
        }
      }
    }
    // Always generate docblocks for all block types and all children
    // Use explicit return type from signature if present
    if (block.type === "function") {
      const funcStart = document.lineAt(block.startLine).range.start;
      const funcEnd = document.lineAt(block.endLine).range.end;
      const funcText = document.getText(new vscode.Range(funcStart, funcEnd));
      const uncommented = funcText
        .replace(/\/\*.*?\*\//gs, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      // If block.returnType is present (from signature), always use it, even if it's 'void', do not fallback
      if (
        typeof block.returnType === "string" &&
        block.returnType.trim() !== ""
      ) {
        // nothing to do, just use block.returnType
      } else {
        // Find all return statements
        const returnMatches = Array.from(
          uncommented.matchAll(/return\s+([^;]*);/g)
        );
        let inferredTypes: string[] = [];
        if (returnMatches.length > 0) {
          for (const m of returnMatches) {
            const val = m[1].trim();
            let inferredType: string | undefined = undefined;
            if (!val) continue;
            if (val === "null") {
              inferredType = "null";
            } else if (val === "true" || val === "false") {
              inferredType = "bool";
            } else if (/^\[.*\]$/.test(val) || /^array\s*\(/.test(val)) {
              inferredType = "array";
            } else if (/^-?\d+$/.test(val)) {
              inferredType = "int";
            } else if (/^-?\d*\.\d+$/.test(val)) {
              inferredType = "float";
            } else if (/^".*"$/.test(val) || /^'.*'$/.test(val)) {
              inferredType = "string";
            } else if (/^new\s+(static|self)\s*\(/.test(val)) {
              const match = val.match(/^new\s+(static|self)\s*\(/);
              inferredType = match ? match[1] : "mixed";
            } else if (/^new\s+([\\\w]+)\s*\(/.test(val)) {
              const match = val.match(/^new\s+([\\\w]+)\s*\(/);
              inferredType = match ? match[1] : "mixed";
            } else if (
              /^\$?[a-zA-Z_][\w]*\s*[+\-*/%]\s*\$?[a-zA-Z_][\w]*$/.test(val)
            ) {
              if (block.params && block.params.length >= 2) {
                const varMatch = val.match(
                  /^([\$]?[a-zA-Z_][\w]*)\s*[+\-*/%]\s*([\$]?[a-zA-Z_][\w]*)$/
                );
                if (varMatch) {
                  const v1 = varMatch[1].replace(/^\$/, "");
                  const v2 = varMatch[2].replace(/^\$/, "");
                  const p1 = block.params.find((p) => p.name === v1);
                  const p2 = block.params.find((p) => p.name === v2);
                  if (
                    (p1 && p1.type === "float") ||
                    (p2 && p2.type === "float")
                  ) {
                    inferredType = "float";
                  } else if (
                    p1 &&
                    p1.type === "int" &&
                    p2 &&
                    p2.type === "int"
                  ) {
                    inferredType = "int";
                  } else {
                    inferredType = "mixed";
                  }
                } else {
                  inferredType = "mixed";
                }
              } else {
                inferredType = "mixed";
              }
            } else if (
              /^\$?[a-zA-Z_][\w]*\s*\.\s*\$?[a-zA-Z_][\w]*$/.test(val)
            ) {
              if (block.params && block.params.length >= 2) {
                const varMatch = val.match(
                  /^([\$]?[a-zA-Z_][\w]*)\s*\.\s*([\$]?[a-zA-Z_][\w]*)$/
                );
                if (varMatch) {
                  const v1 = varMatch[1].replace(/^\$/, "");
                  const v2 = varMatch[2].replace(/^\$/, "");
                  const p1 = block.params.find((p) => p.name === v1);
                  const p2 = block.params.find((p) => p.name === v2);
                  if (
                    p1 &&
                    p1.type === "string" &&
                    p2 &&
                    p2.type === "string"
                  ) {
                    inferredType = "string";
                  } else {
                    inferredType = "mixed";
                  }
                } else {
                  inferredType = "mixed";
                }
              } else {
                inferredType = "mixed";
              }
            } else if (/^(['"][^'"]*['"]\s*\.)+['"][^'"]*['"]$/.test(val)) {
              inferredType = "string";
            } else if (
              /^(.+)?\?\s*(['"][^'"]*['"]|\d+|true|false|null)\s*:\s*(['"][^'"]*['"]|\d+|true|false|null)$/.test(
                val
              )
            ) {
              const ternaryMatch = val.match(
                /^.+\?\s*(['"][^'"]*['"]|\d+|true|false|null)\s*:\s*(['"][^'"]*['"]|\d+|true|false|null)$/
              );
              if (ternaryMatch && ternaryMatch[1] && ternaryMatch[2]) {
                const branchTypes = [ternaryMatch[1], ternaryMatch[2]].map(
                  (branch) => {
                    if (/^['"]/.test(branch)) return "string";
                    if (/^\d+$/.test(branch)) return "int";
                    if (/-?\d*\.\d+$/.test(branch)) return "float";
                    if (branch === "true" || branch === "false") return "bool";
                    if (branch === "null") return "null";
                    return "mixed";
                  }
                );
                inferredType =
                  branchTypes[0] === branchTypes[1] ? branchTypes[0] : "mixed";
              } else {
                inferredType = "mixed";
              }
            } else if (
              /^\$[\w_]+$/.test(val) ||
              /\w+\(.*\)/.test(val) ||
              /^[A-Z_][A-Z0-9_]*$/.test(val) ||
              /->/.test(val) ||
              /::/.test(val)
            ) {
              inferredType = "mixed";
            } else {
              inferredType = "mixed";
            }
            if (inferredType) {
              inferredTypes.push(inferredType);
            }
          }
          // Remove duplicates and void
          inferredTypes = Array.from(new Set(inferredTypes.filter(Boolean)));
          if (inferredTypes.length === 0) {
            inferredTypes = ["void"];
          }
          block.returnType = inferredTypes.join("|");
        } else {
          block.returnType = "void";
        }
      }
    }
    // Always generate docblocks for all block types and all children
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
    // Generate docblock for every block, regardless of type
    if (!hasDoc) {
      // Ensure there is an empty line before the docblock if not already present
      const insertLine = block.startLine;
      const prevLineNum = insertLine - 1;
      let insertText = "";
      if (prevLineNum >= 0) {
        const prevLineText = document.lineAt(prevLineNum).text;
        if (prevLineText.trim() !== "") {
          insertText = "\n";
        }
      }
      const throwsTagsNew = throwsTypes.map((t: string) => `@throws ${t}`);
      const docblockNew = buildDocblock({
        summary: "",
        params: block.params || [],
        returnType: block.returnType,
        lines: [],
        name: block.name,
        settings: skipSettings
          ? undefined
          : settings?.map((s) => {
              if (
                !settingsDescriptions ||
                Object.keys(settingsDescriptions).length === 0
              )
                return s;
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
        otherTags: throwsTagsNew,
        padding: padding,
      });
      editBuilder.insert(
        new vscode.Position(insertLine, 0),
        insertText + docblockNew.join("\n") + "\n"
      );
    } else {
      // Ensure there is an empty line before the docblock if not already present
      const prevLineNum = docStart - 1;
      let needsEmptyLine = false;
      if (prevLineNum >= 0) {
        const prevLineText = document.lineAt(prevLineNum).text;
        if (prevLineText.trim() !== "") {
          needsEmptyLine = true;
        }
      }
      if (needsEmptyLine) {
        editBuilder.insert(new vscode.Position(docStart, 0), "\n");
      }
      const throwsTagsUpd = throwsTypes.map((t: string) => `@throws ${t}`);
      const docRangeUpd = new vscode.Range(
        new vscode.Position(docStart, 0),
        new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
      );
      const oldDocLinesUpd = document.getText(docRangeUpd).split("\n");
      const oldDocUpd = parseDocblock(oldDocLinesUpd);
      const existingThrowsUpd = (oldDocUpd.otherTags || []).filter(
        (tag: string) => tag.trim().startsWith("@throws")
      );
      const filteredThrowsUpd = existingThrowsUpd.filter((tag: string) =>
        throwsTypes.includes(tag.replace(/^@throws\s+/, "").trim())
      );
      const existingTypesUpd = new Set(
        filteredThrowsUpd.map((tag: string) =>
          tag.replace(/^@throws\s+/, "").trim()
        )
      );
      const newThrowsUpd = throwsTypes
        .filter((t: string) => !existingTypesUpd.has(t))
        .map((t: string) => `@throws ${t}`);
      const allThrowsUpd = [...filteredThrowsUpd, ...newThrowsUpd];
      // Get indentation from the first line of the existing docblock
      const docblockLine = oldDocLinesUpd[0] || "";
      const docblockIndent = docblockLine.match(/^\s*/)?.[0] ?? "";
      const updatedUpd = {
        ...updateDocblock(oldDocUpd, block.params || [], block.returnType),
        name: block.name,
        settings: settings?.map((s) =>
          settingsDescriptions[s] ? `${s} : ${settingsDescriptions[s]}` : s
        ),
        type: block.type,
        otherTags: allThrowsUpd,
        lines: [],
        returnType: block.returnType, // always force update returnType from signature
      };
      const newDocUpd = buildDocblock({
        ...updatedUpd,
        padding: docblockIndent,
      });
      editBuilder.replace(docRangeUpd, newDocUpd.join("\n"));
    }
    // After handling class docblock, add @var docblocks for each property
    if (block.type === "class" && block.children && block.children.length > 0) {
      console.log(
        `[PHPDoc] Class '${block.name}' children:`,
        block.children.map((c) => ({
          type: c.type,
          name: c.name,
          startLine: c.startLine,
          returnType: c.returnType,
        }))
      );
      for (const child of block.children) {
        if (child.type === "property" && child.name) {
          const propLine = child.startLine;
          const propType = child.returnType || "mixed";
          const propDoc = [
            getLineIndent(document, propLine) + "/**",
            getLineIndent(document, propLine) +
              ` * @var ${propType} Property description`,
            getLineIndent(document, propLine) + "*/",
          ];
          // Check if a docblock already exists above the property (skip whitespace)
          let hasDoc = false;
          let checkLine = propLine - 1;
          while (checkLine >= 0) {
            const prevLineText = document.lineAt(checkLine).text.trim();
            if (prevLineText === "") {
              checkLine--;
              continue;
            }
            if (prevLineText.startsWith("/**")) {
              hasDoc = true;
            }
            break;
          }
          if (!hasDoc) {
            editBuilder.insert(
              new vscode.Position(propLine, 0),
              "\n" + propDoc.join("\n") + "\n"
            );
          }
        }
      }
    }
    // Always process property children for class blocks, even if block.children is missing or empty
    if (block.type === "class") {
      let propertyBlocks =
        block.children?.filter((c) => c.type === "property" && c.name) || [];
      // Fallback: If no children, try to parse property lines directly
      if (propertyBlocks.length === 0) {
        const classStart = block.startLine;
        const classEnd = block.endLine;
        for (let i = classStart + 1; i < classEnd; ++i) {
          const line = document.lineAt(i).text.trim();
          // Match PHP property declaration
          const match = line.match(
            /^(public|protected|private)?\s*(static)?\s*([\\\w]+)?\s*\$([a-zA-Z_][\w]*)/
          );
          if (match) {
            const propType = match[3] || "mixed";
            const propName = match[4];
            // Check if a docblock already exists above the property (skip whitespace)
            let hasDoc = false;
            let checkLine = i - 1;
            while (checkLine >= 0) {
              const prevLineText = document.lineAt(checkLine).text.trim();
              if (prevLineText === "") {
                checkLine--;
                continue;
              }
              if (prevLineText.startsWith("/**")) {
                hasDoc = true;
              }
              break;
            }
            if (!hasDoc) {
              const propDoc = [
                getLineIndent(document, i) + "/**",
                getLineIndent(document, i) +
                  ` * @var ${propType} Property description`,
                getLineIndent(document, i) + "*/",
              ];
              editBuilder.insert(
                new vscode.Position(i, 0),
                "\n" + propDoc.join("\n") + "\n"
              );
            }
          }
        }
      } else {
        for (const child of propertyBlocks) {
          const propLine = child.startLine;
          const propType = child.returnType || "mixed";
          const propDoc = [
            getLineIndent(document, propLine) + "/**",
            getLineIndent(document, propLine) +
              ` * @var ${propType} Property description`,
            getLineIndent(document, propLine) + "*/",
          ];
          // Check if a docblock already exists above the property (skip whitespace)
          let hasDoc = false;
          let checkLine = propLine - 1;
          while (checkLine >= 0) {
            const prevLineText = document.lineAt(checkLine).text.trim();
            if (prevLineText === "") {
              checkLine--;
              continue;
            }
            if (prevLineText.startsWith("/**")) {
              hasDoc = true;
            }
            break;
          }
          if (!hasDoc) {
            editBuilder.insert(
              new vscode.Position(propLine, 0),
              "\n" + propDoc.join("\n") + "\n"
            );
          }
        }
      }
    }
    // Always recurse into children
    if (recurse && block.children && block.children.length > 0) {
      for (const child of block.children) {
        await generateDocblocksRecursive({
          document,
          editBuilder,
          block: child,
          settingsDescriptions,
          skipSettings,
          recurse: true,
        });
      }
    }
  }

  // Improved: Find the innermost block containing the cursor, or the next block after a docblock if the cursor is inside a docblock
  function findBlockForCursor(
    blocks: PHPBlock[],
    line: number,
    document: vscode.TextDocument
  ): PHPBlock | undefined {
    // 1. Try to find a block that contains the cursor
    let found: PHPBlock | undefined;
    function search(blockList: PHPBlock[]) {
      for (const block of blockList) {
        if (line >= block.startLine && line <= block.endLine) {
          found = block;
          if (block.children && block.children.length > 0) {
            search(block.children);
          }
        }
      }
    }
    search(blocks);
    if (found) return found;
    // 2. If not found, check if the cursor is inside a docblock that precedes a block
    // Scan up to 20 lines ahead for a block start
    for (const block of blocks) {
      if (line < block.startLine && block.startLine - line <= 20) {
        // Check if there is a docblock between line and block.startLine
        let docStart = block.startLine - 1;
        let docEnd = docStart;
        let foundDoc = false;
        while (docStart >= 0) {
          const docLine = document.lineAt(docStart).text.trim();
          if (docLine.startsWith("/**")) {
            foundDoc = true;
            break;
          }
          if (docLine === "") {
            docStart--;
            docEnd--;
            continue;
          }
          if (!docLine.startsWith("*") && !docLine.startsWith("//")) break;
          docStart--;
        }
        if (foundDoc && line >= docStart && line <= docEnd) {
          return block;
        }
      }
      // Also check children recursively
      if (block.children && block.children.length > 0) {
        const child = findBlockForCursor(block.children, line, document);
        if (child) return child;
      }
    }
    return undefined;
  }

  // Command to generate PHPDoc for the current block
  async function generatePHPDoc() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor found");
      return;
    }
    const document = editor.document;
    if (document.languageId !== "php") {
      vscode.window.showWarningMessage("Active document is not a PHP file");
      return;
    }
    const text = document.getText();
    const blocks = parsePHPBlocks(text);
    const pos = editor.selection.active;
    // Use the improved block finder
    const block = findBlockForCursor(blocks, pos.line, document);
    if (!block) {
      vscode.window.showInformationMessage(
        "Cursor must be inside a PHP function, class, interface, or its docblock."
      );
      return;
    }
    // Collect all settings for this block and its children
    const allSettings = new Set<string>();
    function collectSettingsRecursive(block: PHPBlock) {
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
      if (block.children && block.children.length > 0) {
        block.children.forEach(collectSettingsRecursive);
      }
    }
    // Only collect settings for this block (not all children) for single-block docgen
    collectSettingsRecursive(block);
    let settingsDescriptions: Record<string, string> = {};
    if (allSettings.size > 0) {
      settingsDescriptions = await ensureSettingsCache(Array.from(allSettings));
    }
    await editor.edit(async (editBuilder) => {
      await generateDocblocksRecursive({
        document,
        editBuilder,
        block,
        settingsDescriptions,
        skipSettings: !!settingsDescriptions.__SKIP_SETTINGS,
        recurse: false,
      });
    });
    vscode.window.showInformationMessage(
      "PHPDoc generated/updated for current block."
    );
  }

  async function generatePHPDocForFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "php") return;
    const { document } = editor;
    const text = document.getText();
    const blocks = parsePHPBlocks(text);
    // Collect all unique settings used in all blocks
    const allSettings = new Set<string>();
    function collectSettingsRecursive(block: PHPBlock) {
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
      if (block.children && block.children.length > 0) {
        block.children.forEach(collectSettingsRecursive);
      }
    }
    blocks.forEach(collectSettingsRecursive);
    let settingsDescriptions: Record<string, string> = {};
    if (allSettings.size > 0) {
      settingsDescriptions = await ensureSettingsCache(Array.from(allSettings));
    }
    await editor.edit(async (editBuilder) => {
      // Flatten all blocks and sub-blocks into a single array
      const allBlocks: PHPBlock[] = [];
      function flattenBlocks(block: PHPBlock) {
        allBlocks.push(block);
        if (
          block.children &&
          Array.isArray(block.children) &&
          block.children.length > 0
        ) {
          block.children.forEach(flattenBlocks);
        }
      }
      for (const block of blocks) {
        flattenBlocks(block);
      }
      // Sort all blocks by startLine descending to avoid shifting lines
      allBlocks.sort((a, b) => b.startLine - a.startLine);
      // Await all docblock generations in parallel
      await Promise.all(
        allBlocks.map((block) =>
          generateDocblocksRecursive({
            document,
            editBuilder,
            block,
            settingsDescriptions,
            skipSettings: !!settingsDescriptions.__SKIP_SETTINGS,
            recurse: false,
          })
        )
      );
    });
    vscode.window.showInformationMessage(
      "PHPDoc generated for all blocks in the current file."
    );
  }

  async function generatePHPDocForProject() {
    const config = vscode.workspace.getConfiguration(
      "phpdoc-generator-hiteshgeek"
    );
    const exclude: string[] = config.get("exclude", []);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return;
    }
    const phpFiles: vscode.Uri[] = [];
    for (const folder of workspaceFolders) {
      const files = await vscode.workspace.findFiles(
        "**/*.php",
        exclude.length > 0 ? `{${exclude.join(",")}}` : undefined
      );
      phpFiles.push(...files);
    }
    if (phpFiles.length === 0) {
      vscode.window.showInformationMessage(
        "No PHP files found in the project."
      );
      return;
    }
    for (const file of phpFiles) {
      const document = await vscode.workspace.openTextDocument(file);
      const text = document.getText();
      const blocks = parsePHPBlocks(text);
      // Collect all unique settings used in all blocks
      const allSettings = new Set<string>();
      for (const block of blocks) {
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
            settingsMatches.forEach((m) => allSettings.add(m[1]));
          }
        }
      }
      let settingsDescriptions: Record<string, string> = {};
      if (allSettings.size > 0) {
        settingsDescriptions = await ensureSettingsCache(
          Array.from(allSettings)
        );
      }
      // Sort blocks by startLine descending to avoid shifting lines when inserting
      blocks.sort((a: any, b: any) => b.startLine - a.startLine);
      await vscode.window.showTextDocument(document, { preview: false });
      await vscode.window.activeTextEditor?.edit((editBuilder) => {
        for (const block of blocks) {
          let settings: string[] | undefined = undefined;
          let throwsTypes: string[] = [];
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
            // Throws: find all throw new ExceptionType (ignore commented lines)
            const throwMatches = [
              ...uncommented.matchAll(/throw\s+new\s+([\w\\]+)/g),
            ];
            throwsTypes = Array.from(
              new Set(throwMatches.map((m: RegExpMatchArray) => m[1]))
            );
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
            const lineText = document.lineAt(block.startLine).text;
            const padding = lineText.match(/^\s*/)?.[0] ?? "";
            const throwsTags = throwsTypes.map((t: string) => `@throws ${t}`);
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
              otherTags: throwsTags,
              padding: padding, // Use actual whitespace for indentation
            });
            editBuilder.insert(
              new vscode.Position(block.startLine, 0),
              docblock.join("\n") + "\n"
            );
          } else {
            const throwsTags = throwsTypes.map((t: string) => `@throws ${t}`);
            const docRange = new vscode.Range(
              new vscode.Position(docStart, 0),
              new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
            );
            const oldDocLines = document.getText(docRange).split("\n");
            const oldDoc = parseDocblock(oldDocLines);
            // Merge throws: add any new throwsTypes not already present, and remove any that are no longer present
            const existingThrows = (oldDoc.otherTags || []).filter(
              (tag: string) => tag.trim().startsWith("@throws")
            );
            const filteredThrows = existingThrows.filter((tag: string) =>
              throwsTypes.includes(tag.replace(/^@throws\s+/, "").trim())
            );
            const existingTypes = new Set(
              filteredThrows.map((tag: string) =>
                tag.replace(/^@throws\s+/, "").trim()
              )
            );
            const newThrows = throwsTypes
              .filter((t: string) => !existingTypes.has(t))
              .map((t: string) => `@throws ${t}`);
            const allThrows = [...filteredThrows, ...newThrows];
            const updated = {
              ...updateDocblock(oldDoc, block.params || [], block.returnType),
              name: block.name,
              settings: settings?.map((s) =>
                settingsDescriptions[s]
                  ? `${s} : ${settingsDescriptions[s]}`
                  : s
              ),
              type: block.type,
              otherTags: allThrows,
              lines: [], // Force buildDocblock to always enforce the empty line rule
            };
            const newDoc = buildDocblock(updated);
            editBuilder.replace(docRange, newDoc.join("\n"));
          }
        }
      });
    }
    vscode.window.showInformationMessage(
      "PHPDoc generated for all PHP files in the project."
    );
  }

  async function refreshSettingsCacheForAll() {
    const cachePath = path.resolve(__dirname, "../settings_cache.json");
    const config = vscode.workspace.getConfiguration(
      "phpdoc-generator-hiteshgeek"
    );
    const dbHost = config.get<string>("dbHost") || "";
    const dbUser = config.get<string>("dbUser") || "";
    const dbPassword = config.get<string>("dbPassword") || "";
    const dbName = config.get<string>("dbName") || "";
    const dbLicid = config.get<string>("dbLicid") || "";
    if (!dbHost || !dbUser || !dbPassword || !dbName || !dbLicid) {
      vscode.window.showErrorMessage(
        "PHPDoc Generator: Database configuration is incomplete. Cannot refresh settings cache.",
        { modal: true }
      );
      return;
    }
    try {
      await updateSettingsCacheAll(cachePath);
      showStatus("Settings cache refreshed");
    } catch (e: any) {
      vscode.window.showErrorMessage(
        `PHPDoc Generator: Failed to refresh settings cache. ${
          e && e.message ? e.message : e
        }`,
        { modal: true }
      );
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.generatePHPDoc",
      generatePHPDoc
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.generatePHPDocForFile",
      generatePHPDocForFile
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.refreshSettingsCache",
      refreshSettingsCacheForAll
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.generatePHPDocForProject",
      generatePHPDocForProject
    )
  );

  // Command: Collapse all docblocks in the current file
  async function collapseAllDocblocks() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const totalLines = doc.lineCount;
    const ranges: vscode.Range[] = [];
    let inDocblock = false;
    let start = 0;
    for (let i = 0; i < totalLines; ++i) {
      const line = doc.lineAt(i).text.trim();
      if (!inDocblock && line.startsWith("/**")) {
        inDocblock = true;
        start = i;
      }
      if (inDocblock && line.endsWith("*/")) {
        inDocblock = false;
        ranges.push(new vscode.Range(start, 0, i, doc.lineAt(i).text.length));
      }
    }
    for (const range of ranges) {
      editor.selection = new vscode.Selection(range.start, range.start);
      await vscode.commands.executeCommand("editor.fold");
    }
  }

  // Command: Expand all docblocks in the current file
  async function expandAllDocblocks() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const totalLines = doc.lineCount;
    const ranges: vscode.Range[] = [];
    let inDocblock = false;
    let start = 0;
    for (let i = 0; i < totalLines; ++i) {
      const line = doc.lineAt(i).text.trim();
      if (!inDocblock && line.startsWith("/**")) {
        inDocblock = true;
        start = i;
      }
      if (inDocblock && line.endsWith("*/")) {
        inDocblock = false;
        ranges.push(new vscode.Range(start, 0, i, doc.lineAt(i).text.length));
      }
    }
    for (const range of ranges) {
      editor.selection = new vscode.Selection(range.start, range.start);
      await vscode.commands.executeCommand("editor.unfold");
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.collapseAllDocblocks",
      collapseAllDocblocks
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.expandAllDocblocks",
      expandAllDocblocks
    )
  );

  // --- Generate/Update on Save feature ---
  let generateUpdateOnSave = vscode.workspace
    .getConfiguration("phpdoc-generator-hiteshgeek")
    .get<boolean>("generateUpdateOnSave", false);

  // Add status bar item for generate/update on save
  const generateUpdateOnSaveStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    98
  );
  generateUpdateOnSaveStatusBar.command =
    "phpdoc-generator.toggleGenerateUpdateOnSave";
  function updateGenerateUpdateOnSaveStatusBar() {
    generateUpdateOnSaveStatusBar.text = generateUpdateOnSave
      ? "$(check) PHPDoc: Generate/Update on Save"
      : "$(circle-slash) PHPDoc: Generate/Update on Save";
    generateUpdateOnSaveStatusBar.tooltip = generateUpdateOnSave
      ? "PHPDoc blocks will be generated/updated for the file automatically on save. Click to disable."
      : "PHPDoc blocks will NOT be generated/updated on save. Click to enable.";
    generateUpdateOnSaveStatusBar.show();
  }
  updateGenerateUpdateOnSaveStatusBar();
  context.subscriptions.push(generateUpdateOnSaveStatusBar);

  // Command to toggle generate/update on save
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpdoc-generator.toggleGenerateUpdateOnSave",
      async () => {
        generateUpdateOnSave = !generateUpdateOnSave;
        await vscode.workspace
          .getConfiguration("phpdoc-generator-hiteshgeek")
          .update(
            "generateUpdateOnSave",
            generateUpdateOnSave,
            vscode.ConfigurationTarget.Global
          );
        updateGenerateUpdateOnSaveStatusBar();
        vscode.window.showInformationMessage(
          `PHPDoc: Generate/Update on Save is now ${
            generateUpdateOnSave ? "enabled" : "disabled"
          }.`
        );
      }
    )
  );

  // Listen for configuration changes to update status bar
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration(
          "phpdoc-generator-hiteshgeek.generateUpdateOnSave"
        )
      ) {
        generateUpdateOnSave = vscode.workspace
          .getConfiguration("phpdoc-generator-hiteshgeek")
          .get<boolean>("generateUpdateOnSave", false);
        updateGenerateUpdateOnSaveStatusBar();
      }
    })
  );

  // Listen for file saves and run the command if enabled
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (generateUpdateOnSave && document.languageId === "php") {
        await vscode.commands.executeCommand(
          "phpdoc-generator.generatePHPDocForFile"
        );
      }
    })
  );

  // Register a FoldingRangeProvider for PHPDoc blocks
  vscode.languages.registerFoldingRangeProvider(
    { language: "php" },
    {
      provideFoldingRanges(document, context, token) {
        const ranges = [];
        const totalLines = document.lineCount;
        let inDocblock = false;
        let start = 0;
        for (let i = 0; i < totalLines; ++i) {
          const line = document.lineAt(i).text.trim();
          if (!inDocblock && line.startsWith("/**")) {
            inDocblock = true;
            start = i;
          }
          if (inDocblock && line.endsWith("*/")) {
            // Check if the next non-empty, non-comment line is a function definition
            let nextLine = i + 1;
            let shouldFold = true;
            while (nextLine < totalLines) {
              const nextText = document.lineAt(nextLine).text.trim();
              if (nextText === "" || nextText.startsWith("*")) {
                nextLine++;
                continue;
              }
              // If next line is another docblock, do not fold (nested/recursive)
              if (nextText.startsWith("/**")) {
                shouldFold = false;
              }
              break;
            }
            inDocblock = false;
            if (i > start && shouldFold) {
              ranges.push(
                new vscode.FoldingRange(
                  start,
                  i,
                  vscode.FoldingRangeKind.Comment
                )
              );
            }
          }
        }
        return ranges;
      },
    }
  );

  // Keybinding is set in package.json
}

// This method is called when your extension is deactivated
export function deactivate() {}
