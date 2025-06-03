export interface ParamDoc {
  name: string;
  type?: string;
  desc?: string;
}

export interface DocblockInfo {
  summary: string;
  params: ParamDoc[];
  returnType?: string;
  returnDesc?: string;
  lines?: string[];
  settings?: string[]; // Add settings property
}

export function parseDocblock(lines: string[]): DocblockInfo {
  const summaryLines: string[] = [];
  const params: ParamDoc[] = [];
  let returnType: string | undefined;
  let returnDesc: string | undefined;
  let inDesc = true;
  let settings: string[] | undefined = undefined;
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
  };
}

export function buildDocblock({
  summary,
  params,
  returnType,
  returnDesc,
  lines,
  name,
  settings,
  type,
}: DocblockInfo & {
  name?: string;
  settings?: string[];
  type?: string;
}): string[] {
  const linesArr = ["/**"];
  // Add '{block type} {block name}' as the first line, but only if not already present as the first summary line
  const blockTypeLine =
    type && name ? `${type} ${name}` : name ? `function ${name}` : undefined;
  const summaryLines = summary ? summary.split("\n") : [];
  let blockTypeLineAdded = false;
  if (
    blockTypeLine &&
    (!summaryLines.length || summaryLines[0] !== blockTypeLine)
  ) {
    linesArr.push(` * ${blockTypeLine}`);
    blockTypeLineAdded = true;
  }
  // Add summary lines, but skip the first if it matches blockTypeLine
  for (let i = 0; i < summaryLines.length; i++) {
    if (i === 0 && summaryLines[0] === blockTypeLine && blockTypeLineAdded)
      continue;
    linesArr.push(` * ${summaryLines[i]}`);
  }
  // Insert @settings block if present
  if (settings && settings.length > 0) {
    linesArr.push(" *");
    linesArr.push(" * @settings");
    for (const s of settings) {
      linesArr.push(` * - ${s}`);
    }
  }
  // Always add an empty line before tags if there is a summary or function name or settings and at least one tag
  if (
    (summary || name || (settings && settings.length > 0)) &&
    (params.length > 0 || returnType)
  ) {
    linesArr.push(" *");
  }
  for (const p of params) {
    linesArr.push(
      ` * @param${p.type ? " " + p.type : ""} $${p.name}${
        p.desc ? " " + p.desc : ""
      }`
    );
  }
  if (returnType)
    linesArr.push(
      ` * @return ${returnType}${returnDesc ? " " + returnDesc : ""}`
    );
  // Only add the closing '*/' if the last non-empty line is not already exactly '*/' and not ' * /'
  let lastNonEmpty = linesArr.length - 1;
  while (lastNonEmpty >= 0 && linesArr[lastNonEmpty].trim() === "")
    lastNonEmpty--;
  const lastLine = linesArr[lastNonEmpty]?.trim();
  if (lastNonEmpty < 0 || (lastLine !== "*/" && lastLine !== "* /")) {
    linesArr.push("*/");
  } else if (lastLine === "* /") {
    // Fix any malformed ending
    linesArr[lastNonEmpty] = "*/";
  }
  return linesArr;
}

export function updateDocblock(
  old: DocblockInfo,
  blockParams: { name: string; type?: string }[],
  returnType?: string
): DocblockInfo {
  // Preserve summary and param descriptions if names match
  const params: ParamDoc[] = blockParams.map((bp) => {
    const found = old.params.find((p) => p.name === bp.name);
    return found ? { ...bp, desc: found.desc } : { ...bp };
  });
  return {
    summary: old.summary,
    params,
    returnType,
    returnDesc: old.returnDesc,
  };
}
