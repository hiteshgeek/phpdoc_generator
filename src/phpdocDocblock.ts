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
  params = [],
  returnType,
  returnDesc,
  lines,
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

  // Canonical order for known tags
  const canonicalKnownTagOrder = ["@author", "@version", "@since"];

  // Parse summary lines
  let blockTypeLine =
    type && name ? `${type} ${name}` : name ? `function ${name}` : undefined;
  let summaryLines: string[] = [];
  if (summary && summary.trim()) {
    summaryLines = summary.split("\n").map((l) => l.trim());
    // Remove any existing block type line from summary
    if (
      blockTypeLine &&
      summaryLines.length > 0 &&
      summaryLines[0].toLowerCase().startsWith(blockTypeLine.toLowerCase())
    ) {
      summaryLines[0] = summaryLines[0].slice(blockTypeLine.length).trim();
      if (!summaryLines[0]) summaryLines.shift();
    }
  }

  // Parse preservedTags and otherTags, keeping order
  const allTags = (preservedTags || []).concat(otherTags || []);
  const paramTags: string[] = [];
  const returnTags: string[] = [];
  const knownTags: { tag: string; line: string }[] = [];
  const customTags: string[] = [];
  for (const tag of allTags) {
    const l = tag.replace(/^\s*\*?\s?/, "");
    if (l.startsWith("@param")) {
      paramTags.push(l);
    } else if (l.startsWith("@return")) {
      returnTags.push(l);
    } else if (canonicalKnownTagOrder.some((kt) => l.startsWith(kt))) {
      const match = l.match(/^(@\w+)/);
      knownTags.push({ tag: match ? match[1] : l, line: l });
    } else if (l.trim() !== "") {
      customTags.push(l);
    }
  }

  // --- 1. Block type line group ---
  const blockTypeGroup: string[] = [];
  if (blockTypeLine) blockTypeGroup.push(pad + ` * ${blockTypeLine}`);

  // --- 2. Summary group ---
  const summaryGroup: string[] = [];
  for (const line of summaryLines) {
    if (line.trim() !== "") summaryGroup.push(pad + ` * ${line}`);
  }

  // --- 3. Known tags group (author, version, since, etc.) ---
  const knownTagsGroup: string[] = [];
  const seenCanonical = new Set<string>();
  for (const canonicalTag of canonicalKnownTagOrder) {
    for (const entry of knownTags) {
      if (entry.tag === canonicalTag && !seenCanonical.has(canonicalTag)) {
        knownTagsGroup.push(pad + ` * ${entry.line}`);
        seenCanonical.add(canonicalTag);
      }
    }
  }

  // --- 4. Param group ---
  const paramLines: string[] = [];
  if (params && params.length > 0) {
    for (const p of params) {
      let desc = "";
      for (const tag of paramTags) {
        const match = tag.match(
          new RegExp(`@param\\s+[^\\s]+\\s+\\$${p.name}(\\s|$)(.*)`)
        );
        if (match) {
          desc = match[2] ? match[2].trim() : "";
          break;
        }
      }
      paramLines.push(
        pad +
          ` * @param ${p.type ? p.type : "mixed"} $${p.name}${
            desc ? " " + desc : ""
          }`
      );
    }
  }

  // --- 5. Return group ---
  let returnLine: string | undefined = undefined;
  // Always add @return for functions, even if void
  if (typeof returnType !== "undefined") {
    let desc = "";
    for (const tag of returnTags) {
      const match = tag.match(/@return\s+[^\s]+\s*(.*)/);
      if (match) {
        desc = match[1] ? match[1].trim() : "";
        break;
      }
    }
    returnLine = pad + ` * @return ${returnType}${desc ? " " + desc : ""}`;
  } else if (type === "function") {
    // If no returnType is provided, default to void
    returnLine = pad + " * @return void";
  }

  // --- 6. Custom tags group (preserved, not canonical) ---
  const customTagsGroup: string[] = [];
  const seenCustom = new Set<string>();
  for (const line of customTags) {
    if (!seenCustom.has(line)) {
      customTagsGroup.push(pad + ` * ${line}`);
      seenCustom.add(line);
    }
  }

  // --- 7. Assemble docblock with blank lines between groups ---
  const groups: string[][] = [];
  if (blockTypeGroup.length > 0) groups.push(blockTypeGroup);
  if (summaryGroup.length > 0) groups.push(summaryGroup);
  if (knownTagsGroup.length > 0) groups.push(knownTagsGroup);
  if (paramLines.length > 0) groups.push(paramLines);
  if (returnLine) groups.push([returnLine]);
  if (customTagsGroup.length > 0) groups.push(customTagsGroup);

  let docblockLines: string[] = [pad + "/**"];
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length > 0) {
      if (docblockLines.length > 1) docblockLines.push(pad + " *");
      docblockLines.push(...groups[i]);
    }
  }
  // Remove any accidental or stray closing lines before adding the final '*/'
  docblockLines = docblockLines.filter((line, idx) => {
    const trimmed = line.trim();
    if (idx === 0) return true;
    // Remove any line that is exactly '* /', '*/', or similar (except the last line)
    return trimmed !== "* /" && trimmed !== "*/" && trimmed !== "/";
  });
  // Remove any trailing blank line (i.e., a line that is just ' *') before the closing */
  while (
    docblockLines.length > 1 &&
    docblockLines[docblockLines.length - 1].trim() === "*"
  ) {
    docblockLines.pop();
  }
  // Only one closing */
  docblockLines.push(pad + " */");
  // Always autocorrect before returning
  return autocorrectDocblockLines(docblockLines);
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
