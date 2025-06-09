export * from "./phpdocDocblockParser";
export * from "./types/docblock";

import { DocblockInfo, ParamDoc } from "./types/docblock";
import * as vscode from "vscode";

// Utility: autocorrect docblock opening/closing lines
function autocorrectDocblockLines(lines: string[]): string[] {
  if (!lines || lines.length === 0) return lines;
  // Fix opening line
  if (!/^\s*\/\*\*\s*$/.test(lines[0])) lines[0] = "/**";
  // Fix closing line (find last non-empty line)
  let lastIdx = lines.length - 1;
  while (lastIdx > 0 && lines[lastIdx].trim() === "") lastIdx--;
  if (!/^\s*\*\/$/.test(lines[lastIdx])) lines[lastIdx] = " */";
  return lines;
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
  preservedTags = [], // <-- Added default for preservedTags
  padding = 0,
}: DocblockInfo & {
  name?: string;
  settings?: string[];
  type?: string;
  otherTags?: string[];
  preservedTags?: string[]; // <-- Added type for preservedTags
  padding?: number | string; // Accept string for whitespace
}): string[] {
  // DEBUG: Log the name and returnType used for docblock
  if (name) {
    // eslint-disable-next-line no-console
    console.log(
      `[phpdocDocblock] buildDocblock for '${name}', returnType='${returnType}'`
    );
  }

  const pad =
    typeof padding === "string"
      ? padding
      : padding > 0
      ? " ".repeat(padding)
      : "";

  // Helper to filter out any accidental or stray closing lines
  function filterNoClosing(line: string) {
    const trimmed = line.trim();
    return trimmed !== "*/" && trimmed !== " */" && trimmed !== "* /";
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
  // REMOVE the old: const groups: string[][] = [];
  // REMOVE all pushes to the old groups array here

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

  // 2. Settings and 3. Other tags (non-throws, non-canonical)
  // --- Merge settings and other known tags into a single group, but always output @settings last ---
  const canonicalKnownTagOrder = [
    "@author",
    "@version",
    "@since",
    // @settings intentionally omitted here
  ];
  const knownTagsRaw: {
    tag: string;
    line: string;
    isSettingsBlock?: boolean;
  }[] = [];
  // Add other known tags (non-throws, non-canonical)
  if (otherTags && otherTags.length > 0) {
    for (const tag of otherTags) {
      if (
        !tag.trim().startsWith("@throws") &&
        tag.trim() !== "" &&
        filterNoClosing(tag)
      ) {
        const match = tag.match(/^@(\w+)/);
        const tagName = match ? "@" + match[1] : "";
        knownTagsRaw.push({ tag: tagName, line: pad + " * " + tag });
      }
    }
  }
  // Add @settings block and its items as a separate group (always last among known tags)
  let settingsBlock: {
    tag: string;
    line: string;
    isSettingsBlock?: boolean;
  }[] = [];
  if (settings && settings.length > 0) {
    settingsBlock.push({
      tag: "@settings",
      line: pad + " * @settings",
      isSettingsBlock: true,
    });
    for (const s of settings) {
      if (filterNoClosing(s))
        settingsBlock.push({
          tag: "@settings",
          line: pad + " * - " + s,
          isSettingsBlock: true,
        });
    }
  }
  // Sort known tags canonically (excluding @settings), then append any unknowns at the end
  const knownTagsGroup: string[] = [];
  for (const canonicalTag of canonicalKnownTagOrder) {
    for (const entry of knownTagsRaw) {
      if (entry.tag === canonicalTag) knownTagsGroup.push(entry.line);
    }
  }
  // Add any other known tags not in the canonical list and not @settings
  for (const entry of knownTagsRaw) {
    if (
      !canonicalKnownTagOrder.includes(entry.tag) &&
      entry.tag !== "@settings"
    )
      knownTagsGroup.push(entry.line);
  }

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

  // 6. Throws
  const throwsGroup: string[] = [];
  if (throwsTags.length > 0) {
    for (const tag of throwsTags) {
      if (filterNoClosing(tag)) throwsGroup.push(pad + ` * ${tag}`);
    }
  }

  // 7. Return
  const returnGroup: string[] = [];
  if (type === "function" || type === "method" || typeof type === "undefined") {
    let effectiveReturnType = returnType;
    if (
      typeof effectiveReturnType !== "string" ||
      effectiveReturnType.trim() === ""
    ) {
      effectiveReturnType = "mixed";
    }
    const returnLine = `@return ${effectiveReturnType}${
      returnDesc ? " " + returnDesc : ""
    }`;
    if (filterNoClosing(returnLine)) returnGroup.push(pad + " * " + returnLine);
  }

  // --- Group docblock sections in canonical order ---
  const groups: string[][] = [];
  if (summaryGroup.length > 0) groups.push(summaryGroup);
  if (knownTagsGroup.length > 0) groups.push(knownTagsGroup); // all known tags together (author, version, since)
  if (preservedGroup.length > 0) groups.push(preservedGroup); // custom/unknown tags
  if (paramsGroup.length > 0) groups.push(paramsGroup);
  if (throwsGroup.length > 0) groups.push(throwsGroup);
  if (returnGroup.length > 0) groups.push(returnGroup);
  // Settings block must always be last, after all other groups
  if (settingsBlock.length > 0) {
    // Add a blank line before settings if there are any previous groups
    let settingsLines = settingsBlock.map((entry) => entry.line);
    if (groups.length > 0) settingsLines.unshift(pad + " *");
    groups.push(settingsLines);
  }
  // --- Assemble final docblock ---
  let docblockLines: string[] = [pad + "/**"];
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length > 0) {
      // Add a blank line between groups, but not before the first group
      if (docblockLines.length > 1) docblockLines.push(pad + " *");
      docblockLines.push(...groups[i]);
    }
  }
  // Always end with a single closing delimiter with proper space before */
  if (
    docblockLines[docblockLines.length - 1].trim() !== "*/" &&
    docblockLines[docblockLines.length - 1].trim() !== " */"
  ) {
    docblockLines.push(pad + " */");
  } else if (docblockLines[docblockLines.length - 1].trim() === "*/") {
    docblockLines[docblockLines.length - 1] = pad + " */";
  }
  // Remove any duplicate or stray closing lines except the last
  docblockLines = docblockLines.filter((line, idx) => {
    const trimmed = line.trim();
    if (idx === 0 || idx === docblockLines.length - 1) return true;
    return trimmed !== "*/" && trimmed !== "* /" && trimmed !== "/";
  });
  // Remove only empty lines at the very start (after /**) and very end (before */)
  while (docblockLines.length > 2 && docblockLines[1].trim() === "*")
    docblockLines.splice(1, 1);
  while (
    docblockLines.length > 2 &&
    docblockLines[docblockLines.length - 2].trim() === "*"
  )
    docblockLines.splice(docblockLines.length - 2, 1);
  // Collapse multiple consecutive empty lines (" *") into a single one
  let collapsed: string[] = [];
  for (let i = 0; i < docblockLines.length; i++) {
    if (
      docblockLines[i].trim() === "*" &&
      collapsed.length > 0 &&
      collapsed[collapsed.length - 1].trim() === "*"
    ) {
      continue; // skip extra blank lines
    }
    collapsed.push(docblockLines[i]);
  }
  docblockLines = collapsed;
  // Autocorrect docblock opening/closing lines before returning
  docblockLines = autocorrectDocblockLines(docblockLines);
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
  // Always set returnType to 'mixed' if falsy
  const safeReturnType = returnType && returnType.trim() ? returnType : "mixed";
  return {
    summary: old.summary,
    params,
    returnType: safeReturnType,
    returnDesc: old.returnDesc,
    settings: old.settings,
    otherTags: old.otherTags,
  };
}

// Add: build property docblock
export function buildPropertyDocblock({
  name,
  type,
  padding = 0,
}: {
  name: string;
  type?: string;
  padding?: number | string;
}): string[] {
  // Always generate a minimal PHPDoc property docblock:
  //   /**
  //    * @var type
  //    */
  // No summary, no property name, no extra blank lines.
  // This is enforced here and must not be changed for PHPDoc compliance.
  const pad =
    typeof padding === "string"
      ? padding
      : padding > 0
      ? " ".repeat(padding)
      : "";
  const docType = type && type.trim() !== "" ? type : "mixed";
  // Only a single @var tag, no summary or property name line
  return [pad + "/**", pad + ` * @var ${docType}`, pad + " */"];
}
