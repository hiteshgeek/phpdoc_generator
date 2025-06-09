import * as vscode from "vscode";
import {
  parsePHPBlocks,
  PHPBlock,
  collectReturnTypesFromFunctionNode,
} from "../phpdocParser";
import {
  buildDocblock,
  parseDocblock,
  updateDocblock,
} from "../phpdocDocblock";
import {
  readSettingsCache,
  getDBConfigFromVSCode,
  isDBConfigComplete,
  updateSettingsCacheAll,
} from "../settingsFetcher";
import * as path from "path";
import * as fs from "fs";

export async function generatePHPDoc() {
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
      recurse: false, // Only process the single block, not all blocks in file
    });
  });
}

export async function generatePHPDocForFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "php") return;
  const { document } = editor;
  const text = document.getText();
  const blocks = parsePHPBlocks(text);
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
    allBlocks.sort((a, b) => b.startLine - a.startLine);
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
}

export async function generatePHPDocForProject() {
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
    vscode.window.showInformationMessage("No PHP files found in the project.");
    return;
  }
  for (const file of phpFiles) {
    const document = await vscode.workspace.openTextDocument(file);
    const text = document.getText();
    const blocks = parsePHPBlocks(text);
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
    let settingsDescriptions: Record<string, string> = {};
    if (allSettings.size > 0) {
      settingsDescriptions = await ensureSettingsCache(Array.from(allSettings));
    }
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
        }
        let docStart = block.startLine - 1;
        let hasDoc = false;
        let docEnd = docStart;
        // Get indentation for the block's own start line
        const lineText = document.lineAt(block.startLine).text;
        const padding = lineText.match(/^[\s]*/)?.[0] ?? "";
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
          const throwsTags = throwsTypes.map((t: string) => `@throws ${t}`);
          const docblock = buildDocblock({
            summary: "",
            params: block.params || [],
            returnType: block.returnType,
            lines: [],
            name: block.name,
            settings: settings?.map((s: string) => {
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
            padding: padding,
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
            settings: settings?.map((s: string) =>
              settingsDescriptions[s] ? `${s} : ${settingsDescriptions[s]}` : s
            ),
            type: block.type,
            otherTags: allThrows,
            lines: [],
            preservedTags: oldDoc.preservedTags, // <-- ensure preservedTags are passed
          };
          const newDoc = buildDocblock({ ...updated, padding });
          editBuilder.replace(docRange, newDoc.join("\n"));
        }
      }
    });
  }
  // Remove notification for project-level docblock generation
  // vscode.window.showInformationMessage(
  //   "PHPDoc generated for all PHP files in the project."
  // );
}

export async function refreshSettingsCacheForAll() {
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
    vscode.window.setStatusBarMessage("Settings cache refreshed", 2000);
  } catch (e: any) {
    vscode.window.showErrorMessage(
      `PHPDoc Generator: Failed to refresh settings cache. ${
        e && e.message ? e.message : e
      }`,
      { modal: true }
    );
  }
}

export async function collapseAllDocblocks() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const totalLines = doc.lineCount;
  const starts: vscode.Position[] = [];
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
      if (i > start) {
        starts.push(new vscode.Position(start, 0));
      }
    }
  }
  if (starts.length > 0) {
    editor.selections = starts.map((pos) => new vscode.Selection(pos, pos));
    await vscode.commands.executeCommand("editor.fold");
  }
}

export async function expandAllDocblocks() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const totalLines = doc.lineCount;
  const starts: vscode.Position[] = [];
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
      if (i > start) {
        starts.push(new vscode.Position(start, 0));
      }
    }
  }
  if (starts.length > 0) {
    editor.selections = starts.map((pos) => new vscode.Selection(pos, pos));
    await vscode.commands.executeCommand("editor.unfold");
  }
}

// --- Helpers ---
// Remove all automatic cache update logic from ensureSettingsCache
async function ensureSettingsCache(
  settings: string[]
): Promise<Record<string, string>> {
  const cachePath = path.resolve(__dirname, "../settings_cache.json");
  let cache: Record<string, string> = {};
  try {
    cache = readSettingsCache(cachePath);
  } catch (e) {
    cache = {};
  }
  return cache;
}

