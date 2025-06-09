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
    // If there is an explicit return type (including union), always use it
    if (
      returnType &&
      typeof returnType === "string" &&
      returnType.trim() !== "" &&
      returnType !== "undefined"
    ) {
      // If explicit return type contains 'mixed' (even in a union), use only 'mixed'
      const types = returnType
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean);
      if (types.includes("mixed")) {
        returnType = "mixed";
      }
    } else {
      // No explicit return type: analyze the function body for actual return types
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
    }
    // Always update block.returnType for downstream docblock logic
    block.returnType = returnType;
    // DO NOT RETURN HERE -- let the docblock existence/update logic below run for all functions/methods
  }

  // Always generate docblocks for all block types and all children
  let docStart = block.startLine - 1;
  let hasDoc = false;
  let docEnd = docStart;
  let docblockFoundWithin2Lines = false;
  let linesChecked = 0;
  while (docStart >= 0 && linesChecked < 3) {
    const line = document.lineAt(docStart).text.trim();
    if (line === "") {
      docStart--;
      docEnd--;
      linesChecked++;
      continue;
    }
    if (line.startsWith("/**")) {
      hasDoc = true;
      docblockFoundWithin2Lines = true;
      break;
    }
    if (!line.startsWith("*") && !line.startsWith("//")) break;
    docStart--;
    linesChecked++;
  }
  // If docblock exists, update it if the return type is not canonical
  if (docblockFoundWithin2Lines) {
    docEnd = docStart;
    while (docEnd < block.startLine) {
      if (document.lineAt(docEnd).text.includes("*/")) break;
      docEnd++;
    }
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
      const oldTypes = oldDoc.returnType
        .split("|")
        .map((t) => t.trim())
        .sort();
      const newTypes = block.returnType
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
    const settings: string[] | undefined = undefined;
    const padding = getLineIndent(document, block.startLine);
    const throwsTagsNew = throwsTypes.map((t: string) => `@throws ${t}`);
    const docblockNew = buildDocblock({
      summary: "",
      params: block.params || [],
      returnType: block.returnType,
      lines: [],
      name: block.name,
      settings: skipSettings
        ? undefined
        : (settings ?? []).map((s: string) => {
            if (
              !settingsDescriptions ||
              Object.keys(settingsDescriptions).length === 0
            )
              return s;
            const desc = settingsDescriptions[s];
            if (desc && desc.trim() && desc.trim() !== s) {
              return `${s} : ${desc}`;
            } else if (desc && desc.trim()) {
              return `${s}`;
            } else {
              return `${s}`;
            }
          }),
      type: block.type,
      otherTags: throwsTagsNew,
      padding: padding,
    });
    const insertLine = block.startLine;
    const insertPos = new vscode.Position(insertLine, 0);
    editBuilder.insert(insertPos, docblockNew.join("\n") + "\n");
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
