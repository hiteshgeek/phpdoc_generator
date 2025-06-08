import * as vscode from "vscode";
import { registerDocblockCommands } from "./commands";
import { registerFoldingProvider } from "./providers/phpdocFoldingProvider";
import { PHPBlock, collectReturnTypesFromFunctionNode } from "./phpdocParser";
import { buildDocblock, buildPropertyDocblock } from "./phpdocDocblock";

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
        console.log(
          `[DEBUG] [EXPLICIT] Setting returnType to 'mixed' for function/method:`,
          block.name,
          `at line`,
          block.startLine + 1
        );
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
            console.log(
              `[DEBUG] [INFERRED] No return statement found, setting returnType to 'void' for function/method:`,
              block.name,
              `at line`,
              block.startLine + 1
            );
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
              console.log(
                `[DEBUG] [INFERRED] At least one return value is unknown, setting returnType to 'mixed' for function/method:`,
                block.name,
                `at line`,
                block.startLine + 1,
                `uniqueTypes:`,
                uniqueTypes
              );
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
    // Always generate docblock for every function/method
    if (returnType === "mixed") {
      console.log(
        `[DEBUG] [FINAL DOCBLOCK] returnType is 'mixed' for function/method:`,
        block.name,
        `at line`,
        block.startLine + 1
      );
    }
    const padding = getLineIndent(document, block.startLine);
    const docblock = buildDocblock({
      summary: "",
      params: block.params || [],
      returnType,
      name: block.name,
      type: "function", // Always use 'function' for both functions and methods
      padding,
    });
    const insertLine = block.startLine;
    const insertPos = new vscode.Position(insertLine, 0);
    editBuilder.insert(insertPos, docblock.join("\n") + "\n");
    return;
  }

  // Recurse into children if needed
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
