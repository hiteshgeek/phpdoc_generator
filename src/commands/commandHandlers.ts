import * as vscode from "vscode";
import {
  parsePHPBlocks,
  PHPBlock,
  collectReturnTypesFromFunctionNode,
} from "../phpdocParser";
import {
  buildDocblock,
  buildPropertyDocblock, // <-- import property docblock builder
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
          // Ignore commented lines
          if (
            line.startsWith("//") ||
            line.startsWith("#") ||
            line.startsWith("/*")
          ) {
            docStart--;
            docEnd--;
            continue;
          }
          if (line === "") {
            docStart--;
            docEnd--;
            continue;
          }
          if (line.startsWith("/**")) {
            hasDoc = true;
            break;
          }
          // If we hit any other non-docblock line, stop
          if (!line.startsWith("*") && !line.startsWith("//")) break;
          docStart--;
          docEnd--;
        }
        // If found, scan downwards to find the end of the docblock (*/), ignoring commented lines
        if (hasDoc) {
          docEnd = docStart;
          while (docEnd < block.startLine) {
            const line = document.lineAt(docEnd).text.trim();
            if (
              line.startsWith("//") ||
              line.startsWith("#") ||
              line.startsWith("/*")
            ) {
              docEnd++;
              continue;
            }
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
  if (found) {
    // If the found block is a property, return its parent class instead
    if (
      found.type === "property" &&
      found.parent &&
      found.parent.type === "class"
    ) {
      return found.parent;
    }
    return found;
  }

  // --- Enhanced: If cursor is in docblock above a block, return that block ---
  // Scan upwards from cursor to find docblock start
  let docStart = line;
  let foundDocStart = false;
  while (docStart >= 0) {
    const docLine = document.lineAt(docStart).text.trim();
    if (docLine.startsWith("/**")) {
      foundDocStart = true;
      break;
    }
    if (docLine === "") {
      docStart--;
      continue;
    }
    docStart--;
  }
  if (foundDocStart) {
    // Scan downwards to find docblock end (*/)
    let docEnd = docStart;
    const totalLines = document.lineCount;
    while (docEnd < totalLines) {
      const docLine = document.lineAt(docEnd).text.trim();
      if (docLine.includes("*/")) {
        break;
      }
      docEnd++;
    }
    // Now scan downwards to find the next PHP block (function/class/interface/property)
    let blockLine = docEnd + 1;
    while (blockLine < totalLines) {
      const codeLine = document.lineAt(blockLine).text.trim();
      // Skip blank lines and comments
      if (
        codeLine === "" ||
        codeLine.startsWith("//") ||
        codeLine.startsWith("#")
      ) {
        blockLine++;
        continue;
      }
      // Try to find a block that starts at this line
      function findBlockAtLine(blockList: PHPBlock[]): PHPBlock | undefined {
        for (const block of blockList) {
          if (block.startLine === blockLine) return block;
          if (block.children && block.children.length > 0) {
            const child = findBlockAtLine(block.children);
            if (child) return child;
          }
        }
        return undefined;
      }
      const block = findBlockAtLine(blocks);
      if (block) return block;
      break;
    }
  }
  // Fallback: check children recursively
  for (const block of blocks) {
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
    let funcText = document.getText(new vscode.Range(funcStart, funcEnd));
    // Remove block comments (/* ... */)
    funcText = funcText.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove line comments (// ...)
    funcText = funcText
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
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
  // Scan upwards to find the start of the docblock (/**), ignoring only non-docblock comments
  while (docStart >= 0) {
    const line = document.lineAt(docStart).text.trim();
    // Ignore single-line comments and empty lines, but NOT docblock start
    if (line.startsWith("//") || line.startsWith("#")) {
      docStart--;
      docEnd--;
      continue;
    }
    if (line === "") {
      docStart--;
      docEnd--;
      continue;
    }
    if (line.startsWith("/**")) {
      hasDoc = true;
      break;
    }
    // If we hit any other non-docblock line, stop
    if (!line.startsWith("*") && !line.startsWith("//")) break;
    docStart--;
    docEnd--;
  }
  // If found, scan downwards to find the end of the docblock (*/), ignoring commented lines
  if (hasDoc) {
    docEnd = docStart;
    while (docEnd < block.startLine) {
      const line = document.lineAt(docEnd).text.trim();
      if (
        line.startsWith("//") ||
        line.startsWith("#") ||
        line.startsWith("/*")
      ) {
        docEnd++;
        continue;
      }
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
  // Only add settings if present in non-commented code
  if (!skipSettings && block.type === "function") {
    // Re-extract uncommented function body
    const funcStart = document.lineAt(block.startLine).range.start;
    const funcEnd = document.lineAt(block.endLine).range.end;
    let funcText = document.getText(new vscode.Range(funcStart, funcEnd));
    // Remove block comments (/* ... */)
    funcText = funcText.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove line comments (// ...)
    funcText = funcText
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    const settingsMatches = [
      ...funcText.matchAll(/getSettings\(["'](.+?)["']\)/g),
    ];
    if (settingsMatches.length > 0) {
      const settingsTags = Array.from(
        new Set(settingsMatches.map((m) => m[1]))
      ).map((s) => {
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
    } else {
      delete (updatedDocblock as any).settings;
    }
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

  // --- Property docblock generation for class blocks ---
  if (block.type === "class" && block.children && block.children.length > 0) {
    for (const child of block.children) {
      if (child.type === "property") {
        generateOrReplacePropertyDocblock({
          document,
          editBuilder,
          block: child,
          lines,
        });
      }
    }
  }
}

// --- Helper: Generate and insert/replace property docblock above a property block ---
function generateOrReplacePropertyDocblock({
  document,
  editBuilder,
  block,
  lines,
}: {
  document: vscode.TextDocument;
  editBuilder: vscode.TextEditorEdit;
  block: PHPBlock;
  lines: string[];
}) {
  // Scan upwards to find the top of all consecutive docblocks/comments above the property
  let propDocStart = block.startLine - 1;
  let topDocStart = propDocStart;
  let foundAnyDoc = false;
  while (topDocStart >= 0) {
    const line = document.lineAt(topDocStart).text.trim();
    if (line === "") {
      topDocStart--;
      continue;
    }
    if (line.startsWith("/*")) {
      foundAnyDoc = true;
      let commentBlockStart = topDocStart;
      while (commentBlockStart > 0) {
        const prevLine = document.lineAt(commentBlockStart - 1).text.trim();
        if (prevLine.startsWith("/*")) {
          commentBlockStart--;
        } else {
          break;
        }
      }
      topDocStart = commentBlockStart;
      break;
    }
    if (line.startsWith("/**")) {
      foundAnyDoc = true;
      let docblockStart = topDocStart;
      while (docblockStart > 0) {
        const prevLine = document.lineAt(docblockStart - 1).text.trim();
        if (prevLine.startsWith("/**")) {
          docblockStart--;
        } else {
          break;
        }
      }
      topDocStart = docblockStart;
      break;
    }
    if (
      !line.startsWith("*") &&
      !line.startsWith("//") &&
      !line.startsWith("#")
    ) {
      break;
    }
    topDocStart--;
  }
  // Now scan down from topDocStart to just before the property line to find the end of the last docblock/comment
  let docEnd = topDocStart;
  while (docEnd < block.startLine) {
    const line = document.lineAt(docEnd).text;
    if (line.includes("*/")) {
      docEnd++;
      continue;
    }
    if (line.trim() === "") {
      docEnd++;
      continue;
    }
    const trimmed = line.trim();
    if (
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("/*") &&
      !trimmed.startsWith("/**")
    ) {
      break;
    }
    docEnd++;
  }
  const propPadding = lines[block.startLine].match(/^[\s]*/)?.[0] ?? "";
  const propDocblock = buildPropertyDocblock({
    name: block.name,
    type: block.returnType,
    padding: propPadding,
  });
  let docblockLines = [...propDocblock];
  // Remove any summary/property name line (should only be @var)
  docblockLines = docblockLines.filter(
    (l) =>
      l.includes("@var ") ||
      l.trim() === "/**" ||
      l.trim() === "*/" ||
      l.trim().startsWith("* @var")
  );
  const varLineIdx = docblockLines.findIndex((l) => l.includes("@var "));
  if (varLineIdx !== -1) {
    docblockLines[varLineIdx] = `${propPadding} * @var ${
      block.returnType || "mixed"
    }`;
  }
  while (docblockLines.length > 0 && docblockLines[0].trim() === "")
    docblockLines.shift();
  while (
    docblockLines.length > 0 &&
    docblockLines[docblockLines.length - 1].trim() === ""
  )
    docblockLines.pop();
  let insertText = docblockLines.join("\n") + "\n";
  // Do NOT add a blank line after the docblock
  if (foundAnyDoc && topDocStart < block.startLine) {
    // Replace the entire region from topDocStart to block.startLine
    const docRange = new vscode.Range(
      new vscode.Position(topDocStart, 0),
      new vscode.Position(block.startLine, 0)
    );
    editBuilder.replace(docRange, insertText);
  } else {
    // No docblock found, just insert above property
    editBuilder.insert(new vscode.Position(block.startLine, 0), insertText);
  }
  // Ensure a blank line after the property line
  const propertyLineIdx = block.startLine;
  const nextLineIdx = propertyLineIdx + 1;
  if (nextLineIdx >= lines.length || lines[nextLineIdx].trim() !== "") {
    editBuilder.insert(new vscode.Position(propertyLineIdx + 1, 0), "\n");
  }
}
