// This file is a copy of the .mts test, for compatibility with ts-node/register
import "mocha";
import { buildDocblock } from "../phpdocDocblock";
let expect: any;
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
    expect(docblock[1]).to.equal("     * function b"); // 5 spaces
    expect(docblock[2]).to.equal("     *");
    expect(docblock[3]).to.equal("     * @return void");
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
        .map((l, i) => ({ l, i }))
        .filter((x) => x.l.includes("@param"))
        .pop()?.i ?? -1;
    const idxReturn = docblock.findIndex((l) => l.includes("@return"));
    // There should be exactly one empty line between last param and @return
    let emptyLineCount = 0;
    for (let i = idxParam + 1; i < idxReturn; ++i) {
      if (docblock[i] === " *") emptyLineCount++;
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
    const idxThrows = docblock.findIndex((l) => l.includes("@throws"));
    const idxReturn = docblock.findIndex((l) => l.includes("@return"));
    // There should be exactly one empty line between throws and @return
    let emptyLineCount = 0;
    for (let i = idxThrows + 1; i < idxReturn; ++i) {
      if (docblock[i] === " *") emptyLineCount++;
    }
    expect(emptyLineCount).to.equal(1);
  });
});
