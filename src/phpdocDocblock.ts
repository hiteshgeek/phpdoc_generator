export * from "./phpdocDocblockParser";
export * from "./types/docblock";

import { DocblockInfo, ParamDoc } from "./types/docblock";

export function buildDocblock({
  summary,
  params,
  returnType,
  returnDesc,
  name,
  settings,
  type,
  otherTags = [],
  preservedTags = [],
  padding = 0,
}: DocblockInfo & {
  name?: string;
  settings?: string[];
  type?: string;
  otherTags?: string[];
  preservedTags?: string[];
  padding?: number | string;
}): string[] {
  const pad =
    typeof padding === "string"
      ? padding
      : padding > 0
      ? " ".repeat(padding)
      : "";

  // Helper to filter out any accidental or stray closing lines
  function filterNoClosing(line: string) {
    const trimmed = line.trim();
    return trimmed !== "*/" && trimmed !== "* /";
  }

  // Build blockTypeLine with leading space to match expected format
  const blockTypeLine =
    type && name
      ? ` * ${type} ${name}`
      : name
      ? ` * function ${name}`
      : undefined;
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

  // Separate otherTags into throws and non-throws
  const throwsTags = (otherTags || []).filter((tag) =>
    tag.trim().startsWith("@throws")
  );
  const nonThrowsTags = (otherTags || []).filter(
    (tag) => !tag.trim().startsWith("@throws")
  );

  // --- Grouped docblock construction for canonical blank lines ---
  const groups: string[][] = [];

  // 1. Summary and block type line
  const summaryGroup: string[] = [];
  if (blockTypeLine && filterNoClosing(blockTypeLine))
    summaryGroup.push(pad + blockTypeLine);
  for (let i = 0; i < summaryLines.length; i++) {
    if (i === 0 && summaryLines[0] === blockTypeLine && blockTypeLineAdded)
      continue;
    if (summaryLines[i].trim() !== "" && filterNoClosing(summaryLines[i]))
      summaryGroup.push(pad + " * " + summaryLines[i]);
  }
  if (summaryGroup.length > 0) groups.push(summaryGroup);

  // 2. Settings
  const settingsGroup: string[] = [];
  if (settings && settings.length > 0) {
    settingsGroup.push(pad + " * @settings");
    for (const s of settings) {
      if (filterNoClosing(s)) settingsGroup.push(pad + " * - " + s);
    }
  }
  if (settingsGroup.length > 0) groups.push(settingsGroup);

  // 3. Other tags (non-throws, non-canonical)
  const otherTagsGroup: string[] = [];
  if (nonThrowsTags.length > 0) {
    for (const tag of nonThrowsTags) {
      if (tag.trim() !== "" && filterNoClosing(tag))
        otherTagsGroup.push(pad + " * " + tag);
    }
  }
  if (otherTagsGroup.length > 0) groups.push(otherTagsGroup);

  // 4. Preserved tags (custom/unknown, not canonical)
  const preservedGroup: string[] = [];
  if (Array.isArray(preservedTags) && preservedTags.length > 0) {
    for (const tagLine of preservedTags) {
      const l = tagLine.replace(/^\s*\*\s?/, "");
      if (
        l.startsWith("@param") ||
        l.startsWith("@throws") ||
        l.startsWith("@return") ||
        l.startsWith("@settings") ||
        l.startsWith("@var")
      ) {
        continue; // skip canonical tags
      }
      if (l.trim() !== "" && filterNoClosing(l))
        preservedGroup.push(pad + " * " + l);
    }
  }
  if (preservedGroup.length > 0) groups.push(preservedGroup);

  // 5. Params
  const paramsGroup: string[] = [];
  if (params.length > 0) {
    for (const p of params) {
      const paramLine = `@param ${p.type ? p.type : "mixed"} $${p.name}${
        p.desc ? " " + p.desc : ""
      }`;
      if (filterNoClosing(paramLine)) paramsGroup.push(pad + " * " + paramLine);
    }
  }
  if (paramsGroup.length > 0) groups.push(paramsGroup);

  // 6. Throws
  const throwsGroup: string[] = [];
  if (throwsTags.length > 0) {
    for (const tag of throwsTags) {
      if (filterNoClosing(tag)) throwsGroup.push(pad + ` * ${tag}`);
    }
  }
  if (throwsGroup.length > 0) groups.push(throwsGroup);

  // 7. Return
  const returnGroup: string[] = [];
  if (returnType !== undefined) {
    const returnLine = `@return ${returnType}${
      returnDesc ? " " + returnDesc : ""
    }`;
    if (filterNoClosing(returnLine)) returnGroup.push(pad + " * " + returnLine);
  } else {
    returnGroup.push(pad + " * @return void");
  }
  if (returnGroup.length > 0) groups.push(returnGroup);

  // --- Assemble final docblock ---
  let docblockLines: string[] = [pad + "/**"];
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length === 0) continue;
    // Always insert a blank line before @return except if it's the very first group
    if (
      i > 0 &&
      groups[i][0].includes("@return") &&
      docblockLines[docblockLines.length - 1] !== pad + " *"
    ) {
      docblockLines.push(pad + " *");
    }
    // Otherwise, only insert blank line if previous group is not settings or return
    else if (
      i > 0 &&
      !groups[i][0].includes("@return") &&
      !groups[i - 1][0].includes("@settings") &&
      docblockLines[docblockLines.length - 1] !== pad + " *"
    ) {
      docblockLines.push(pad + " *");
    }
    for (const line of groups[i]) {
      docblockLines.push(line);
    }
  }
  // Remove any accidental closing delimiters except the last line
  docblockLines = docblockLines.filter((line, idx) => {
    const trimmed = line.trim();
    if (idx === docblockLines.length - 1) return true; // always keep last line
    return trimmed !== "*/" && trimmed !== "* /";
  });
  docblockLines.push(pad + " */");
  return docblockLines;
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
