// Utility to collect all exception types thrown in a function/method node
export function collectThrowsFromFunctionNode(node: any): string[] {
  const throws = new Set<string>();
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
      if (n.kind === "throw") {
        if (
          n.what &&
          n.what.kind === "new" &&
          n.what.what &&
          n.what.what.name
        ) {
          throws.add(n.what.what.name);
        } else {
          throws.add("Exception");
        }
      } else if (n.kind === "if") {
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
  return Array.from(throws);
}
