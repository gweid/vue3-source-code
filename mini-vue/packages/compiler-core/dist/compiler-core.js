// packages/compiler-core/src/runtimeHelpers.ts
var TO_DISPLAY_STRING = Symbol("TO_DISPLAY_STRING");
var CREATE_TEXT_VNODE = Symbol("CREATE_TEXT_VNODE");
var CREATE_ELEMENT_VNODE = Symbol("CREATE_ELEMENT_VNODE");
var OPEN_BLOCK = Symbol("OPEN_BLOCK");
var CREATE_ELEMENT_BLOCK = Symbol("CREATE_ELEMENT_BLOCK");
var Fragment = Symbol("Fragment");
var helperNameMap = {
  [TO_DISPLAY_STRING]: "toDisplayString",
  [CREATE_TEXT_VNODE]: "createTextVnode",
  [CREATE_ELEMENT_VNODE]: "createElementVnode",
  [CREATE_ELEMENT_BLOCK]: "createElementBlock",
  [OPEN_BLOCK]: "openBlock",
  [Fragment]: "Fragment"
};

// packages/compiler-core/src/ast.ts
function createCallExpression(context, args) {
  let name = context.helper(CREATE_TEXT_VNODE);
  return {
    // createTextVnode()
    type: 14 /* JS_CALL_EXPRESSION */,
    arguments: args,
    // createTextVnode(child,1)
    callee: name
  };
}
function createVnodeCall(context, tag, props, children) {
  let name;
  if (tag !== Fragment) {
    name = context.helper(CREATE_ELEMENT_VNODE);
  }
  return {
    // createTextVnode()
    type: 13 /* VNODE_CALL */,
    callee: name,
    tag,
    props,
    children
  };
}
function createObjectExpression(properies) {
  return {
    type: 15 /* JS_OBJECT_EXPRESSION */,
    properies
  };
}

