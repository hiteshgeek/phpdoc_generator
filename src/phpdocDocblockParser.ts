import { DocblockInfo, ParamDoc } from "./types/docblock";

export function parseDocblock(lines: string[]): DocblockInfo {
  const summaryLines: string[] = [];
  const params: ParamDoc[] = [];
  let returnType: string | undefined;
  let returnDesc: string | undefined;
  let inDesc = true;
  let settings: string[] | undefined = undefined;
  let otherTags: string[] = [];
  let preservedTags: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("/**")) continue; // skip opening line
    const l = line.replace(/^\s*\*\s?/, "");
    if (l.startsWith("@settings")) {
      // Parse settings block
      settings = [];
      let j = i + 1;
      while (j < lines.length) {
        const sLine = lines[j].replace(/^\s*\*\s?/, "");
        if (sLine.startsWith("- ")) {
          settings.push(sLine.substring(2).trim());
          j++;
        } else {
          break;
        }
      }
      i = j - 1;
      continue;
    }
    if (l.startsWith("@param")) {
      inDesc = false;
      const [, type, name, desc] =
        l.match(/@param\s+(\S+)?\s*\$(\w+)\s*(.*)/) || [];
      params.push({ name, type, desc });
    } else if (l.startsWith("@return")) {
      inDesc = false;
      // Enhanced regex to better capture union types (|) and full class paths with namespaces
      const [, typeCapture, desc] =
        l.match(/@return\s+([a-zA-Z0-9_\\|]+(?:\[\])?)\s*(.*)/) || [];
      if (typeCapture) {
        // Make sure we preserve the exact union type syntax from the docblock
        returnType = typeCapture.trim();
        returnDesc = desc;
      } else {
        // Fallback to less strict parsing if the enhanced regex fails
        const fallbackMatch = l.match(/@return\s+(\S+)?\s*(.*)/);
        if (fallbackMatch) {
          returnType = fallbackMatch[1];
          returnDesc = fallbackMatch[2];
        }
      }
    } else if (
      l.startsWith("@") &&
      !l.startsWith("@param") &&
      !l.startsWith("@return") &&
      !l.startsWith("@settings")
    ) {
      otherTags.push(l);
      preservedTags.push(line); // preserve original whitespace
    } else if (inDesc && l && !l.startsWith("@")) {
      summaryLines.push(l.trim());
    }
    // Do NOT preserve blank lines in preservedTags!
  }
  // Collapse multiple consecutive blank lines in summaryLines
  let collapsedSummary: string[] = [];
  let lastWasBlank = false;
  for (const line of summaryLines) {
    if (line.trim() === "") {
      if (!lastWasBlank) {
        collapsedSummary.push("");
        lastWasBlank = true;
      }
    } else {
      collapsedSummary.push(line);
      lastWasBlank = false;
    }
  }
  return {
    summary: collapsedSummary.join("\n"),
    params,
    returnType,
    returnDesc,
    lines,
    settings,
    otherTags,
    preservedTags,
  };
}
