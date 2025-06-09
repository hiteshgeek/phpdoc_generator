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
  // DEBUG: Log block info at the start
  console.log("[PHPDocGen] Processing block:", {
    name: block.name,
    type: block.type,
    startLine: block.startLine,
    endLine: block.endLine,
    returnType: block.returnType,
    params: block.params,
  });
  // Use a module-level variable for the output channel
  if (!(globalThis as any)._phpdocGenOutputChannel) {
    (globalThis as any)._phpdocGenOutputChannel =
      vscode.window.createOutputChannel("PHPDoc Generator");
  }
  const output = (globalThis as any)._phpdocGenOutputChannel;
  output.appendLine(
    `[PHPDocGen] Processing block: ${block.name} (type: ${block.type}) lines ${block.startLine}-${block.endLine} returnType: ${block.returnType}`
  );
  // Always generate docblock for property
  if (block.type === "property") {
    const padding = getLineIndent(document, block.startLine);
    const docblock = buildPropertyDocblock({
      name: block.name,
      type: block.returnType,
      padding,
    });
    const insertLine = block.startLine;
    const insertPos = new vscode.Position(insertLine, 0);
    editBuilder.insert(insertPos, docblock.join("\n") + "\n");
    return;
  }

  // For class/interface/trait: generate docblock (no @return), then always generate property docblocks for all children
  if (
    block.type === "class" ||
    block.type === "interface" ||
    block.type === "trait"
  ) {
    output.appendLine(
      `[PHPDocGen] Generating docblock for ${block.type} '${block.name}' at line ${block.startLine}`
    );
    // DEBUG: Log class/interface/trait block
    console.log(
      `[PHPDocGen] Generating docblock for ${block.type} '${block.name}' at line ${block.startLine}`
    );
    // Always generate docblock for class/interface/trait (no @return)
    const padding = getLineIndent(document, block.startLine);
    const docblock = buildDocblock({
      summary: "",
      params: [],
      name: block.name,
      type: block.type,
      padding,
    });
    const insertLine = block.startLine;
    const insertPos = new vscode.Position(insertLine, 0);
    editBuilder.insert(insertPos, docblock.join("\n") + "\n");
    // Always generate property docblocks for all children of type 'property'
    if (block.children && block.children.length > 0) {
      for (const child of block.children) {
        if (child.type === "property") {
          const propPadding = getLineIndent(document, child.startLine);
          const propDocblock = buildPropertyDocblock({
            name: child.name,
            type: child.returnType,
            padding: propPadding,
          });
          const propInsertLine = child.startLine;
          const propInsertPos = new vscode.Position(propInsertLine, 0);
          editBuilder.insert(propInsertPos, propDocblock.join("\n") + "\n");
        }
      }
    }
    return;
  }

  // Robust: Always generate docblock for every function/method, including union return types
  if (block.type === "function" || block.type === "method") {
    let returnType = block.returnType;
    // --- CRITICAL FIX: Always use block.returnType from the parser if present ---
    if (
      typeof returnType === "string" &&
      returnType.trim() !== "" &&
      returnType !== "undefined"
    ) {
      // If explicit return type contains 'mixed', use only 'mixed'
      const types = returnType
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean);
      if (types.includes("mixed")) {
        returnType = "mixed";
      }
      block.returnType = returnType;
      // Immediately generate docblock with explicit return type and return
      const padding = getLineIndent(document, block.startLine);
      const docblock = buildDocblock({
        summary: "",
        params: block.params || [],
        returnType: block.returnType,
        name: block.name,
        type: block.type,
        padding,
      });
      const insertLine = block.startLine;
      const insertPos = new vscode.Position(insertLine, 0);
      editBuilder.insert(insertPos, docblock.join("\n") + "\n");
      return;
    }
    // No explicit return type: analyze the function body for actual return types (inference)
    const funcStart = document.lineAt(block.startLine).range.start;
    const funcEnd = document.lineAt(block.endLine).range.end;
    const funcText = document.getText(new vscode.Range(funcStart, funcEnd));
    try {
      const PHPParser = require("php-parser");
      const parser = new PHPParser.Engine({
        parser: { extractDoc: true },
        ast: { withPositions: true },
      });
      const ast = parser.parseCode(funcText, "");
      // Find the function node in the AST
      let funcNode = null;
      if (ast && ast.children && ast.children.length > 0) {
        for (const node of ast.children) {
          if (node.kind === "function" || node.kind === "method") {
            funcNode = node;
            break;
          }
        }
      }
      if (funcNode) {
        const returnTypes = collectReturnTypesFromFunctionNode(funcNode);
        // Remove duplicates and sort
        const uniqueTypes = Array.from(new Set(returnTypes)).sort();
        if (uniqueTypes.length === 0) {
          // No return statement at all
          returnType = "void";
        } else if (
          uniqueTypes.length === 1 &&
          (uniqueTypes[0] === "void" || uniqueTypes[0] === undefined)
        ) {
          returnType = "void";
        } else if (uniqueTypes.length === 1) {
          returnType = uniqueTypes[0];
        } else {
          // If any return type is 'mixed', use 'mixed', else join all
          if (uniqueTypes.includes("mixed")) {
            returnType = "mixed";
          } else {
            returnType = uniqueTypes.join("|");
          }
        }
      } else {
        // Fallback: if no function node, default to void
        returnType = "void";
      }
    } catch (e) {
      // If parsing fails, fallback to void
      returnType = "void";
    }
    // Always update block.returnType for downstream docblock logic
    block.returnType = returnType;
    // DEBUG: Log function block after returnType is finalized
    console.log(
      `[PHPDocGen] Function '${block.name}' final returnType:`,
      block.returnType
    );
    // OUTPUT: Print to OutputChannel if returnType is void or not explicit
    if (block.returnType === "void" || !block.returnType) {
      if (output) {
        output.appendLine(
          `[PHPDocGen] WARNING: Inferred or missing @return void for '${block.name}' at line ${block.startLine}`
        );
        output.appendLine(
          `[PHPDocGen] Block params: ${JSON.stringify(block.params)}`
        );
        output.appendLine(`[PHPDocGen] Block returnType: ${block.returnType}`);
      }
    } else {
      if (output) {
        output.appendLine(
          `[PHPDocGen] INFO: Inferred @return ${block.returnType} for '${block.name}' at line ${block.startLine}`
        );
      }
    }
    // DO NOT RETURN HERE -- let the docblock existence/update logic below run for all functions/methods
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
  // --- CRITICAL FIX: Always replace the docblock for functions with explicit returnType ---
  if (
    (block.type === "function" || block.type === "method") &&
    typeof block.returnType === "string" &&
    block.returnType.trim() !== "" &&
    block.returnType !== "undefined"
  ) {
    const docRange = hasDoc
      ? new vscode.Range(
          new vscode.Position(docStart, 0),
          new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
        )
      : new vscode.Range(
          new vscode.Position(block.startLine, 0),
          new vscode.Position(block.startLine, 0)
        );
    const docblock = buildDocblock({
      summary: "",
      params: block.params || [],
      returnType: block.returnType,
      name: block.name,
      type: block.type,
      padding: getLineIndent(document, block.startLine),
    });
    editBuilder.replace(docRange, docblock.join("\n") + "\n");
    return;
  }

  // Generate docblock for every block, regardless of type
  if (!hasDoc) {
    output.appendLine(
      `[PHPDocGen] No docblock found for '${block.name}' (type: ${block.type}) at line ${block.startLine}. Inserting new docblock.`
    );
    // If docblock exists, update it if the return type is not canonical
    if (docEnd > docStart) {
      // CRITICAL FIX: Direct intervention for functions with PHP 8+ union types
      const lineText = document.lineAt(block.startLine).text;
      const functionSignature = lineText.trim();

      const docRange = new vscode.Range(
        new vscode.Position(docStart, 0),
        new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
      );
      const oldDocLines = document.getText(docRange).split("\n");
      const oldDoc = parseDocblock(oldDocLines);

      // More sophisticated return type comparison for union types
      const shouldUpdate = () => {
        // If types are exactly equal, no need to update
        if (oldDoc.returnType === block.returnType) return false;

        // If one is undefined but the other isn't, we should update
        if (!oldDoc.returnType || !block.returnType) return true;

        // For union types, compare the individual types (order-independent)
        let oldTypeStr = "";
        let newTypeStr = "";
        if (typeof oldDoc.returnType === "string") {
          oldTypeStr = oldDoc.returnType;
        } else if (
          oldDoc.returnType !== undefined &&
          oldDoc.returnType !== null
        ) {
          try {
            oldTypeStr = String(oldDoc.returnType);
          } catch (e) {
            oldTypeStr = "";
            output.appendLine(
              `[PHPDocGen] [WARN] Could not convert oldDoc.returnType to string: ${e}`
            );
          }
        }
        if (typeof block.returnType === "string") {
          newTypeStr = block.returnType;
        } else if (
          block.returnType !== undefined &&
          block.returnType !== null
        ) {
          try {
            newTypeStr = String(block.returnType);
          } catch (e) {
            newTypeStr = "";
            output.appendLine(
              `[PHPDocGen] [WARN] Could not convert block.returnType to string: ${e}`
            );
          }
        }
        const oldTypes = oldTypeStr
          .split("|")
          .map((t) => t.trim())
          .sort();
        const newTypes = newTypeStr
          .split("|")
          .map((t) => t.trim())
          .sort();

        // If different number of types, definitely update
        if (oldTypes.length !== newTypes.length) return true;

        // Compare each type
        for (let i = 0; i < oldTypes.length; i++) {
          if (oldTypes[i] !== newTypes[i]) return true;
        }

        return false;
      };

      // Only update if returnType is different or missing
      if (shouldUpdate()) {
        console.log(
          `Updating docblock for ${block.name}. Old return type: ${oldDoc.returnType}, New return type: ${block.returnType}`
        );
        const updated = updateDocblock(
          oldDoc,
          block.params || [],
          block.returnType
        );
        const newDoc = buildDocblock({
          ...updated,
          name: block.name,
          type: block.type,
          padding: getLineIndent(document, block.startLine),
        });
        editBuilder.replace(docRange, newDoc.join("\n"));
      }
    } else {
      // No docblock found, insert new one
      const throwsTypes: string[] = [];
      const padding = getLineIndent(document, block.startLine);
      const throwsTagsNew = throwsTypes.map((t: string) => `@throws ${t}`);
      const docblockNew = buildDocblock({
        summary: "",
        params: block.params || [],
        returnType: block.returnType, // was docblockReturnType
        lines: [],
        name: block.name,
        settings: skipSettings ? undefined : undefined, // settingsArr is not defined, and settings is always undefined here
        type: block.type,
        otherTags: throwsTagsNew,
        padding: padding,
      });
      const insertLine = block.startLine;
      const insertPos = new vscode.Position(insertLine, 0);
      editBuilder.insert(insertPos, docblockNew.join("\n") + "\n");
    }
  } else {
    // --- CRITICAL FIX: For any function with union return type, always update the docblock ---
    // Find the function signature line (first line after block.startLine that starts with 'function')
    let funcLineNum = block.startLine;
    let funcLine = document.lineAt(funcLineNum).text;
    const maxLines = Math.min(document.lineCount, block.startLine + 10);
    while (
      !funcLine.trim().startsWith("function") &&
      funcLineNum < maxLines - 1
    ) {
      funcLineNum++;
      funcLine = document.lineAt(funcLineNum).text;
    }
    // Now funcLine should be the function signature
    const unionReturnTypeMatch = funcLine.match(/\)\s*:\s*([^\s{;]+)/);
    if (
      unionReturnTypeMatch &&
      unionReturnTypeMatch[1] &&
      unionReturnTypeMatch[1].includes("|") &&
      block.type === "function"
    ) {
      const explicitReturnType = unionReturnTypeMatch[1].trim();
      // DEBUG: Write to /tmp/phpdoc_union_debug.log
      try {
        const fs = require("fs");
        fs.appendFileSync(
          "/tmp/phpdoc_union_debug.log",
          `[${new Date().toISOString()}] Function: ${
            block.name
          }, ReturnType: ${explicitReturnType}, Line: ${funcLine}\n`
        );
      } catch (e) {}
      const docRange = new vscode.Range(
        new vscode.Position(docStart, 0),
        new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
      );
      // Always build a new docblock with the correct return type
      const docblock = buildDocblock({
        summary: "",
        params: block.params || [],
        returnType: explicitReturnType,
        name: block.name,
        type: block.type,
        padding: getLineIndent(document, block.startLine),
      });
      editBuilder.replace(docRange, docblock.join("\n"));
      return;
    }
    // Fallback: try to extract any explicit return type from the function signature line
    const returnTypeMatch = funcLine.match(/\)\s*:\s*([a-zA-Z0-9|_\\]+)/);
    if (returnTypeMatch && returnTypeMatch[1] && block.type === "function") {
      const explicitReturnType = returnTypeMatch[1].trim();
      console.log(
        `[PHPDocGen] Found explicit return type in PHP code for updating docblock: ${explicitReturnType}`
      );
      const docRange = new vscode.Range(
        new vscode.Position(docStart, 0),
        new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
      );
      const oldDocLines = document.getText(docRange).split("\n");
      const oldDoc = parseDocblock(oldDocLines);
      // Always update if there's an explicit return type in PHP code
      const updated = updateDocblock(
        oldDoc,
        block.params || [],
        explicitReturnType // Use the extracted return type
      );
      const newDoc = buildDocblock({
        ...updated,
        name: block.name,
        type: block.type,
        padding: getLineIndent(document, block.startLine),
      });
      editBuilder.replace(docRange, newDoc.join("\n"));
      return; // Skip further processing
    }

    // If docblock exists, update it if the return type is not canonical
    if (docEnd > docStart) {
      const docRange = new vscode.Range(
        new vscode.Position(docStart, 0),
        new vscode.Position(docEnd, document.lineAt(docEnd).text.length)
      );
      const oldDocLines = document.getText(docRange).split("\n");
      const oldDoc = parseDocblock(oldDocLines);

      // More sophisticated return type comparison for union types
      const shouldUpdate = () => {
        // If types are exactly equal, no need to update
        if (oldDoc.returnType === block.returnType) return false;

        // If one is undefined but the other isn't, we should update
        if (!oldDoc.returnType || !block.returnType) return true;

        // For union types, compare the individual types (order-independent)
        let oldTypeStr = "";
        let newTypeStr = "";
        if (typeof oldDoc.returnType === "string") {
          oldTypeStr = oldDoc.returnType;
        } else if (
          oldDoc.returnType !== undefined &&
          oldDoc.returnType !== null
        ) {
          try {
            oldTypeStr = String(oldDoc.returnType);
          } catch (e) {
            oldTypeStr = "";
            output.appendLine(
              `[PHPDocGen] [WARN] Could not convert oldDoc.returnType to string: ${e}`
            );
          }
        }
        if (typeof block.returnType === "string") {
          newTypeStr = block.returnType;
        } else if (
          block.returnType !== undefined &&
          block.returnType !== null
        ) {
          try {
            newTypeStr = String(block.returnType);
          } catch (e) {
            newTypeStr = "";
            output.appendLine(
              `[PHPDocGen] [WARN] Could not convert block.returnType to string: ${e}`
            );
          }
        }
        const oldTypes = oldTypeStr
          .split("|")
          .map((t) => t.trim())
          .sort();
        const newTypes = newTypeStr
          .split("|")
          .map((t) => t.trim())
          .sort();

        // If different number of types, definitely update
        if (oldTypes.length !== newTypes.length) return true;

        // Compare each type
        for (let i = 0; i < oldTypes.length; i++) {
          if (oldTypes[i] !== newTypes[i]) return true;
        }

        return false;
      };

      // Only update if returnType is different or missing
      if (shouldUpdate()) {
        console.log(
          `Updating docblock for ${block.name}. Old return type: ${oldDoc.returnType}, New return type: ${block.returnType}`
        );
        const updated = updateDocblock(
          oldDoc,
          block.params || [],
          block.returnType
        );
        const newDoc = buildDocblock({
          ...updated,
          name: block.name,
          type: block.type,
          padding: getLineIndent(document, block.startLine),
        });
        editBuilder.replace(docRange, newDoc.join("\n"));
      }
    }
  }
}
