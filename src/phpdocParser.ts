import * as PHPParser from "php-parser";

export interface PHPBlock {
  type: "function" | "class" | "trait" | "interface" | "property";
  name: string;
  startLine: number;
  endLine: number;
  params?: { name: string; type?: string }[];
  returnType?: string;
  children?: PHPBlock[];
  level?: number; // 0 = top-level, 1 = child, etc.
  parent?: PHPBlock;
}

const parser = new PHPParser.Engine({
  parser: { extractDoc: true },
  ast: { withPositions: true },
});

export function parsePHPBlocks(text: string): PHPBlock[] {
  const ast = parser.parseCode(text, "");
  const blocks: PHPBlock[] = [];

  function addBlock(
    type: PHPBlock["type"],
    name: string,
    loc: any,
    params?: any[],
    returnType?: string,
    parent?: PHPBlock,
    level: number = 0
  ): PHPBlock {
    const block: PHPBlock = {
      type,
      name,
      startLine: loc.start.line - 1,
      endLine: loc.end.line - 1,
      params,
      returnType,
      children: [],
      level,
      parent,
    };
    if (parent) {
      parent.children = parent.children || [];
      parent.children.push(block);
    } else {
      blocks.push(block);
    }
    return block;
  }

  function walk(node: any, parentBlock?: PHPBlock, level: number = 0) {
    if (!node || !node.kind) return;
    let currentBlock: PHPBlock | undefined;
    switch (node.kind) {
      case "function":
      case "method": {
        let funcName = node.name?.name || node.name || "";
        const params = (node.arguments || []).map((p: any) => ({
          name: typeof p.name === "string" ? p.name : p.name?.name,
          type: p.type ? p.type.name : undefined,
        }));
        // Robust extraction of explicit return type (including union types)
        let returnType: string | undefined;
        let hasExplicitReturnType = false;
        if (node.type) {
          if (typeof node.type === "string") {
            returnType = node.type;
            hasExplicitReturnType = true;
          } else if (Array.isArray(node.type)) {
            returnType = node.type
              .map(
                (t: any) => t.raw || t.name || (typeof t === "string" ? t : "")
              )
              .filter(Boolean)
              .join("|");
            hasExplicitReturnType = !!returnType;
          } else if (typeof node.type === "object") {
            if (
              node.type.kind === "uniontype" &&
              Array.isArray(node.type.types)
            ) {
              returnType = node.type.types
                .map(
                  (t: any) =>
                    t.raw || t.name || (typeof t === "string" ? t : "")
                )
                .filter(Boolean)
                .join("|");
              hasExplicitReturnType = !!returnType;
            } else if (node.type.kind === "nullabletype" && node.type.what) {
              const baseType =
                node.type.what.raw ||
                node.type.what.name ||
                (typeof node.type.what === "string" ? node.type.what : "");
              returnType = baseType ? `null|${baseType}` : undefined;
              hasExplicitReturnType = !!returnType;
            } else {
              returnType = node.type.raw || node.type.name || undefined;
              hasExplicitReturnType = !!returnType;
            }
          }
        }
        currentBlock = addBlock(
          "function",
          funcName,
          node.loc,
          params,
          returnType,
          parentBlock,
          level
        );
        if (currentBlock && hasExplicitReturnType) {
          (currentBlock as any).hasExplicitReturnType = true;
        }
        break;
      }
      case "class":
        currentBlock = addBlock(
          "class",
          node.name?.name || "",
          node.loc,
          undefined,
          undefined,
          parentBlock,
          level
        );
        // Add properties as children
        if (Array.isArray(node.body)) {
          for (const stmt of node.body) {
            if (stmt.kind === "property") {
              // PATCH: Robustly extract all property names and types
              const propNames = Array.isArray(stmt.name)
                ? stmt.name.map((n: any) => n.name || "")
                : [stmt.name?.name || ""];
              for (let i = 0; i < propNames.length; i++) {
                let propType: string | undefined = undefined;
                if (stmt.type) {
                  if (typeof stmt.type === "string") {
                    propType = stmt.type;
                  } else if (typeof stmt.type === "object") {
                    propType = stmt.type.name || stmt.type.raw || undefined;
                  }
                }
                addBlock(
                  "property",
                  propNames[i],
                  stmt.loc,
                  undefined,
                  propType,
                  currentBlock,
                  level + 1
                );
              }
            }
          }
        }
        break;
      case "interface":
        currentBlock = addBlock(
          "interface",
          node.name?.name || "",
          node.loc,
          undefined,
          undefined,
          parentBlock,
          level
        );
        break;
      case "trait":
        currentBlock = addBlock(
          "trait",
          node.name?.name || "",
          node.loc,
          undefined,
          undefined,
          parentBlock,
          level
        );
        break;
      case "property": {
        // node.name can be an array (multiple properties declared in one line)
        const propNames = Array.isArray(node.name) ? node.name : [node.name];
        for (const prop of propNames) {
          addBlock(
            "property",
            typeof prop === "string" ? prop : prop?.name,
            prop.loc || node.loc,
            undefined,
            node.type ? node.type.name || node.type : undefined,
            parentBlock,
            level
          );
        }
        break;
      }
    }
    for (const key in node) {
      if (node.hasOwnProperty(key)) {
        const child = node[key];
        if (Array.isArray(child))
          child.forEach((c) =>
            walk(
              c,
              currentBlock || parentBlock,
              currentBlock ? level + 1 : level
            )
          );
        else if (typeof child === "object" && child && child.kind)
          walk(
            child,
            currentBlock || parentBlock,
            currentBlock ? level + 1 : level
          );
      }
    }
  }

  if (ast.children) ast.children.forEach((c) => walk(c, undefined, 0));
  return blocks;
}