function findBlockForCursor(
  blocks: PHPBlock[],
  line: number,
  document: vscode.TextDocument
): PHPBlock | undefined {
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
  for (const block of blocks) {
    if (line < block.startLine && block.startLine - line <= 20) {
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
    if (block.children && block.children.length > 0) {
      const child = findBlockForCursor(block.children, line, document);
      if (child) return child;
    }
  }
  return undefined;
}

// Helper: Recursively generate docblocks for all blocks (with correct padding)
async function generateDocblocksRecursive({
  document,
  editBuilder,
  block,
  settingsDescriptions = {},
  skipSettings = false,
  recurse = true,
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
  const padding = lineText.match(/^\s*/)?.[0] ?? "";
  // Find settings in function body (search for getSettings("Setting Name"))
  let settings: string[] | undefined = undefined;
  let throwsTypes: string[] = [];
  if (block.type === "function") {
    const funcStart = document.lineAt(block.startLine).range.start;
    const funcEnd = document.lineAt(block.endLine).range.end;
    const funcText = document.getText(new vscode.Range(funcStart, funcEnd));
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
    const throwMatches = [...uncommented.matchAll(/throw\s+new\s+([\w\\]+)/g)];
    throwsTypes = Array.from(
      new Set(throwMatches.map((m: RegExpMatchArray) => m[1]))
    );
    // --- Robust return type inference using AST (ignore nested functions/closures, union all top-level returns) ---
    const text = document.getText();
    const PHPParser = require("php-parser");
    const parser = new PHPParser.Engine({
      parser: { extractDoc: true },
      ast: { withPositions: true },
    });
    const ast = parser.parseCode(text, "");
    let targetNode: any = null;
    function findNode(node: any) {
      if (!node || typeof node !== "object") return;
      if (
        (node.kind === "function" || node.kind === "method") &&
        node.loc &&
        node.loc.start.line - 1 === block.startLine &&
        node.loc.end.line - 1 === block.endLine
      ) {
        targetNode = node;
      }
      for (const key in node) {
        if (node.hasOwnProperty(key)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach(findNode);
          else if (typeof child === "object" && child && child.kind)
            findNode(child);
        }
      }
    }
    findNode(ast);
    if (targetNode) {
      // Use declared return type if present and ignore inferred types if explicitly declared
      let declaredType = targetNode.type
        ? typeof targetNode.type === "string"
          ? targetNode.type
          : targetNode.type.name || targetNode.type.raw || targetNode.type
        : undefined;
      // If the block has an explicit return type, use only that
      let useOnlyDeclared = (block as any).hasExplicitReturnType;
      let inferredTypes: string[] = [];
      if (!useOnlyDeclared) {
        inferredTypes =
          collectReturnTypesFromFunctionNode(targetNode).filter(Boolean);
      }
      let uniqueTypes: string[] = useOnlyDeclared
        ? declaredType
          ? (() => {
              let declaredTypeStr = "";
              if (typeof declaredType === "string") {
                declaredTypeStr = declaredType;
              } else if (declaredType !== undefined && declaredType !== null) {
                try {
                  declaredTypeStr = String(declaredType);
                } catch (e) {
                  declaredTypeStr = "";
                  console.warn(
                    "[PHPDocGen] [WARN] Could not convert declaredType to string:",
                    e
                  );
                }
              }
              return declaredTypeStr
                .split("|")
                .map((s: string) => s.trim())
                .filter((s: string) => !!s);
            })()
          : []
        : Array.from(new Set(inferredTypes));
      // Remove 'void' if other types exist
      if (uniqueTypes.length > 1)
        uniqueTypes = uniqueTypes.filter((t: string) => t !== "void");
      // Remove any Exception/Throwable types unless they are actually returned (not just thrown)
      uniqueTypes = uniqueTypes.filter((t: string) => {
        if (/Exception$|Error$|Throwable$/.test(t)) {
          return (
            inferredTypes &&
            inferredTypes.includes(t) &&
            ![
              "Exception",
              "Error",
              "Throwable",
              "ArithmeticError",
              "DateMalformedStringException",
            ].includes(t)
          );
        }
        return true;
      });
      // If declared type exists, merge with inferred types (union) unless explicit
      let unionType = "";
      if (declaredType) {
        if (useOnlyDeclared) {
          unionType = uniqueTypes.sort().join("|");
        } else {
          let declaredTypeStr = "";
          if (typeof declaredType === "string") {
            declaredTypeStr = declaredType;
          } else if (declaredType !== undefined && declaredType !== null) {
            try {
              declaredTypeStr = String(declaredType);
            } catch (e) {
              declaredTypeStr = "";
              console.warn(
                "[PHPDocGen] [WARN] Could not convert declaredType to string:",
                e
              );
            }
          }
          const declaredTypesArr = declaredTypeStr
            .split("|")
            .map((s: string) => s.trim())
            .filter((s: string) => !!s);
          const allTypes = Array.from(
            new Set([...declaredTypesArr, ...uniqueTypes])
          );
          unionType = allTypes.sort().join("|");
        }
      } else {
        unionType = uniqueTypes.sort().join("|");
      }
      // Never allow [object Object] or empty string
      if (!unionType || unionType === "[object Object]") {
        unionType = "void";
      }
      block.returnType = unionType || "void";
      // --- PATCH: If block.returnType is still empty or invalid, force to 'void' ---
      if (!block.returnType || block.returnType === "[object Object]") {
        block.returnType = "void";
      }
    } else {
      // --- PATCH: If no targetNode found, ensure block.returnType is at least 'void' ---
      if (!block.returnType || block.returnType === "[object Object]") {
        block.returnType = "void";
      }
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
    const throwsTags = throwsTypes.map((t: string) => `@throws ${t}`);
    const docblock = buildDocblock({
      summary: "",
      params: block.params || [],
      returnType: block.returnType,
      lines: [],
      name: block.name,
      settings: skipSettings
        ? undefined
        : settings?.map((s: string) => {
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
      otherTags: throwsTags,
      padding: padding,
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
    const existingThrows = (oldDoc.otherTags || []).filter((tag: string) =>
      tag.trim().startsWith("@throws")
    );
    const filteredThrows = existingThrows.filter((tag: string) =>
      throwsTypes.includes(tag.replace(/^@throws\s+/, "").trim())
    );
    const existingTypes = new Set(
      filteredThrows.map((tag: string) => tag.replace(/^@throws\s+/, "").trim())
    );
    const newThrows = throwsTypes
      .filter((t: string) => !existingTypes.has(t))
      .map((t: string) => `@throws ${t}`);
    const allThrows = [...filteredThrows, ...newThrows];
    const updated = {
      ...updateDocblock(oldDoc, block.params || [], block.returnType),
      name: block.name,
      settings: settings?.map((s: string) =>
        settingsDescriptions[s] ? `${s} : ${settingsDescriptions[s]}` : s
      ),
      type: block.type,
      otherTags: allThrows,
      lines: [],
      preservedTags: oldDoc.preservedTags, // <-- ensure preservedTags are passed
    };
    const newDoc = buildDocblock({ ...updated, padding });
    editBuilder.replace(docRange, newDoc.join("\n"));
  }
  // After handling class docblock, add @var docblocks for each property (fix: use correct padding for each property)
  if (block.type === "class" && block.children && block.children.length > 0) {
    for (const child of block.children) {
      if (child.type === "property" && child.name) {
        const propLine = child.startLine;
        const propType = child.returnType || "mixed";
        // Use the property's own indentation (fix for test, no extra space)
        const propPadding =
          document.lineAt(propLine).text.match(/^\s*/)?.[0] ?? "";
        const propDoc = [
          propPadding + "/**",
          propPadding + ` * @var ${propType} Property description`,
          propPadding + "*/",
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
  // Only show notification for the main block if not recursing (single-block mode)
  if (!recurse) {
    // vscode.window.showInformationMessage(
    //   `[PHPDoc Generator] Docblock generated/updated for '${block.name}' (${
    //     block.type
    //   }) at line ${block.startLine + 1}.`
    // );
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
