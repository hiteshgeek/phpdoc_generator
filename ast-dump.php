<?php
require 'vendor/autoload.php';

use PhpParser\Error;
use PhpParser\Node;
use PhpParser\NodeTraverser;
use PhpParser\NodeVisitorAbstract;
use PhpParser\ParserFactory;

if ($argc < 2) {
    fwrite(STDERR, "Usage: php ast-dump.php <file.php>\n");
    exit(1);
}

$file = $argv[1];
$code = file_get_contents($file);

$parserFactory = new ParserFactory();
$parser = $parserFactory->createForNewestSupportedVersion();
try {
    $ast = $parser->parse($code);
} catch (Error $e) {
    fwrite(STDERR, "Parse error: {$e->getMessage()}\n");
    exit(2);
}

$functions = [];
$classMethods = [];

function collectFunctions($nodes, &$functions, &$classMethods, $parentClass = null)
{
    foreach ($nodes as $node) {
        if ($node instanceof Node\Stmt\Function_) {
            $functions[] = [
                'type' => 'function',
                'name' => $node->name->toString(),
                'startLine' => $node->getStartLine(),
                'endLine' => $node->getEndLine(),
                'params' => array_map(function ($p) {
                    return [
                        'name' => $p->var->name,
                        'type' => isset($p->type) ? typeNodeToString($p->type) : null
                    ];
                }, $node->params),
                'returnType' => isset($node->returnType) ? typeNodeToString($node->returnType) : null
            ];
            // Only recurse into stmts for nested functions
            if (isset($node->stmts)) {
                collectFunctions($node->stmts, $functions, $classMethods);
            }
            continue;
        } elseif ($node instanceof Node\Stmt\Class_ || $node instanceof Node\Stmt\Trait_ || $node instanceof Node\Stmt\Interface_) {
            $className = property_exists($node, 'name') && $node->name ? $node->name->toString() : null;
            foreach ($node->stmts as $stmt) {
                if ($stmt instanceof Node\Stmt\ClassMethod) {
                    $classMethods[] = [
                        'type' => 'method',
                        'class' => $className,
                        'name' => $stmt->name->toString(),
                        'startLine' => $stmt->getStartLine(),
                        'endLine' => $stmt->getEndLine(),
                        'params' => array_map(function ($p) {
                            return [
                                'name' => $p->var->name,
                                'type' => isset($p->type) ? typeNodeToString($p->type) : null
                            ];
                        }, $stmt->params),
                        'returnType' => isset($stmt->returnType) ? typeNodeToString($stmt->returnType) : null
                    ];
                    // Only recurse into stmts for nested functions in methods
                    if (isset($stmt->stmts)) {
                        collectFunctions($stmt->stmts, $functions, $classMethods);
                    }
                }
            }
            continue;
        }
        // Do not recurse into all subnodes for function/method nodes to avoid duplicates
        if (!($node instanceof Node\Stmt\Function_) && !($node instanceof Node\Stmt\ClassMethod)) {
            foreach ($node->getSubNodeNames() as $subNodeName) {
                $subNode = $node->$subNodeName;
                if (is_array($subNode)) {
                    collectFunctions($subNode, $functions, $classMethods, $parentClass);
                } elseif ($subNode instanceof Node) {
                    collectFunctions([$subNode], $functions, $classMethods, $parentClass);
                }
            }
        }
    }
}

function typeNodeToString($typeNode)
{
    if ($typeNode === null) return null;
    if ($typeNode instanceof Node\NullableType) {
        $inner = typeNodeToString($typeNode->type);
        return $inner ? ("?" . $inner) : null;
    }
    if ($typeNode instanceof Node\UnionType) {
        return implode('|', array_map('typeNodeToString', $typeNode->types));
    }
    if ($typeNode instanceof Node\IntersectionType) {
        return implode('&', array_map('typeNodeToString', $typeNode->types));
    }
    if ($typeNode instanceof Node\Identifier || $typeNode instanceof Node\Name) {
        return $typeNode->toString();
    }
    return null;
}

collectFunctions($ast, $functions, $classMethods);

$output = [
    'functions' => $functions,
    'classMethods' => $classMethods
];
echo json_encode($output, JSON_PRETTY_PRINT);
