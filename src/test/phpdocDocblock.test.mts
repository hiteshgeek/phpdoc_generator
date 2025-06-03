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
      " * @return int The sum",
      " */",
    ];
    const parsed = parseDocblock(lines);
    console.log("DEBUG summary:", parsed.summary);
    expect(parsed.summary).to.include("Add two numbers");
    expect(parsed.params).to.have.length(2);
    expect(parsed.returnType).to.equal("int");
    const rebuilt = buildDocblock(parsed);
    expect(rebuilt).to.deep.equal(lines);
  });

  it("updates docblock params and preserves descriptions", () => {
    const old = parseDocblock([
      "/**",
      " * Add two numbers",
      " *",
      " * @param int $a The first number",
      " * @param int $b The second number",
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
    const rebuilt = buildDocblock(updated);
    expect(rebuilt).to.include(" * @param int $c");
    expect(rebuilt.join("\n")).to.include("The first number");
  });
});