// Helper: Collect all return types from a function node, skipping nested functions/closures
export function collectReturnTypesFromFunctionNode(node: any): string[] {
  const types = new Set<string>();
  function walkStatements(stmts: any[]) {
    if (!Array.isArray(stmts)) return;
    for (const n of stmts) {
      if (!n || typeof n !== "object") continue;
      if (
        n.kind === "function" ||
        n.kind === "closure" ||
        n.kind === "method"
      ) {
        continue;
      }
      if (n.kind === "return") {
        if (!n.expr) {
          types.add("void");
        } else if (n.expr.kind === "boolean") {
          types.add("bool");
        } else if (n.expr.kind === "number") {
          if (n.expr.value.includes(".")) types.add("float");
          else types.add("int");
        } else if (n.expr.kind === "string") {
          types.add("string");
        } else if (n.expr.kind === "array") {
          types.add("array");
        } else if (n.expr.kind === "new") {
          if (n.expr.what && n.expr.what.name) types.add(n.expr.what.name);
          else {
            types.add("mixed");
          }
        } else {
          types.add("mixed");
        }
      } else if (n.kind === "throw") {
        if (
          n.what &&
          n.what.kind === "new" &&
          n.what.what &&
          n.what.what.name
        ) {
          types.add(n.what.what.name);
        } else {
          types.add("Exception");
        }
      } else if (n.kind === "if") {
        // Walk all branches: body, alternate, and elseifs
        if (n.body) {
          if (n.body.kind === "block" && Array.isArray(n.body.children)) {
            walkStatements(n.body.children);
          } else if (Array.isArray(n.body)) {
            walkStatements(n.body);
          }
        }
        if (n.alternate) {
          if (
            n.alternate.kind === "block" &&
            Array.isArray(n.alternate.children)
          ) {
            walkStatements(n.alternate.children);
          } else if (Array.isArray(n.alternate)) {
            walkStatements(n.alternate);
          } else if (n.alternate.kind === "if") {
            walkStatements([n.alternate]);
          }
        }
      } else if (
        n.kind === "while" ||
        n.kind === "do" ||
        n.kind === "for" ||
        n.kind === "foreach" ||
        n.kind === "switch" ||
        n.kind === "try"
      ) {
        for (const key of [
          "body",
          "trueBody",
          "falseBody",
          "shortIfBody",
          "cases",
          "catches",
          "finallyBlock",
          // PATCH: also walk 'alternate' for loops and try/catch
          "alternate",
        ]) {
          if (n[key]) {
            if (Array.isArray(n[key])) walkStatements(n[key]);
            else if (n[key].kind === "block") walkStatements(n[key].children);
            else if (Array.isArray(n[key].children))
              walkStatements(n[key].children);
          }
        }
      } else if (n.kind === "block" && Array.isArray(n.children)) {
        walkStatements(n.children);
      }
    }
  }
  if (node && node.body && Array.isArray(node.body.children)) {
    walkStatements(node.body.children);
  }
  return Array.from(types);
}
