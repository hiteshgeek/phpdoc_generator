import { buildDocblock } from "../phpdocDocblock.js";
let expect: typeof import("chai").expect;
before(async () => {
  expect = (await import("chai")).expect;
});

describe("buildDocblock ending correctness", () => {
  it("should only end with a single '*/' and never with repeated or malformed endings", () => {
    const docblock = buildDocblock({
      summary: "",
      params: [],
      returnType: undefined,
      name: "SimpleTest",
      type: "class",
      settings: undefined,
    });
    expect(docblock[docblock.length - 1]).to.equal("*/");
    expect(docblock.filter((l) => l.trim() === "* /").length).to.equal(0);
    expect(docblock.filter((l) => l.trim() === "*/").length).to.equal(1);
  });

  it("should not duplicate block type line", () => {
    const docblock = buildDocblock({
      summary: "class SimpleTest\nThis is a test class.",
      params: [],
      returnType: undefined,
      name: "SimpleTest",
      type: "class",
      settings: undefined,
    });
    expect(
      docblock.filter((l) => l.includes("class SimpleTest")).length
    ).to.equal(1);
  });
});
