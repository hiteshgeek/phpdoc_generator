import * as vscode from "vscode";

export function registerFoldingProvider(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: "php" },
      {
        provideFoldingRanges(document, _context, _token) {
          const ranges = [];
          const totalLines = document.lineCount;
          let inDocblock = false;
          let start = 0;
          for (let i = 0; i < totalLines; ++i) {
            const line = document.lineAt(i).text.trim();
            if (!inDocblock && line.startsWith("/**")) {
              inDocblock = true;
              start = i;
            }
            if (inDocblock && line.endsWith("*/")) {
              // Check if the next non-empty, non-comment line is a function definition
              let nextLine = i + 1;
              let shouldFold = true;
              while (nextLine < totalLines) {
                const nextText = document.lineAt(nextLine).text.trim();
                if (nextText === "" || nextText.startsWith("*")) {
                  nextLine++;
                  continue;
                }
                // If next line is another docblock, do not fold (nested/recursive)
                if (nextText.startsWith("/**")) {
                  shouldFold = false;
                }
                break;
              }
              inDocblock = false;
              if (i > start && shouldFold) {
                ranges.push(
                  new vscode.FoldingRange(
                    start,
                    i,
                    vscode.FoldingRangeKind.Comment
                  )
                );
              }
            }
          }
          return ranges;
        },
      }
    )
  );
}
