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
  console.log("[PHPDoc] generatePHPDoc command triggered");
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
  console.log(`[PHPDoc] Cursor at line: ${pos.line}`);
  // Use the improved block finder
  const block = findBlockForCursor(blocks, pos.line, document);
  if (!block) {
    console.log("[PHPDoc] No block found for cursor");
    vscode.window.showInformationMessage(
      "Cursor must be inside a PHP function, class, interface, or its docblock."
    );
    return;
  }
  console.log(
    `[PHPDoc] Targeting block: ${block.type} '${block.name}' at lines ${block.startLine}-${block.endLine}`
  );
  // Check if cursor is in docblock
  let inDocblock = false;
  let line = pos.line;
  while (line >= 0) {
    const docLine = document.lineAt(line).text.trim();
    if (docLine.startsWith("/**")) {
      inDocblock = true;
      break;
    }
    line--;
  }
  if (inDocblock) {
    console.log(`[PHPDoc] Cursor is in docblock above block '${block.name}'`);
  } else {
    console.log(`[PHPDoc] Cursor is in code of block '${block.name}'`);
  }
  // If the block is a property, do nothing (property docblocks are only generated as part of class docblock generation)
  if (block.type === "property") {
    vscode.window.showInformationMessage(
      "Property docblocks are only generated as part of class docblock generation. Please run the command on the containing class."
    );
    return;
  }
  // --- Settings collection logic (same as before) ---
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
  // --- Docblock update logic for a single block (mirrors generatePHPDocForFile) ---
  const lines = document.getText().split("\n");
  const padding = lines[block.startLine].match(/^[\s]*/)?.[0] ?? "";
  let oldDoc: import("../phpdocDocblock").DocblockInfo = {
    summary: "",
    params: [],
    returnType: undefined,
    returnDesc: undefined,
    lines: [],
    settings: undefined,
    otherTags: [],
    preservedTags: [],
  };
  let docblock: string[] = [];
  // --- Extract and parse existing docblock (if any) ---
  let docStartForBlock = block.startLine - 1;
  let docEndForBlock = docStartForBlock;
  let hasDocForBlock = false;
  while (docStartForBlock >= 0) {
    const line = document.lineAt(docStartForBlock).text.trim();
    if (line.startsWith("/**")) {
      hasDocForBlock = true;
      break;
    }
    if (!line.startsWith("*") && !line.startsWith("//")) break;
    docStartForBlock--;
    docEndForBlock--;
  }
  if (hasDocForBlock) {
    docEndForBlock = docStartForBlock;
    while (docEndForBlock < block.startLine) {
      const line = document.lineAt(docEndForBlock).text.trim();
      if (
        line.startsWith("//") ||
        line.startsWith("#") ||
        line.startsWith("/*")
      ) {
        docEndForBlock++;
        continue;
      }
      if (line.includes("*/")) break;
      docEndForBlock++;
    }
  }
  if (hasDocForBlock) {
    const docblockLines = [];
    for (let i = docStartForBlock; i <= docEndForBlock; i++) {
      docblockLines.push(document.lineAt(i).text);
    }
    oldDoc = parseDocblock(docblockLines);
  }
  if (block.type === "function") {
    // --- Unify return type inference with block-level logic ---
    let inferredReturnType = block.returnType;
    if (!inferredReturnType || inferredReturnType === "void") {
      // Try to infer from return statements in the function body
      const funcStart = document.lineAt(block.startLine).range.start;
      const funcEnd = document.lineAt(block.endLine).range.end;
      let funcText = document.getText(new vscode.Range(funcStart, funcEnd));
      funcText = funcText.replace(/\/\*[\s\S]*?\*\//g, "");
      funcText = funcText
        .split("\n")
        .map((line) => line.replace(/\/\/.*$/, ""))
        .join("\n");
      const returnMatches = [...funcText.matchAll(/return\s+([^;]+);/g)].map(
        (m) => m[1].trim()
      );
      if (returnMatches.length === 0) {
        inferredReturnType = "void";
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
            const newClassMatch = ret.match(/^new\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (newClassMatch) types.add(newClassMatch[1]);
            else types.add("mixed");
          }
        }
        inferredReturnType =
          types.size > 0 ? Array.from(types).join("|") : "mixed";
      }
    }
    // --- Collect settings for this block only, excluding children ---
    let blockSettings: string[] = [];
    // Get all child block line ranges
    const childRanges = (block.children || []).map((child) => [
      child.startLine,
      child.endLine,
    ]);
    const funcLines: string[] = [];
    for (let i = block.startLine; i <= block.endLine; i++) {
      // Skip lines that are inside any child block
      if (childRanges.some(([start, end]) => i >= start && i <= end)) continue;
      funcLines.push(document.lineAt(i).text);
    }
    const funcTextForSettings = funcLines.join("\n");
    const uncommented = funcTextForSettings
      .replace(/\/\*.*?\*\//gs, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const settingsMatches = [
      ...uncommented.matchAll(/getSettings\(["'](.+?)["']\)/g),
    ];
    if (settingsMatches.length > 0) {
      blockSettings = Array.from(new Set(settingsMatches.map((m) => m[1])));
    }
    const updated = {
      ...updateDocblock(oldDoc, block.params || [], inferredReturnType),
      name: block.name,
      type: block.type,
      lines: [],
      preservedTags: oldDoc.preservedTags,
      otherTags: oldDoc.otherTags,
      settings: blockSettings.length > 0 ? blockSettings : undefined,
      settingsDescriptions,
    };
    docblock = buildDocblock({ ...updated, padding });
  } else if (
    block.type === "class" ||
    block.type === "interface" ||
    block.type === "trait"
  ) {
    const updated = {
      ...updateDocblock(oldDoc, [], undefined),
      name: block.name,
      type: block.type,
      lines: [],
      preservedTags: oldDoc.preservedTags,
      otherTags: oldDoc.otherTags,
    };
    docblock = buildDocblock({ ...updated, padding });
    // REMOVE: Do not generate docblocks for children here. Only process each block in the flattened list once.
  } else if (block.type === "property") {
    docblock = buildPropertyDocblock({
      name: block.name,
      type: block.returnType,
      padding,
    });
  }
  // Insert or replace docblock immediately
  let replaceStart = block.startLine - 1;
  while (replaceStart > 0 && lines[replaceStart - 1].trim() === "") {
    replaceStart--;
  }
  let replaceEnd = block.startLine;
  while (replaceEnd < lines.length && lines[replaceEnd].trim() === "") {
    replaceEnd++;
  }
  const range = new vscode.Range(
    new vscode.Position(replaceStart, 0),
    new vscode.Position(replaceEnd, 0)
  );
  await editor.edit((editBuilder: vscode.TextEditorEdit) => {
    editBuilder.replace(range, docblock.join("\n") + "\n");
  });
}

export async function generatePHPDocForFile() {
  const editor = vscode.window.activeTextEditor;
  console.log("[PHPDoc] generatePHPDocForFile called");
  if (!editor || editor.document.languageId !== "php") {
    console.log("[PHPDoc] No active PHP editor");
    return;
  }
  const { document } = editor;
  const text = document.getText();
  const blocks = parsePHPBlocks(text);
  console.log(`[PHPDoc] Parsed blocks: count = ${blocks.length}`);
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
  // --- Collect all edits first ---
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
  console.log(`[PHPDoc] Flattened blocks: count = ${allBlocks.length}`);
  allBlocks.sort((a, b) => b.startLine - a.startLine);
  const visited = new Set<string>();
  // Prepare all edits first
  const edits: { range: vscode.Range; text: string }[] = [];
  for (const block of allBlocks) {
    const blockKey = `${block.type}:${block.startLine}`;
    if (visited.has(blockKey)) continue;
    visited.add(blockKey);
    const lines = document.getText().split("\n");
    const padding = lines[block.startLine].match(/^[\s]*/)?.[0] ?? "";
    let oldDoc: import("../phpdocDocblock").DocblockInfo = {
      summary: "",
      params: [],
      returnType: undefined,
      returnDesc: undefined,
      lines: [],
      settings: undefined,
      otherTags: [],
      preservedTags: [],
    };
    let docblock: string[] = [];
    // --- Extract and parse existing docblock (if any) ---
    let docStartForBlock = block.startLine - 1;
    let docEndForBlock = docStartForBlock;
    let hasDocForBlock = false;
    while (docStartForBlock >= 0) {
      const line = document.lineAt(docStartForBlock).text.trim();
      if (line.startsWith("/**")) {
        hasDocForBlock = true;
        break;
      }
      if (!line.startsWith("*") && !line.startsWith("//")) break;
      docStartForBlock--;
      docEndForBlock--;
    }
    if (hasDocForBlock) {
      docEndForBlock = docStartForBlock;
      while (docEndForBlock < block.startLine) {
        const line = document.lineAt(docEndForBlock).text.trim();
        if (
          line.startsWith("//") ||
          line.startsWith("#") ||
          line.startsWith("/*")
        ) {
          docEndForBlock++;
          continue;
        }
        if (line.includes("*/")) break;
        docEndForBlock++;
      }
    }
    if (hasDocForBlock) {
      const docblockLines = [];
      for (let i = docStartForBlock; i <= docEndForBlock; i++) {
        docblockLines.push(document.lineAt(i).text);
      }
      oldDoc = parseDocblock(docblockLines);
    }

    if (block.type === "function") {
      // --- Unify return type inference with block-level logic ---
      let inferredReturnType = block.returnType;
      if (!inferredReturnType || inferredReturnType === "void") {
        // Try to infer from return statements in the function body
        const funcStart = document.lineAt(block.startLine).range.start;
        const funcEnd = document.lineAt(block.endLine).range.end;
        let funcText = document.getText(new vscode.Range(funcStart, funcEnd));
        funcText = funcText.replace(/\/\*[\s\S]*?\*\//g, "");
        funcText = funcText
          .split("\n")
          .map((line) => line.replace(/\/\/.*$/, ""))
          .join("\n");
        const returnMatches = [...funcText.matchAll(/return\s+([^;]+);/g)].map(
          (m) => m[1].trim()
        );
        if (returnMatches.length === 0) {
          inferredReturnType = "void";
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
              const newClassMatch = ret.match(/^new\s+([A-Za-z_][A-ZaZ0-9_]*)/);
              if (newClassMatch) types.add(newClassMatch[1]);
              else types.add("mixed");
            }
          }
          inferredReturnType =
            types.size > 0 ? Array.from(types).join("|") : "mixed";
        }
      }
      // --- Collect settings for this block only, excluding children ---
      let blockSettings: string[] = [];
      // Get all child block line ranges
      const childRanges = (block.children || []).map((child) => [
        child.startLine,
        child.endLine,
      ]);
      const funcLines: string[] = [];
      for (let i = block.startLine; i <= block.endLine; i++) {
        // Skip lines that are inside any child block
        if (childRanges.some(([start, end]) => i >= start && i <= end))
          continue;
        funcLines.push(document.lineAt(i).text);
      }
      const funcTextForSettings = funcLines.join("\n");
      const uncommented = funcTextForSettings
        .replace(/\/\*.*?\*\//gs, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      const settingsMatches = [
        ...uncommented.matchAll(/getSettings\(["'](.+?)["']\)/g),
      ];
      if (settingsMatches.length > 0) {
        blockSettings = Array.from(new Set(settingsMatches.map((m) => m[1])));
      }
      const updated = {
        ...updateDocblock(oldDoc, block.params || [], inferredReturnType),
        name: block.name,
        type: block.type,
        lines: [],
        preservedTags: oldDoc.preservedTags,
        otherTags: oldDoc.otherTags,
        settings: blockSettings.length > 0 ? blockSettings : undefined,
        settingsDescriptions,
      };
      docblock = buildDocblock({ ...updated, padding });
    } else if (
      block.type === "class" ||
      block.type === "interface" ||
      block.type === "trait"
    ) {
      const updated = {
        ...updateDocblock(oldDoc, [], undefined),
        name: block.name,
        type: block.type,
        lines: [],
        preservedTags: oldDoc.preservedTags,
        otherTags: oldDoc.otherTags,
      };
      docblock = buildDocblock({ ...updated, padding });
      // REMOVE: Do not generate docblocks for children here. Only process each block in the flattened list once.
    } else if (block.type === "property") {
      docblock = buildPropertyDocblock({
        name: block.name,
        type: block.returnType,
        padding,
      });
    }
    // Find where to insert/replace docblock
    let docStartForFile = block.startLine - 1;
    let topDocStartForFile = docStartForFile;
    let foundDocblock = false;
    while (topDocStartForFile >= 0) {
      const line = document.lineAt(topDocStartForFile).text.trim();
      if (line.startsWith("/**")) {
        foundDocblock = true;
        break;
      }
      if (
        line.startsWith("*") ||
        line === "" ||
        line.startsWith("//") ||
        line.startsWith("#") ||
        line.startsWith("/*")
      ) {
        topDocStartForFile--;
        continue;
      }
      break;
    }
    let scanForFile = topDocStartForFile + 1;
    while (scanForFile < block.startLine) {
      const line = document.lineAt(scanForFile).text.trim();
      if (
        line === "" ||
        line.startsWith("/**") ||
        line.startsWith("*") ||
        line.startsWith("//") ||
        line.startsWith("#") ||
        line.startsWith("/*")
      ) {
        scanForFile++;
        continue;
      }
      break;
    }
    let insertLineForFile = topDocStartForFile + 1;
    let firstNonBlankForFile = scanForFile;
    while (
      firstNonBlankForFile < block.startLine &&
      document.lineAt(firstNonBlankForFile).text.trim() === ""
    ) {
      firstNonBlankForFile++;
    }
    // --- Ensure exactly one empty line before docblock unless previous non-blank line is '{' or '<?php' ---
    let replaceStart = foundDocblock ? topDocStartForFile : block.startLine;
    while (
      replaceStart > 0 &&
      document.lineAt(replaceStart - 1).text.trim() === ""
    ) {
      replaceStart--;
    }
    let replaceEnd = block.startLine;
    while (
      replaceEnd < document.lineCount &&
      document.lineAt(replaceEnd).text.trim() === ""
    ) {
      replaceEnd++;
    }
    let lineAboveIdx = replaceStart - 1;
    let lineAboveText =
      lineAboveIdx >= 0 ? document.lineAt(lineAboveIdx).text.trim() : "";
    let insertTextForFile = docblock.join("\n") + "\n";
    if (
      (lineAboveText === "<?php" ||
        replaceStart === 0 ||
        (lineAboveText !== "" && lineAboveText !== "{")) &&
      !insertTextForFile.startsWith("\n")
    ) {
      insertTextForFile = "\n" + insertTextForFile;
    }
    const replaceRangeForFile = new vscode.Range(
      new vscode.Position(replaceStart, 0),
      new vscode.Position(foundDocblock ? firstNonBlankForFile : replaceEnd, 0)
    );
    edits.push({ range: replaceRangeForFile, text: insertTextForFile });
  }
  // Apply all edits in a single editor.edit call, bottom to top
  edits.sort((a, b) => b.range.start.line - a.range.start.line);
  await editor.edit((editBuilder: vscode.TextEditorEdit) => {
    for (const edit of edits) {
      editBuilder.replace(edit.range, edit.text);
    }
  });
}

export async function generatePHPDocForProject() {
  const config = vscode.workspace.getConfiguration("phpdocGenerator");
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
      let settings: string[] = [];
      let throwsTypes: string[] = [];
      let settingsDescriptions: Record<string, string> = {};
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
        const throwMatches = [
          ...uncommented.matchAll(/throw\s+new\s+([\w\\]+)/g),
        ];
        throwsTypes = Array.from(
          new Set(throwMatches.map((m: RegExpMatchArray) => m[1]))
        );
      }
      // Use a unique variable name for docStart in this scope
      let docStartForProject = block.startLine - 1;
      let hasDoc = false;
      let docEndForProject = docStartForProject;
      // Get indentation for the block's own start line
      const lineText = document.lineAt(block.startLine).text;
      const padding = lineText.match(/^[\s]*/)?.[0] ?? "";
      while (docStartForProject >= 0) {
        const line = document.lineAt(docStartForProject).text.trim();
        // Ignore commented lines
        if (
          line.startsWith("//") ||
          line.startsWith("#") ||
          line.startsWith("/*")
        ) {
          docStartForProject--;
          docEndForProject--;
          continue;
        }
        if (line === "") {
          docStartForProject--;
          docEndForProject--;
          continue;
        }
        if (line.startsWith("/**")) {
          hasDoc = true;
          break;
        }
        // If we hit any other non-docblock line, stop
        if (!line.startsWith("*") && !line.startsWith("//")) break;
        docStartForProject--;
        docEndForProject--;
      }
      // If found, scan downwards to find the end of the docblock (*/), ignoring commented lines
      if (hasDoc) {
        docEndForProject = docStartForProject;
        while (docEndForProject < block.startLine) {
          const line = document.lineAt(docEndForProject).text.trim();
          if (
            line.startsWith("//") ||
            line.startsWith("#") ||
            line.startsWith("/*")
          ) {
            docEndForProject++;
            continue;
          }
          if (document.lineAt(docEndForProject).text.includes("*/")) break;
          docEndForProject++;
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
          settings: settings.map((s: string) => {
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
        // Use a workspace edit to apply changes
        const edit = new vscode.WorkspaceEdit();
        edit.insert(
          document.uri,
          new vscode.Position(block.startLine, 0),
          docblock.join("\n") + "\n"
        );
        await vscode.workspace.applyEdit(edit);
      } else {
        const throwsTags = throwsTypes.map((t: string) => `@throws ${t}`);
        const docRange = new vscode.Range(
          new vscode.Position(docStartForProject, 0),
          new vscode.Position(
            docEndForProject,
            document.lineAt(docEndForProject).text.length
          )
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
          settings: settings.map((s: string) =>
            settingsDescriptions[s] ? `${s} : ${settingsDescriptions[s]}` : s
          ),
          type: block.type,
          otherTags: allThrows,
          lines: [],
          preservedTags: oldDoc.preservedTags, // <-- ensure preservedTags are passed
        };
        const newDoc = buildDocblock({ ...updated, padding });
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, docRange, newDoc.join("\n"));
        await vscode.workspace.applyEdit(edit);
      }
    }
  }
  // Remove notification for project-level docblock generation
  // vscode.window.showInformationMessage(
  //   "PHPDoc generated for all PHP files in the project."
  // );
}

export async function refreshSettingsCacheForAll() {
  const cachePath = path.resolve(__dirname, "../settings_cache.json");
  const config = vscode.workspace.getConfiguration("phpdocGenerator");
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
  // --- Enhanced: If cursor is in docblock above a block, return the innermost block at the next code line ---
  // Scan upwards from cursor to find docblock start
  let docStart = line;
  let foundDocStart = false;
  while (docStart >= 0) {
    const docLine = document.lineAt(docStart).text.trim();
    if (docLine.startsWith("/**")) {
      foundDocStart = true;
      break;
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
    // Now scan downwards to find the next code line (skip blank lines and comments)
    let blockLine = docEnd + 1;
    while (blockLine < totalLines) {
      const codeLine = document.lineAt(blockLine).text.trim();
      if (
        codeLine === "" ||
        codeLine.startsWith("//") ||
        codeLine.startsWith("#")
      ) {
        blockLine++;
        continue;
      }
      // Find ALL blocks that start at this line, then pick the deepest (highest level)
      function collectBlocksStartingAtLine(
        blockList: PHPBlock[],
        line: number,
        acc: PHPBlock[] = []
      ) {
        for (const block of blockList) {
          if (block.startLine === line) acc.push(block);
          if (block.children && block.children.length > 0) {
            collectBlocksStartingAtLine(block.children, line, acc);
          }
        }
        return acc;
      }
      const candidates = collectBlocksStartingAtLine(blocks, blockLine);
      console.log(
        `[PHPDoc] Looking for block starting at line ${blockLine}, found:`,
        candidates
          .map((b) => `${b.type} '${b.name}' [${b.startLine}-${b.endLine}]`)
          .join(", ")
      );
      if (candidates.length > 0) {
        // Pick the one with the highest level (deepest nesting)
        candidates.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
        console.log(
          `[PHPDoc] Selected block: ${candidates[0].type} '${candidates[0].name}' at lines ${candidates[0].startLine}-${candidates[0].endLine}`
        );
        return candidates[0];
      }
      break;
    }
    // If no block found, return undefined
    return undefined;
  }
  // If not in a docblock, use the deepest block search
  function searchDeepest(blockList: PHPBlock[]): PHPBlock | undefined {
    for (const block of blockList) {
      if (line >= block.startLine && line <= block.endLine) {
        if (block.children && block.children.length > 0) {
          const child = searchDeepest(block.children);
          if (child) return child;
        }
        // If no child matches, return this block
        return block;
      }
    }
    return undefined;
  }
  let found = searchDeepest(blocks);
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
  // Fallback: check children recursively
  for (const block of blocks) {
    if (block.children && block.children.length > 0) {
      const child = findBlockForCursor(block.children, line, document);
      if (child) return child;
    }
  }
  return undefined;
}
