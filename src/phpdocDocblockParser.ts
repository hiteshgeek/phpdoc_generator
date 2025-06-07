import { DocblockInfo, ParamDoc } from "./types/docblock";

export function parseDocblock(lines: string[]): DocblockInfo {
  const summaryLines: string[] = [];
  const params: ParamDoc[] = [];
  let returnType: string | undefined;
  let returnDesc: string | undefined;
  let inDesc = true;
  let settings: string[] | undefined = undefined;
  let otherTags: string[] = [];
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
      const [, type, desc] = l.match(/@return\s+(\S+)?\s*(.*)/) || [];
      returnType = type;
      returnDesc = desc;
    } else if (
      l.startsWith("@") &&
      !l.startsWith("@param") &&
      !l.startsWith("@return") &&
      !l.startsWith("@settings")
    ) {
      otherTags.push(l);
    } else if (inDesc && l && !l.startsWith("@")) {
      summaryLines.push(l.trim());
    }
  }
  return {
    summary: summaryLines.join("\n"),
    params,
    returnType,
    returnDesc,
    lines,
    settings,
    otherTags,
  };
}
