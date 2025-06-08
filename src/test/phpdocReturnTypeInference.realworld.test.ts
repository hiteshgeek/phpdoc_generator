import { collectReturnTypesFromFunctionNode } from '../phpdocParser';
import * as PHPParser from 'php-parser';

describe('collectReturnTypesFromFunctionNode - real user cases', () => {
  const parser = new PHPParser.Engine({
    parser: { extractDoc: true },
    ast: { withPositions: true },
  });

  it('should infer int for function a (only top-level return)', () => {
    const code = `<?php
function a() {
    $value_1 = 10;
    function b() {
        function e(int $a, string $b) {
            function f() {}
            return [];
        }
    }
    function c() {}
    function d() {}
    // return $value_1;
    return 123;
    // return 123.4;
    // return [];
    // return "abc";
}
`;
    const ast = parser.parseCode(code, '');
    let fnNode: any = null;
    function findFn(node: any) {
      if (!node || typeof node !== 'object') return;
      if (node.kind === 'function' && node.name && node.name.name === 'a') fnNode = node;
      for (const key in node) {
        if (node.hasOwnProperty(key)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach(findFn);
          else if (typeof child === 'object' && child && child.kind) findFn(child);
        }
      }
    }
    findFn(ast);
    expect(fnNode).toBeTruthy();
    const types = collectReturnTypesFromFunctionNode(fnNode);
    expect(types.sort()).toEqual(['int']);
  });

  it('should union all top-level returns for function a (uncomment all)', () => {
    const code = `<?php
function a() {
    $value_1 = 10;
    function b() {
        function e(int $a, string $b) {
            function f() {}
            return [];
        }
    }
    function c() {}
    function d() {}
    return $value_1;
    return 123;
    return 123.4;
    return [];
    return "abc";
}
`;
    const ast = parser.parseCode(code, '');
    let fnNode: any = null;
    function findFn(node: any) {
      if (!node || typeof node !== 'object') return;
      if (node.kind === 'function' && node.name && node.name.name === 'a') fnNode = node;
      for (const key in node) {
        if (node.hasOwnProperty(key)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach(findFn);
          else if (typeof child === 'object' && child && child.kind) findFn(child);
        }
      }
    }
    findFn(ast);
    expect(fnNode).toBeTruthy();
    const types = collectReturnTypesFromFunctionNode(fnNode);
    // $value_1 is a variable, so type is mixed
    expect(types.sort()).toEqual(['array', 'float', 'int', 'mixed', 'string']);
  });

  it('should union all top-level returns and throws for function add', () => {
    const code = `<?php
function add(float $a, float $b)
{
    if ($a) {
        return true;
    } else if ($a > $b) {
        return [];
    } else {
        return "abc";
    }
    throw new Exception("An error occurred");
    throw new ArithmeticError("Arithmetic error occurred");
    throw new DateMalformedStringException("Malformed date string");
    getSettings("IS_OUTLET_ENABLE");
    try {
        // some code
    } catch (Exception $e) {
        // handle exception
    }
    return new Exception();
}
`;
    const ast = parser.parseCode(code, '');
    let fnNode: any = null;
    function findFn(node: any) {
      if (!node || typeof node !== 'object') return;
      if (node.kind === 'function' && node.name && node.name.name === 'add') fnNode = node;
      for (const key in node) {
        if (node.hasOwnProperty(key)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach(findFn);
          else if (typeof child === 'object' && child && child.kind) findFn(child);
        }
      }
    }
    findFn(ast);
    expect(fnNode).toBeTruthy();
    const types = collectReturnTypesFromFunctionNode(fnNode);
    expect(types.sort()).toEqual([
      'ArithmeticError',
      'DateMalformedStringException',
      'Exception',
      'array',
      'bool',
      'string'
    ]);
  });

  it('should use declared return type for multiple_return_example', () => {
    const code = `<?php
function multiple_return_example(array $data, int|string $userId, bool $isTest): string|int|array
{
    if ($a) {
        return [];
    } else if (1) {
        return "asd";
    }
    return 3.54;
}
`;
    const ast = parser.parseCode(code, '');
    let fnNode: any = null;
    function findFn(node: any) {
      if (!node || typeof node !== 'object') return;
      if (node.kind === 'function' && node.name && node.name.name === 'multiple_return_example') fnNode = node;
      for (const key in node) {
        if (node.hasOwnProperty(key)) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach(findFn);
          else if (typeof child === 'object' && child && child.kind) findFn(child);
        }
      }
    }
    findFn(ast);
    expect(fnNode).toBeTruthy();
    // Should not infer, but use declared type
    expect(fnNode.type).toBeTruthy();
    // The extension should use fnNode.type.raw or .types for docblock
  });
});
