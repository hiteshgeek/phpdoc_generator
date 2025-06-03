import * as PHPParser from "php-parser";

export interface PHPBlock {
  type: "function" | "class" | "trait" | "interface";
  name: string;
  startLine: number;
  endLine: number;
  params?: { name: string; type?: string }[];
  returnType?: string;
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
    returnType?: string
  ) {
    blocks.push({
      type,
      name,
      startLine: loc.start.line - 1,
      endLine: loc.end.line - 1,
      params,
      returnType,
    });
  }

  function walk(node: any) {
    if (!node || !node.kind) return;
    switch (node.kind) {
      case "function":
      case "method": {
        const params = (node.arguments || []).map((p: any) => ({
          name: typeof p.name === "string" ? p.name : p.name?.name,
          type: p.type ? p.type.name : undefined,
        }));
        const returnType = node.type ? node.type.name || node.type : undefined;
        addBlock(
          "function",
          node.name?.name || "",
          node.loc,
          params,
          returnType
        );
        break;
      }
      case "class":
        addBlock("class", node.name?.name || "", node.loc);
        break;
      case "interface":
        addBlock("interface", node.name?.name || "", node.loc);
        break;
      case "trait":
        addBlock("trait", node.name?.name || "", node.loc);
        break;
    }
    for (const key in node) {
      if (node.hasOwnProperty(key)) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach(walk);
        else if (typeof child === "object" && child && child.kind) walk(child);
      }
    }
  }

  if (ast.children) ast.children.forEach(walk);
  return blocks;
}