// packages/compiler-core/src/parser.ts
function createParserContext(content) {
  return {
    originalSource: content,
    source: content,
    // 字符串会不停的减少(匹配上，处理后就删除匹配到的)
    line: 1,
    column: 1,
    offset: 0
  };
}
function isEnd(context) {
  const c = context.source;
  if (c.startsWith("</")) {
    return true;
  }
  return !c;
}
function advancePositionMutation(context, c, endIndex) {
  let linesCount = 0;
  let linePos = -1;
  for (let i = 0; i < endIndex; i++) {
    if (c.charCodeAt(i) == 10) {
      linesCount++;
      linePos = i;
    }
  }
  context.offset += endIndex;
  context.line += linesCount;
  context.column = linePos == -1 ? context.column + endIndex : endIndex - linePos;
}
function advanceBy(context, endIndex) {
  let c = context.source;
  advancePositionMutation(context, c, endIndex);
  context.source = c.slice(endIndex);
}
function parseTextData(context, endIndex) {
  const content = context.source.slice(0, endIndex);
  advanceBy(context, endIndex);
  return content;
}
function getCursor(context) {
  let { line, column, offset } = context;
  return { line, column, offset };
}
function parseText(context) {
  let tokens = ["<", "{{"];
  let endIndex = context.source.length;
  for (let i = 0; i < tokens.length; i++) {
    const index = context.source.indexOf(tokens[i], 1);
    if (index !== -1 && endIndex > index) {
      endIndex = index;
    }
  }
  let start = getCursor(context);
  let content = parseTextData(context, endIndex);
  return {
    type: 2 /* TEXT */,
    content,
    loc: getSelection(context, start)
  };
}
function getSelection(context, start, e) {
  let end = e || getCursor(context);
  return {
    start,
    end,
    source: context.originalSource.slice(start.offset, end.offset)
  };
}
function parseInterpolation(context) {
  const start = getCursor(context);
  const closeIndex = context.source.indexOf("}}", 2);
  advanceBy(context, 2);
  const innerStart = getCursor(context);
  const innerEnd = getCursor(context);
  const preTrimContent = parseTextData(context, closeIndex - 2);
  const content = preTrimContent.trim();
  const startOffset = preTrimContent.indexOf(content);
  if (startOffset > 0) {
    advancePositionMutation(innerStart, preTrimContent, startOffset);
  }
  const endOffset = startOffset + content.length;
  advancePositionMutation(innerEnd, preTrimContent, endOffset);
  advanceBy(context, 2);
  return {
    type: 5 /* INTERPOLATION */,
    content: {
      type: 4 /* SIMPLE_EXPRESSION */,
      isStatic: false,
      isConstant: false,
      content,
      loc: getSelection(context, innerStart, innerEnd)
    },
    loc: getSelection(context, start)
  };
}
function advanceSpaces(context) {
  const match = /^[ \t\r\n]+/.exec(context.source);
  if (match) {
    advanceBy(context, match[0].length);
  }
}
function parseAttributeValue(context) {
  let quote = context.source[0];
  const isQuoted = quote === '"' || quote === "'";
  let content;
  if (isQuoted) {
    advanceBy(context, 1);
    const endIndex = context.source.indexOf(quote, 1);
    content = parseTextData(context, endIndex);
    advanceBy(context, 1);
  } else {
    content = context.source.match(/([^ \t\r\n/>])+/)[1];
    advanceBy(context, content.length);
    advanceSpaces(context);
  }
  return content;
}
function parseAttribute(context) {
  const start = getCursor(context);
  let match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source);
  const name = match[0];
  let value;
  advanceBy(context, name.length);
  if (/^[\t\r\n\f ]*=/.test(context.source)) {
    advanceSpaces(context);
    advanceBy(context, 1);
    advanceSpaces(context);
    value = parseAttributeValue(context);
  }
  let loc = getSelection(context, start);
  return {
    type: 6 /* ATTRIBUTE */,
    name,
    value: {
      type: 2 /* TEXT */,
      content: value,
      loc
    },
    loc: getSelection(context, start)
  };
}
function parseAtrributes(context) {
  const props = [];
  while (context.source.length > 0 && !context.source.startsWith(">")) {
    props.push(parseAttribute(context));
    advanceSpaces(context);
  }
  return props;
}
function parseTag(context) {
  const start = getCursor(context);
  const match = /^<\/?([a-z][^ \t\r\n/>]*)/.exec(context.source);
  const tag = match[1];
  advanceBy(context, match[0].length);
  advanceSpaces(context);
  let props = parseAtrributes(context);
  const isSelfClosing = context.source.startsWith("/>");
  advanceBy(context, isSelfClosing ? 2 : 1);
  return {
    type: 1 /* ELEMENT */,
    tag,
    isSelfClosing,
    loc: getSelection(context, start),
    // 开头标签解析后的信息
    props
  };
}
function parseElement(context) {
  const ele = parseTag(context);
  const children = parseChilren(context);
  if (context.source.startsWith("</")) {
    parseTag(context);
  }
  ele.children = children;
  ele.loc = getSelection(context, ele.loc.start);
  return ele;
}
function parseChilren(context) {
  const nodes = [];
  while (!isEnd(context)) {
    const c = context.source;
    let node;
    if (c.startsWith("{{")) {
      node = parseInterpolation(context);
    } else if (c[0] === "<") {
      node = parseElement(context);
    } else {
      node = parseText(context);
    }
    nodes.push(node);
  }
  for (let i = 0; i < nodes.length; i++) {
    let node = nodes[i];
    if (node.type === 2 /* TEXT */) {
      if (!/[^\t\r\n\f ]/.test(node.content)) {
        nodes[i] = null;
      } else {
        node.content = node.content.replace(/[\t\r\n\f ]+/g, " ");
      }
    }
  }
  return nodes.filter(Boolean);
}
function createRoot(children) {
  return {
    type: 0 /* ROOT */,
    children
  };
}
function parse(template) {
  const context = createParserContext(template);
  return createRoot(parseChilren(context));
}

