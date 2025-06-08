import { collectReturnTypesFromFunctionNode } from "../phpdocParser";
import * as PHPParser from "php-parser";

describe("collectReturnTypesFromFunctionNode", () => {
  const parser = new PHPParser.Engine({
    parser: { extractDoc: true },
    ast: { withPositions: true },
  });

  it("should infer int for top-level return in function a", () => {
    const code = `<?php
    function a() {
      function b() {
        function e(int $a, string $b) {
          function f() {}
          return [];
        }
      }
      function c() {}
      function d() {}
      return 123;
    }
    `;
    const ast = parser.parseCode(code, "");
    let fnNode: any = null;
    function findFn(node: any) {
      if (!node || typeof node !== "object") return;
      if (node.kind === "function" && node.name && node.name.name === "a")
        fnNode = node;
      for (const key in node) {
        if (node.hasOwnProperty(key)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach(findFn);
          else if (typeof child === "object" && child && child.kind)
            findFn(child);
        }
      }
    }
    findFn(ast);
    expect(fnNode).toBeTruthy();
    const types = collectReturnTypesFromFunctionNode(fnNode);
    expect(types.sort()).toEqual(["int"]);
  });

  it("should union all top-level returns (int, float, array, string)", () => {
    const code = `<?php
    function a() {
      return 123;
      return 123.4;
      return [];
      return "abc";
    }
    `;
    const ast = parser.parseCode(code, "");
    let fnNode: any = null;
    function findFn(node: any) {
      if (!node || typeof node !== "object") return;
      if (node.kind === "function" && node.name && node.name.name === "a")
        fnNode = node;
      for (const key in node) {
        if (node.hasOwnProperty(key)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach(findFn);
          else if (typeof child === "object" && child && child.kind)
            findFn(child);
        }
      }
    }
    findFn(ast);
    expect(fnNode).toBeTruthy();
    const types = collectReturnTypesFromFunctionNode(fnNode);
    expect(types.sort()).toEqual(["array", "float", "int", "string"]);
  });

  it("should ignore returns in nested functions", () => {
    const code = `<?php
    function a() {
      function b() { return 123.4; }
      return 123;
    }
    `;
    const ast = parser.parseCode(code, "");
    let fnNode: any = null;
    function findFn(node: any) {
      if (!node || typeof node !== "object") return;
      if (node.kind === "function" && node.name && node.name.name === "a")
        fnNode = node;
      for (const key in node) {
        if (node.hasOwnProperty(key)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach(findFn);
          else if (typeof child === "object" && child && child.kind)
            findFn(child);
        }
      }
    }
    findFn(ast);
    expect(fnNode).toBeTruthy();
    const types = collectReturnTypesFromFunctionNode(fnNode);
    expect(types.sort()).toEqual(["int"]);
  });
});
