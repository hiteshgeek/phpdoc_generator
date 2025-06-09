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
  // If the block is a property, do nothing (property docblocks are only generated as part of class docblock generation)
  if (block.type === "property") {
    vscode.window.showInformationMessage(
      "Property docblocks are only generated as part of class docblock generation. Please run the command on the containing class."
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
        if (/^intval\(/.test(ret)) types.add("int");
        else if (/^floatval\(/.test(ret)) types.add("float");
        else if (/^strval\(/.test(ret)) types.add("string");
        else if (/^boolval\(/.test(ret)) types.add("bool");
        else if (/^arrayval\(/.test(ret)) types.add("array");
        else if (/^\[.*\]$/.test(ret)) types.add("array");
        else if (/^true|false$/.test(ret)) types.add("bool");
        else if (/^-?\d+\.\d+$/.test(ret)) types.add("float");
        else if (/^-?\d+$/.test(ret)) types.add("int");
        else if (/^".*"|'.*'$/.test(ret)) types.add("string");
        else {
          // Correct regex for new class instantiation
          const newClassMatch = ret.match(/^new\s+([A-Za-z_][A-Za-z0-9_]*)/);
          if (newClassMatch) types.add(newClassMatch[1]);
          else types.add("mixed");
        }
      }
      returnType = types.size > 0 ? Array.from(types).join("|") : "mixed";
    }
  }

  // --- Settings Inference ---
  let settings: string[] | undefined = undefined;
  // Only search for settings if not skipping and DB config is complete
  if (
    block.type === "function" &&
    !skipSettings &&
    isDBConfigComplete(getDBConfigFromVSCode())
  ) {
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
      settings = Array.from(new Set(settingsMatches.map((m) => m[1])));
    }
  }

  // --- Docblock Generation ---
  let docblock: string[] = [];
  if (block.type === "function") {
    // Only include settings if DB config is complete and settings is defined
    let docblockSettings: string[] | undefined = undefined;
    if (
      settings &&
      settings.length > 0 &&
      isDBConfigComplete(getDBConfigFromVSCode())
    ) {
      docblockSettings = settings.map((s: string) => {
        const desc = settingsDescriptions[s];
        if (desc && desc.trim() && desc.trim() !== s) {
          return `${s} : ${desc}`;
        } else if (desc && desc.trim()) {
          return `${s} : ${desc}`;
        } else {
          return `${s}`;
        }
      });
    }
    docblock = buildDocblock({
      summary: "",
      params: block.params || [],
      returnType: returnType,
      lines: [],
      name: block.name,
      settings: docblockSettings,
      type: block.type,
      otherTags: [],
      padding: padding,
    });
  } else if (block.type === "property") {
    // For properties, generate a docblock with @var and type if available
    docblock = [
      padding + "/**",
      padding + " * @var " + (block.returnType || "mixed"),
      padding + " */",
    ];
  } else if (
    block.type === "class" ||
    block.type === "interface" ||
    block.type === "trait"
  ) {
    // --- Generate all property docblocks at once and insert them together above the first property ---
    if (block.children && block.children.length > 0) {
      const properties = block.children.filter(
        (child) => child.type === "property"
      );
      if (properties.length > 0) {
        // Remove all existing docblocks/comments and blank lines above each property before inserting new docblock
        const propertyEdits: { start: number; end: number; text: string }[] =
          [];
        for (const [i, prop] of properties.entries()) {
          const propLine = document.lineAt(prop.startLine).text;
          const pad = propLine.match(/^\s*/)?.[0] ?? "";
          // For the first property, remove ALL blank lines and comments between the opening brace and the property
          let docStart = prop.startLine - 1;
          let topDocStart = docStart;
          if (i === 0) {
            // Remove all blank lines and comments after the class opening brace
            while (topDocStart >= 0) {
              const line = document.lineAt(topDocStart).text.trim();
              if (
                line === "" ||
                line.startsWith("/**") ||
                line.startsWith("*") ||
                line.startsWith("//") ||
                line.startsWith("#") ||
                line.startsWith("/*")
              ) {
                topDocStart--;
                continue;
              }
              break;
            }
            // Ensure we don't remove the class opening brace
            if (topDocStart < block.startLine) topDocStart = block.startLine;
          } else {
            // For other properties, remove only docblocks/comments/blank lines above the property
            while (topDocStart >= 0) {
              const line = document.lineAt(topDocStart).text.trim();
              if (line.startsWith("/**") || line.startsWith("*")) {
                topDocStart--;
                continue;
              }
              if (
                line === "" ||
                line.startsWith("//") ||
                line.startsWith("#") ||
                line.startsWith("/*")
              ) {
                topDocStart--;
                continue;
              }
              break;
            }
          }
          let scan = topDocStart + 1;
          while (scan < prop.startLine) {
            const line = document.lineAt(scan).text.trim();
            if (
              line === "" ||
              line.startsWith("/**") ||
              line.startsWith("*") ||
              line.startsWith("//") ||
              line.startsWith("#") ||
              line.startsWith("/*")
            ) {
              scan++;
              continue;
            }
            break;
          }
          let insertLine = topDocStart + 1;
          let replaceEnd = scan;
          let firstNonBlank = replaceEnd;
          while (
            firstNonBlank < prop.startLine &&
            document.lineAt(firstNonBlank).text.trim() === ""
          ) {
            firstNonBlank++;
          }
          const replaceRange = new vscode.Range(
            new vscode.Position(insertLine, 0),
            new vscode.Position(firstNonBlank, 0)
          );
          // Insert exactly one empty line before the docblock, except for the first property (no empty line)
          const docblock = [
            (i === 0 ? "" : "\n") + pad + "/**",
            pad + ` * @var ${prop.returnType || "mixed"}`,
            pad + " */",
          ].join("\n");
          propertyEdits.push({
            start: insertLine,
            end: firstNonBlank,
            text: docblock + "\n",
          });
        }
        // Apply property edits in reverse order to avoid line shifting
        for (let i = propertyEdits.length - 1; i >= 0; i--) {
          const edit = propertyEdits[i];
          const replaceRange = new vscode.Range(
            new vscode.Position(edit.start, 0),
            new vscode.Position(edit.end, 0)
          );
          editBuilder.replace(replaceRange, edit.text);
        }
      }
    }
    // Insert the class docblock as before
    docblock = buildDocblock({
      summary: "",
      params: [],
      returnType: undefined,
      lines: [],
      name: block.name,
      type: block.type,
      padding: padding,
    });
    // Insert class docblock above the class
    let docStart = block.startLine - 1;
    let topDocStart = docStart;
    let foundAnyDoc = false;
    while (topDocStart >= 0) {
      const line = document.lineAt(topDocStart).text.trim();
      if (line.startsWith("/**") || line.startsWith("*")) {
        foundAnyDoc = true;
        topDocStart--;
        continue;
      }
      if (
        line === "" ||
        line.startsWith("//") ||
        line.startsWith("#") ||
        line.startsWith("/*")
      ) {
        topDocStart--;
        continue;
      }
      break;
    }
    let scan = topDocStart + 1;
    while (scan < block.startLine) {
      const line = document.lineAt(scan).text.trim();
      if (
        line === "" ||
        line.startsWith("/**") ||
        line.startsWith("*") ||
        line.startsWith("//") ||
        line.startsWith("#") ||
        line.startsWith("/*")
      ) {
        scan++;
        continue;
      }
      break;
    }
    let insertLine = topDocStart + 1;
    let replaceEnd = scan;
    let firstNonBlank = replaceEnd;
    while (
      firstNonBlank < block.startLine &&
      document.lineAt(firstNonBlank).text.trim() === ""
    ) {
      firstNonBlank++;
    }
    const classReplaceRange = new vscode.Range(
      new vscode.Position(insertLine, 0),
      new vscode.Position(firstNonBlank, 0)
    );
    editBuilder.replace(classReplaceRange, "\n" + docblock.join("\n") + "\n");
    return;
  }

  // --- Remove ALL docblocks/comments above the block before inserting new docblock ---
  let docStart = block.startLine - 1;
  let topDocStart = docStart;
  let foundAnyDoc = false;
  let lastDocEnd = block.startLine; // will be set to the line after the last docblock/comment
  while (topDocStart >= 0) {
    const line = document.lineAt(topDocStart).text.trim();
    if (line.startsWith("/**") || line.startsWith("*")) {
      foundAnyDoc = true;
      topDocStart--;
      continue;
    }
    if (
      line === "" ||
      line.startsWith("//") ||
      line.startsWith("#") ||
      line.startsWith("/*")
    ) {
      topDocStart--;
      continue;
    }
    break;
  }
  // Now, scan down from topDocStart+1 to block.startLine to find the first non-docblock/comment/blank line (to handle stacked docblocks)
  let scan = topDocStart + 1;
  while (scan < block.startLine) {
    const line = document.lineAt(scan).text.trim();
    if (
      line === "" ||
      line.startsWith("/**") ||
      line.startsWith("*") ||
      line.startsWith("//") ||
      line.startsWith("#") ||
      line.startsWith("/*")
    ) {
      scan++;
      continue;
    }
    break;
  }
  let insertLine = topDocStart + 1;
  let replaceEnd = scan;
  // --- Ensure exactly one empty line between docblock and function ---
  // Scan down from replaceEnd to block.startLine for blank lines
  let firstNonBlank = replaceEnd;
  while (
    firstNonBlank < block.startLine &&
    document.lineAt(firstNonBlank).text.trim() === ""
  ) {
    firstNonBlank++;
  }
  // The range to replace is from insertLine to firstNonBlank (exclusive)
  const replaceRange = new vscode.Range(
    new vscode.Position(insertLine, 0),
    new vscode.Position(firstNonBlank, 0)
  );
  // For functions: Insert docblock with NO empty line before it, and no extra blank lines after docblock
  // For properties: Insert exactly one empty line before the docblock (except first property, which has none)
  if (block.type === "function") {
    editBuilder.replace(replaceRange, docblock.join("\n") + "\n");
  } else if (block.type === "property") {
    // Determine if this is the first property in its class
    let isFirstProperty = false;
    if (block.parent && block.parent.children) {
      const properties = block.parent.children.filter(
        (c) => c.type === "property"
      );
      isFirstProperty = properties.length > 0 && properties[0] === block;
    }
    const docblockText =
      (isFirstProperty ? "" : "\n") + docblock.join("\n") + "\n";
    editBuilder.replace(replaceRange, docblockText);
  } else {
    // Default: insert with one empty line before
    editBuilder.replace(replaceRange, "\n" + docblock.join("\n") + "\n");
  }

  // --- Recurse into children blocks ---
  if (recurse && block.children && block.children.length > 0) {
    for (const child of block.children) {
      // If the child is a property, always generate its docblock (with deduplication/spacing)
      if (child.type === "property") {
        await generateDocblocksRecursive({
          document,
          editBuilder,
          block: child,
          settingsDescriptions,
          skipSettings,
          recurse: false, // don't recurse into property children
        });
      } else {
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
}