// packages/compiler-core/src/transform.ts
function isText(node) {
  return node.type === 5 /* INTERPOLATION */ || node.type === 2 /* TEXT */;
}
function transformElement(node, context) {
  if (1 /* ELEMENT */ == node.type) {
    return function() {
      let { tag, props, children } = node;
      let vnodeTag = tag;
      let properties = [];
      for (let i = 0; i < props.length; i++) {
        properties.push({ key: props[i].name, value: props[i].value.content });
      }
      const propsExpression = properties.length > 0 ? createObjectExpression(properties) : null;
      let vnodeChildren = null;
      if (children.length == 1) {
        vnodeChildren = children[0];
      } else if (children.length > 1) {
        vnodeChildren = children;
      }
      node.codegenNode = createVnodeCall(
        context,
        vnodeTag,
        propsExpression,
        vnodeChildren
      );
    };
  }
}
function transformText(node, context) {
  if (1 /* ELEMENT */ == node.type || node.type === 0 /* ROOT */) {
    return function() {
      const children = node.children;
      let container = null;
      let hasText = false;
      for (let i = 0; i < children.length; i++) {
        let child = children[i];
        if (isText(child)) {
          hasText = true;
          for (let j = i + 1; j < children.length; j++) {
            const next = children[j];
            if (isText(next)) {
              if (!container) {
                container = children[i] = {
                  type: 8 /* COMPOUND_EXPRESSION */,
                  children: [child]
                };
              }
              container.children.push(`+`, next);
              children.splice(j, 1);
              j--;
            } else {
              container = null;
              break;
            }
          }
        }
      }
      if (!hasText || children.length == 1) {
        return;
      }
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isText(child) || child.type === 8 /* COMPOUND_EXPRESSION */) {
          const args = [];
          args.push(child);
          if (child.type !== 2 /* TEXT */) {
            args.push(1 /* TEXT */);
          }
          children[i] = {
            type: 12 /* TEXT_CALL */,
            // createTextVnode
            content: child,
            codegenNode: createCallExpression(context, args)
            // createTextVnode(内容，args)
          };
        }
      }
    };
  }
}
function transformExpression(node, context) {
  if (5 /* INTERPOLATION */ == node.type) {
    node.content.content = `_ctx.${node.content.content}`;
  }
}
function createTransformContext(root) {
  const context = {
    currentNode: root,
    parent: null,
    // 先序，后序
    // 元素 -> 文本 -> 表达式，在遍历节点的时候，会遍历这个数组，顺序逐一调用
    // 最后，转换为带有 createElementVnode、createTextVnode、toDisplayString 等的 render 函数
    transformNode: [transformElement, transformText, transformExpression],
    helpers: /* @__PURE__ */ new Map(),
    // createElementVnode 1
    helper(name) {
      let count = context.helpers.get(name) || 0;
      context.helpers.set(name, count + 1);
      return name;
    },
    removeHelper(name) {
      let count = context.helpers.get(name);
      if (count) {
        let c = count - 1;
        if (!c) {
          context.helpers.delete(name);
        } else {
          context.helpers.set(name, c);
        }
      }
    }
  };
  return context;
}
function traverseNode(node, context) {
  context.currentNode = node;
  const transforms = context.transformNode;
  const exits = [];
  for (let i2 = 0; i2 < transforms.length; i2++) {
    let exit = transforms[i2](node, context);
    exit && exits.push(exit);
  }
  switch (node.type) {
    case 0 /* ROOT */:
    case 1 /* ELEMENT */:
      for (let i2 = 0; i2 < node.children.length; i2++) {
        context.parent = node;
        traverseNode(node.children[i2], context);
      }
      break;
    case 5 /* INTERPOLATION */:
      context.helper(TO_DISPLAY_STRING);
      break;
  }
  context.currentNode = node;
  let i = exits.length;
  if (i > 0) {
    while (i--) {
      exits[i]();
    }
  }
}
function createRootCodegenNode(ast, context) {
  let { children } = ast;
  if (children.length == 1) {
    let child = children[0];
    if (child.type === 1 /* ELEMENT */) {
      ast.codegenNode = child.codegenNode;
      context.removeHelper(CREATE_ELEMENT_VNODE);
      context.helper(CREATE_ELEMENT_BLOCK);
      context.helper(OPEN_BLOCK);
      ast.codegenNode.isBlock = true;
    } else {
      ast.codegenNode = child;
    }
  } else if (children.length > 0) {
    ast.codegenNode = createVnodeCall(
      context,
      context.helper(Fragment),
      void 0,
      children
    );
    context.helper(CREATE_ELEMENT_BLOCK);
    context.helper(OPEN_BLOCK);
    ast.codegenNode.isBlock = true;
  }
}
function transform(ast) {
  const context = createTransformContext(ast);
  traverseNode(ast, context);
  createRootCodegenNode(ast, context);
  ast.helpers = [...context.helpers.keys()];
}

