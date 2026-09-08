import ts from 'typescript'

export type SourceReference = { line: number; kind: string; value: string | null }

/** Static change-review inventory, not proof of authorization or runtime reachability. */
export function inspectSource(path: string, text: string) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const references: SourceReference[] = []
  const imports = new Set<string>()
  let functions = 0
  const literal = (node: ts.Node | undefined): string | null => node && ts.isStringLiteralLike(node) ? node.text : null
  const add = (node: ts.Node, kind: string, value: string | null) => {
    references.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, value })
  }
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const value = literal(node.moduleSpecifier)
      if (value !== null) imports.add(value)
    }
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) functions++
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const value = literal(node.arguments[0])
        if (value !== null) imports.add(value)
        else add(node, 'dynamic-import', null)
      }
      if (ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression.getText(source)
        const method = node.expression.name.text
        if (['app', 'router'].includes(receiver) && ['use', 'get', 'post', 'put', 'patch', 'delete', 'all', 'options', 'head'].includes(method)) {
          add(node, `http:${receiver}.${method}`, literal(node.arguments[0]))
        }
        if (/(?:^|\.)(?:localStorage|sessionStorage)$/.test(receiver) && ['getItem', 'setItem', 'removeItem', 'clear'].includes(method)) {
          add(node, `storage:${receiver}.${method}`, literal(node.arguments[0]))
        }
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(source).replace(/^['"]|['"]$/g, '')
      if (name === 'path' && path.startsWith('src/app/')) add(node, 'ui-route', literal(node.initializer))
      if (name === 'name' && path.startsWith('api/lib/agent/tools/')) {
        const parent = node.parent.parent
        // Only top-level tool definitions, not arbitrary parameter properties also named "name".
        const typedDefinition = ts.isVariableDeclaration(parent) && parent.type?.getText(source).startsWith('AgentTool')
        const factoryDefinition = ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === 'defineTool'
        if (typedDefinition || factoryDefinition) add(node, 'agent-tool', literal(node.initializer))
      }
    }
    if (ts.isPropertySignature(node) && node.name.getText(source) === 'type' && node.type && ts.isLiteralTypeNode(node.type) && path.startsWith('shared/contracts/')) {
      add(node, 'contract-discriminant', literal(node.type.literal))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { lines: text.split(/\r?\n/).length, functions, imports: [...imports].sort(), references }
}
