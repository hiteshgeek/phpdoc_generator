import { describe, it, expect } from "@jest/globals";
import { parseDocblock, buildDocblock } from "../phpdocDocblock";

describe("Union Types Support", () => {
  it("should correctly parse union return types from docblock", () => {
    const docText = [
      "/**",
      " * Example function with a union return type",
      " * ",
      " * @param int $a First parameter",
      " * @param string $b Second parameter",
      " * ",
      " * @return int|string|null The return description",
      " */",
    ];

    const parsed = parseDocblock(docText);
    expect(parsed.returnType).toBe("int|string|null");
    expect(parsed.returnDesc).toBe("The return description");
  });

  it("should correctly generate docblock with union return type", () => {
    const docblock = buildDocblock({
      summary: "Example function with union return type",
      params: [
        { name: "a", type: "int", desc: "First parameter" },
        { name: "b", type: "string", desc: "Second parameter" },
      ],
      returnType: "int|string|null",
      returnDesc: "The return description",
      type: "function",
      name: "testFunction",
    });

    expect(docblock).toContain("/**");
    expect(docblock).toContain(
      " * @return int|string|null The return description"
    );
    // The closing tag should be " */", not "*/"
    expect(docblock.some((line) => line.endsWith(" */"))).toBe(true);

    // Check the formatting
    const returnLineIndex = docblock.findIndex((line) =>
      line.includes("@return int|string|null")
    );
    expect(returnLineIndex).toBeGreaterThan(0);
  });

  // Test for the bug where mixed was being converted to void
  it("should not convert mixed to void in return type", () => {
    const docblock = buildDocblock({
      summary: "Test function",
      params: [],
      returnType: "mixed",
      type: "function",
    });

    expect(docblock.some((line) => line.includes("@return mixed"))).toBe(true);
    expect(docblock.every((line) => !line.includes("@return void"))).toBe(true);
  });
});
