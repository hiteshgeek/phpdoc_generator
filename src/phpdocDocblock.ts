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
  otherTags?: string[];
}

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

export function buildDocblock({
  summary,
  params,
  returnType,
  returnDesc,
  lines,
  name,
  settings,
  type,
  otherTags = [],
}: DocblockInfo & {
  name?: string;
  settings?: string[];
  type?: string;
  otherTags?: string[];
}): string[] {
  const linesArr = ["/**"];
  const blockTypeLine =
    type && name ? `${type} ${name}` : name ? `function ${name}` : undefined;
  const summaryLines = summary ? summary.split("\n") : [];
  let blockTypeLineAdded = false;

  if (summaryLines.length > 0 && name) {
    const firstNonEmptyIdx = summaryLines.findIndex((l) => l.trim() !== "");
    if (firstNonEmptyIdx !== -1) {
      const firstLine = summaryLines[firstNonEmptyIdx];
      const namePattern = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const typeNamePattern = type ? `${type}\\s*${namePattern}` : undefined;
      const regexes = [
        new RegExp(namePattern, "i"),
        ...(typeNamePattern ? [new RegExp(typeNamePattern, "i")] : []),
      ];
      if (regexes.some((r) => r.test(firstLine))) {
        summaryLines.splice(firstNonEmptyIdx, 1);
      }
    }
  }

  if (
    blockTypeLine &&
    (!summaryLines.length || summaryLines[0] !== blockTypeLine)
  ) {
    linesArr.push(` * ${blockTypeLine}`);
    blockTypeLineAdded = true;
  }
  for (let i = 0; i < summaryLines.length; i++) {
    if (i === 0 && summaryLines[0] === blockTypeLine && blockTypeLineAdded)
      continue;
    linesArr.push(` * ${summaryLines[i]}`);
  }
  if (settings && settings.length > 0) {
    linesArr.push(" *");
    linesArr.push(" * @settings");
    for (const s of settings) {
      linesArr.push(` * - ${s}`);
    }
  }

  // Separate otherTags into throws and non-throws
  const throwsTags = (otherTags || []).filter((tag) =>
    tag.trim().startsWith("@throws")
  );
  // const nonThrowsTags = (otherTags || []).filter((tag) => !tag.trim().startsWith("@throws"));

  // PARAMS FIRST
  if (params.length > 0) {
    for (const p of params) {
      linesArr.push(
        ` * @param ${p.type ? p.type : "mixed"} $${p.name}${
          p.desc ? " " + p.desc : ""
        }`
      );
    }
  }

  // EMPTY LINE after params if throws exist
  if (params.length > 0 && throwsTags.length > 0) {
    linesArr.push(" *");
  }

  // THROWS
  if (throwsTags.length > 0) {
    for (const tag of throwsTags) {
      linesArr.push(` * ${tag}`);
    }
  }

  // EMPTY LINE after throws if return exists
  if (throwsTags.length > 0 && returnType !== undefined) {
    linesArr.push(" *");
  }

  // RETURN
  if (returnType !== undefined) {
    linesArr.push(
      ` * @return ${returnType}${returnDesc ? " " + returnDesc : ""}`
    );
  } else {
    linesArr.push(" * @return void");
  }

  // Ensure the last line is ' */' (with a space)
  let lastNonEmpty = linesArr.length - 1;
  while (lastNonEmpty >= 0 && linesArr[lastNonEmpty].trim() === "")
    lastNonEmpty--;
  const lastLine = linesArr[lastNonEmpty]?.trim();
  if (lastNonEmpty < 0 || lastLine !== "*/") {
    linesArr.push(" */");
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
    settings: old.settings,
    otherTags: old.otherTags,
  };
}