// packages/compiler-core/src/index.ts
function createCodegenContext(ast) {
  const context = {
    code: ``,
    level: 0,
    helper(name) {
      return "_" + helperNameMap[name];
    },
    push(code) {
      context.code += code;
    },
    indent() {
      newLine(++context.level);
    },
    deindent(noNewLine = false) {
      if (noNewLine) {
        --context.level;
      } else {
        newLine(--context.level);
      }
    },
    newLine() {
      newLine(context.level);
    }
  };
  function newLine(n) {
    context.push("\n" + `  `.repeat(n));
  }
  return context;
}
function genFunctionPreamble(ast, context) {
  const { push, indent, deindent, newLine } = context;
  if (ast.helpers.length > 0) {
    console.log(ast.helpers);
    push(
      `const {${ast.helpers.map(
        (item) => `${helperNameMap[item]}:${context.helper(item)}`
      )}} = Vue`
    );
    newLine();
  }
  push(`return function render(_ctx){`);
}
function genText(node, context) {
  context.push(JSON.stringify(node.content));
}
function genInterpolation(node, context) {
  const { push, indent, deindent, newLine, helper } = context;
  push(`${helper(TO_DISPLAY_STRING)}(`);
  genNode(node.content, context);
  push(`)`);
}
function genExpression(node, context) {
  context.push(node.content);
}
function genVnodeCall(node, context) {
  const { push, indent, deindent, newLine, helper } = context;
  const { tag, props, children, isBlock } = node;
  if (node.isBlock) {
    push(`(${helper(OPEN_BLOCK)}(),`);
  }
  const h = isBlock ? CREATE_ELEMENT_BLOCK : CREATE_ELEMENT_VNODE;
  push(`${helper(h)}(`);
  [tag, props, children];
  if (node.isBlock) {
    push(`)`);
  }
  push(`)`);
}
function genNode(node, context) {
  const { push, indent, deindent, newLine } = context;
  switch (node.type) {
    case 2 /* TEXT */:
      genText(node, context);
      break;
    case 5 /* INTERPOLATION */:
      genInterpolation(node, context);
      break;
    case 4 /* SIMPLE_EXPRESSION */:
      genExpression(node, context);
      break;
    case 13 /* VNODE_CALL */:
      genVnodeCall(node, context);
      break;
  }
}
function generate(ast) {
  const context = createCodegenContext(ast);
  genFunctionPreamble(ast, context);
  const { push, indent, deindent, newLine } = context;
  indent();
  push(`return `);
  if (ast.codegenNode) {
    genNode(ast.codegenNode, context);
  } else {
    push("null");
  }
  deindent();
  push(`}`);
  return context.code;
}
function compile(template) {
  const ast = parse(template);
  transform(ast);
  return generate(ast);
}
export {
  compile,
  parse
};
//# sourceMappingURL=compiler-core.js.map
