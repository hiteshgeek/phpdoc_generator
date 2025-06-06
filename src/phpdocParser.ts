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
        const params = (node.arguments || []).map((p: any) => ({
          name: typeof p.name === "string" ? p.name : p.name?.name,
          type: p.type ? p.type.name : undefined,
        }));
        const returnType = node.type ? node.type.name || node.type : undefined;
        currentBlock = addBlock(
          "function",
          node.name?.name || "",
          node.loc,
          params,
          returnType,
          parentBlock,
          level
        );
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
              // PHP-Parser: stmt.name can be Identifier or array of Identifiers (for multiple props)
              if (Array.isArray(stmt.name)) {
                for (const n of stmt.name) {
                  addBlock(
                    "property",
                    n.name || "",
                    stmt.loc,
                    undefined,
                    stmt.type ? stmt.type.name || stmt.type : undefined,
                    currentBlock,
                    level + 1
                  );
                }
              } else {
                addBlock(
                  "property",
                  stmt.name?.name || "",
                  stmt.loc,
                  undefined,
                  stmt.type ? stmt.type.name || stmt.type : undefined,
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
