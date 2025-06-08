import { buildDocblock } from "../phpdocDocblock.js";
import { parseDocblock } from "../phpdocDocblockParser.js";
let expect: typeof import("chai").expect;
before(async () => {
  expect = (await import("chai")).expect;
});

describe("phpdocDocblock indentation and spacing", () => {
  it("should indent docblock to match function indentation (4 spaces)", () => {
    const docblock = buildDocblock({
      summary: "",
      params: [],
      returnType: "void",
      name: "b",
      type: "function",
      padding: 4,
    });
    expect(docblock[0]).to.equal("    /**");
    expect(docblock[1]).to.equal("    * function b") ||
      expect(docblock[1]).to.equal("    * function b");
    expect(docblock[2]).to.equal("    *");
    expect(docblock[3]).to.equal("    * @return void");
    expect(docblock[4]).to.equal("    */");
  });

  it("should add empty line before @return if there are params", () => {
    const docblock = buildDocblock({
      summary: "",
      params: [
        { name: "a", type: "int" },
        { name: "b", type: "int" },
      ],
      returnType: "int",
      name: "add",
      type: "function",
      padding: 0,
    });
    // Find the last @param and the @return
    const idxParam =
      docblock
        .map((l: string, i: number) => ({ l, i }))
        .filter((x: { l: string; i: number }) => x.l.includes("@param"))
        .pop()?.i ?? -1;
    const idxReturn = docblock.findIndex((l: string) => l.includes("@return"));
    // There should be exactly one empty line between last param and @return
    let emptyLineCount = 0;
    for (let i = idxParam + 1; i < idxReturn; ++i) {
      if (docblock[i].trim() === "*") emptyLineCount++;
    }
    expect(emptyLineCount).to.equal(1);
  });

  it("should add empty line before @return if there are throws", () => {
    const docblock = buildDocblock({
      summary: "",
      params: [],
      returnType: "void",
      name: "foo",
      type: "function",
      otherTags: ["@throws Exception"],
      padding: 0,
    });
    expect(docblock).to.include("*"); // empty line (no space for padding 0)
    const idxThrows = docblock.findIndex((l: string) => l.includes("@throws"));
    const idxReturn = docblock.findIndex((l: string) => l.includes("@return"));
    // There should be exactly one empty line between throws and @return
    let emptyLineCount = 0;
    for (let i = idxThrows + 1; i < idxReturn; ++i) {
      if (docblock[i].trim() === "*") emptyLineCount++;
    }
    expect(emptyLineCount).to.equal(1);
  });

  it("should be idempotent and preserve indentation/padding after multiple generations", () => {
    const initial = buildDocblock({
      summary: "Adds two numbers and throws if invalid",
      params: [
        { name: "a", type: "int" },
        { name: "b", type: "int" },
      ],
      returnType: "int",
      name: "add",
      type: "function",
      otherTags: ["@throws Exception"],
      padding: 2,
    });
    // First generation
    const first = buildDocblock({ ...parseDocblock(initial), padding: 2 });
    // Second generation
    const second = buildDocblock({ ...parseDocblock(first), padding: 2 });
    // Third generation
    const third = buildDocblock({ ...parseDocblock(second), padding: 2 });
    // All generations should be identical
    expect(first).to.deep.equal(second);
    expect(second).to.deep.equal(third);
    // Check indentation and empty lines
    expect(first[0]).to.equal("  /**");
    expect(first[first.length - 1]).to.equal("  */");
    // There should be exactly one empty line before @return if there are params or throws
    const hasParams = first.some((l: string) => l.includes("@param"));
    const hasThrows = first.some((l: string) => l.includes("@throws"));
    if (hasParams || hasThrows) {
      const idxParam =
        first
          .map((l: string, i: number) => ({ l, i }))
          .filter((x: { l: string; i: number }) => x.l.includes("@param"))
          .pop()?.i ?? -1;
      const idxThrows = first.findIndex((l: string) => l.includes("@throws"));
      const idxReturn = first.findIndex((l: string) => l.includes("@return"));
      let emptyLineCount = 0;
      for (let i = Math.max(idxParam, idxThrows) + 1; i < idxReturn; ++i) {
        if (first[i].trim() === "*") emptyLineCount++;
      }
      expect(emptyLineCount).to.equal(1);
    }
  });

  it("should generate and preserve class docblock with block type line", () => {
    const initial = buildDocblock({
      summary: "",
      params: [],
      name: "OrderProcessor",
      type: "class",
      padding: 0,
    });
    // First generation
    const first = buildDocblock({
      ...parseDocblock(initial),
      name: "OrderProcessor",
      type: "class",
      padding: 0,
    });
    // Second generation
    const second = buildDocblock({
      ...parseDocblock(first),
      name: "OrderProcessor",
      type: "class",
      padding: 0,
    });
    // Third generation
    const third = buildDocblock({
      ...parseDocblock(second),
      name: "OrderProcessor",
      type: "class",
      padding: 0,
    });
    // All generations should be identical
    expect(first).to.deep.equal(second);
    expect(second).to.deep.equal(third);
    // Should contain the block type line
    expect(first).to.include("* class OrderProcessor");
    // Should not be empty or malformed
    expect(first[0]).to.equal("/**");
    expect(first[first.length - 1]).to.equal("*/");
  });
});
