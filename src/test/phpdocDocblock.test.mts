import {
  parseDocblock,
  buildDocblock,
  updateDocblock,
} from "../phpdocDocblock.js";
let expect: typeof import("chai").expect;
before(async () => {
  expect = (await import("chai")).expect;
});

describe("phpdocDocblock", () => {
  it("parses and builds docblock", () => {
    const lines = [
      "/**",
      " * Add two numbers",
      " *",
      " * @param int $a The first number",
      " * @param int $b The second number",
      " *",
      " * @return void",
      " */",
    ];
    const parsed = parseDocblock(lines);
    expect(parsed.summary).to.include("Add two numbers");
    expect(parsed.params).to.have.length(2);
    expect(parsed.returnType).to.equal("void");
    const rebuilt = buildDocblock({ ...parsed, padding: 0 });
    expect(rebuilt).to.deep.equal(lines);
  });

  it("updates docblock params and preserves descriptions", () => {
    const old = parseDocblock([
      "/**",
      " * Add two numbers",
      " *",
      " * @param int $a The first number",
      " * @param int $b The second number",
      " *",
      " * @return int The sum",
      " */",
    ]);
    const updated = updateDocblock(
      old,
      [
        { name: "a", type: "int" },
        { name: "b", type: "int" },
        { name: "c", type: "int" },
      ],
      "int"
    );
    const rebuilt = buildDocblock({ ...updated, padding: 0 });
    expect(rebuilt).to.include(" * @param int $c");
    expect(rebuilt.join("\n")).to.include("The first number");
  });

  // Test property docblock generation with @var
  it("generates @var docblock for all class properties", () => {
    // Simulate a class property block
    const propertyBlocks = [
      { name: "orderId", type: "int" },
      { name: "orderId1", type: "int" },
      { name: "orderId2", type: "int" },
      { name: "orderId3", type: "int" },
      { name: "orderId4", type: "mixed" }, // no type specified
    ];
    for (const prop of propertyBlocks) {
      const docblock = buildDocblock({
        summary: "",
        params: [],
        returnType: undefined,
        name: prop.name,
        type: "property",
        otherTags: [`@var ${prop.type} $${prop.name}`],
        padding: 0,
      });
      // Should contain a @var tag for the property
      expect(
        docblock.some((l) => l.includes(`@var ${prop.type} $${prop.name}`))
      ).to.be.true;
    }
  });
});
