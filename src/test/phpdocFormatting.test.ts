import { describe, it, expect } from "@jest/globals";
import { buildDocblock } from "../phpdocDocblock";

describe("Docblock Formatting", () => {
  it("should format closing tag with a space before */", () => {
    const docblock = buildDocblock({
      summary: "Test function",
      params: [],
      returnType: "void",
      type: "function",
    });

    // Check that the last line ends with ' */' (space before */)
    expect(docblock[docblock.length - 1].endsWith(" */")).toBe(true);
  });

  it("should not insert newlines between summary/settings/author tags", () => {
    const docblock = buildDocblock({
      summary: "Test function with metadata",
      params: [],
      returnType: "void",
      type: "function",
      settings: ["SETTING_ONE", "SETTING_TWO"],
      otherTags: ["@author John Doe", "@version 1.0"],
    });

    // Find indexes of different elements
    const summaryLineIndex = docblock.findIndex((line) =>
      line.includes("Test function")
    );
    const settingsLineIndex = docblock.findIndex((line) =>
      line.includes("@settings")
    );
    const settingOneIndex = docblock.findIndex((line) =>
      line.includes("SETTING_ONE")
    );
    const authorLineIndex = docblock.findIndex((line) =>
      line.includes("@author")
    );

    // Should not have a blank line after summary and before @settings
    expect(docblock[summaryLineIndex + 1].trim()).not.toBe("*");

    // Should not have a blank line between @settings and its items
    expect(settingsLineIndex + 1).toBe(settingOneIndex);

    // Should not have a blank line between settings and @author
    const lastSettingIndex = docblock.findIndex((line) =>
      line.includes("SETTING_TWO")
    );
    expect(docblock[lastSettingIndex + 1].trim()).not.toBe("*");

    // Should have a blank line before @return
    const returnLineIndex = docblock.findIndex((line) =>
      line.includes("@return")
    );
    expect(docblock[returnLineIndex - 1].trim()).toBe("*");
  });

  it("should group param tags together without blank lines", () => {
    const docblock = buildDocblock({
      summary: "Test function",
      params: [
        { name: "a", type: "int", desc: "Parameter A" },
        { name: "b", type: "string", desc: "Parameter B" },
      ],
      returnType: "mixed",
      type: "function",
    });

    // Find indexes of param lines
    const paramAIndex = docblock.findIndex((line) =>
      line.includes("@param int $a")
    );
    const paramBIndex = docblock.findIndex((line) =>
      line.includes("@param string $b")
    );

    // Params should be consecutive with no blank lines between
    expect(paramBIndex - paramAIndex).toBe(1);

    // Should have a blank line before return
    const returnIndex = docblock.findIndex((line) => line.includes("@return"));
    expect(docblock[returnIndex - 1].trim()).toBe("*");
  });
});
