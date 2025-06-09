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
          docEnd--;
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
        docEnd--;
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
  const lines = document.getText().split("\n");
  const padding = lines[block.startLine].match(/^[\s]*/)?.[0] ?? "";

  // --- Return Type Inference if not explicitly provided ---
  let returnType = block.returnType;
  if (block.type === "function" && (!returnType || returnType === "void")) {
    // Try to infer from return statements in the function body
    const funcStart = document.lineAt(block.startLine).range.start;
    const funcEnd = document.lineAt(block.endLine).range.end;
    const funcText = document.getText(new vscode.Range(funcStart, funcEnd));
    const returnMatches = [...funcText.matchAll(/return\s+([^;]+);/g)].map(
      (m) => m[1].trim()
    );
    if (returnMatches.length === 0) {
      returnType = "void";
    } else {
      const types = new Set();
      for (const ret of returnMatches) {
        if (/^\[.*\]$/.test(ret)) types.add("array");
        else if (/^true|false$/.test(ret)) types.add("bool");
        else if (/^-?\d+\.\d+$/.test(ret)) types.add("float");
        else if (/^-?\d+$/.test(ret)) types.add("int");
        else if (/^".*"|'.*'$/.test(ret)) types.add("string");
        else {
          const newClassMatch = ret.match(/^new\s+([A-Za-z_][A-Za-z0-9_]*)/);
          if (newClassMatch) types.add(newClassMatch[1]);
          else types.add("mixed");
        }
      }
      returnType = types.size > 0 ? Array.from(types).join("|") : "mixed";
    }
    block.returnType = returnType; // <-- always set on block
  }

  // --- Docblock region detection ---
  let docStart = block.startLine - 1;
  let hasDoc = false;
  let docEnd = docStart;
  // Scan upwards to find the start of the docblock (/**)
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
    docEnd--;
  }
  // If found, scan downwards to find the end of the docblock (*/)
  if (hasDoc) {
    docEnd = docStart;
    while (docEnd < block.startLine) {
      if (document.lineAt(docEnd).text.includes("*/")) break;
      docEnd++;
    }
  }

  // Parse existing docblock if present
  let parsedDocblock: any = { params: [], otherTags: [] };
  if (hasDoc) {
    const docRange = new vscode.Range(
      new vscode.Position(docStart, 0),
      new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
    );
    const docLines = document.getText(docRange).split("\n");
    parsedDocblock = parseDocblock(docLines);
  }
  let updatedDocblock = { ...parsedDocblock };

  // --- Update name ---
  (updatedDocblock as any).name = block.name;

  // --- Update type ---
  (updatedDocblock as any).type = block.type;

  // --- Update settings ---
  if (!skipSettings && block.type === "function" && (block as any).settings) {
    const settingsTags = (block as any).settings.map((s: string) => {
      const desc = settingsDescriptions[s];
      if (desc && desc.trim() && desc.trim() !== s) {
        return `${s} : ${desc}`;
      } else if (desc && desc.trim()) {
        return `${s} : ${desc}`;
      } else {
        return `${s}`;
      }
    });
    (updatedDocblock as any).settings = settingsTags;
  }

  // --- Update return type ---
  updatedDocblock.returnType = returnType || "mixed";

  // --- Update params ---
  if (block.params) {
    const newParams = block.params.map((param) => {
      const paramName = param.name;
      const paramType = param.type;
      const paramDesc = (param as any).desc;
      // Check if the parameter already exists in the docblock
      const existingParam = parsedDocblock.params?.find(
        (p: any) => p.name === paramName
      );
      if (existingParam) {
        // Update existing parameter
        return {
          ...existingParam,
          type: paramType || existingParam.type,
          desc: paramDesc || (existingParam as any).desc,
        };
      } else {
        // New parameter
        return {
          name: paramName,
          type: paramType,
          desc: paramDesc,
        };
      }
    });
    updatedDocblock.params = newParams;
  }

  // --- Update other tags (e.g., @throws) ---
  if (parsedDocblock.otherTags) {
    updatedDocblock.otherTags = parsedDocblock.otherTags.filter(
      (tag: string) => !tag.trim().startsWith("@throws")
    );
  }
  // If you want to add throws tags, you must collect them above and add here
  // (no block.throws property exists on PHPBlock)
  if (
    (block as any)._inferredThrows &&
    Array.isArray((block as any)._inferredThrows) &&
    (block as any)._inferredThrows.length > 0
  ) {
    const throwsTags = (block as any)._inferredThrows.map(
      (t: string) => `@throws ${t}`
    );
    if (!updatedDocblock.otherTags) updatedDocblock.otherTags = [];
    updatedDocblock.otherTags.push(...throwsTags);
  }

  // Build new docblock lines
  const newDocblockLines = buildDocblock({
    ...updatedDocblock,
    padding,
  });

  // Replace or insert docblock
  if (hasDoc) {
    // Replace only the docblock region
    const docRange = new vscode.Range(
      new vscode.Position(docStart, 0),
      new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
    );
    editBuilder.replace(docRange, newDocblockLines.join("\n"));
  } else {
    // Insert new docblock immediately above the function
    editBuilder.insert(
      new vscode.Position(block.startLine, 0),
      newDocblockLines.join("\n") + "\n"
    );
  }

  // Recursively process child blocks (for classes/interfaces)
  if (recurse && block.children && block.children.length > 0) {
    for (const child of block.children) {
      await generateDocblocksRecursive({
        document,
        editBuilder,
        block: child,
        settingsDescriptions,
        skipSettings,
        recurse,
      });
    }
  }
}
