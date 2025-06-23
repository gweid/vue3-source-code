import { PatchFlags } from "@vue/shared";
import {
  NodeTypes,
  createCallExpression,
  createObjectExpression,
  createVnodeCall,
} from "./ast";

import {
  CREATE_ELEMENT_BLOCK,
  CREATE_ELEMENT_VNODE,
  OPEN_BLOCK,
  TO_DISPLAY_STRING,
  Fragment,
} from "./runtimeHelpers";

// dom的遍历方式， 先序，后续

// -》元素 -》文本 -》 文本处理后 -》 元素处理后 组件挂在流程
function transformElement(node, context) {
  if (NodeTypes.ELEMENT == node.type) {
    return function () {
      let { tag, props, children } = node;
      let vnodeTag = tag; // createElementVnode(div)
      let properties = [];
      for (let i = 0; i < props.length; i++) {
        properties.push({ key: props[i].name, value: props[i].value.content });
      }

      const propsExpression =
        properties.length > 0 ? createObjectExpression(properties) : null;

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
function isText(node) {
  return node.type === NodeTypes.INTERPOLATION || node.type === NodeTypes.TEXT;
}
function transformText(node, context) {
  if (NodeTypes.ELEMENT == node.type || node.type === NodeTypes.ROOT) {
    // 注意处理顺序，要等待子节点全部处理后，在赋值给父元素
    return function () {
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
                  type: NodeTypes.COMPOUND_EXPRESSION,
                  children: [child],
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
      // 我们需要看一下 文本节点是不是只有一个，只有一个不需要createTextVnode
      if (!hasText || children.length == 1) {
        return;
      }
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isText(child) || child.type === NodeTypes.COMPOUND_EXPRESSION) {
          const args = [];
          args.push(child);
          if (child.type !== NodeTypes.TEXT) {
            args.push(PatchFlags.TEXT);
          }
          children[i] = {
            type: NodeTypes.TEXT_CALL, // createTextVnode
            content: child,
            codegenNode: createCallExpression(context, args), // createTextVnode(内容，args)
          };
        }
      }

      //createTextVnode
      //codegenNode
    };
  }
}
function transformExpression(node, context) {
  if (NodeTypes.INTERPOLATION == node.type) {
    node.content.content = `_ctx.${node.content.content}`;
  }
}
function createTransformContext(root) {
  const context = {
    currentNode: root,
    parent: null,

    // createElementVnode  createTextVnode   toDisplayString
    transformNode: [transformElement, transformText, transformExpression],
    helpers: new Map(), // createElementVnode 1
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
    },
  };
  return context;
}

function traverseNode(node, context) {
  context.currentNode = node;
  const transforms = context.transformNode;

  const exits = []; // 元素函数，文本函数，表达式的函数
  for (let i = 0; i < transforms.length; i++) {
    let exit = transforms[i](node, context);
    exit && exits.push(exit);
  }
  switch (node.type) {
    case NodeTypes.ROOT:
    case NodeTypes.ELEMENT:
      for (let i = 0; i < node.children.length; i++) {
        context.parent = node;
        traverseNode(node.children[i], context);
      }
      break;
    // 对表达式的处理
    case NodeTypes.INTERPOLATION:
      context.helper(TO_DISPLAY_STRING);
      break;
  }
  context.currentNode = node; // 因为traverseNode 会将node变成子节点
  let i = exits.length;
  if (i > 0) {
    while (i--) {
      exits[i]();
    }
  }
}

// 树的遍历
// 1.
//  1.1
//   1.1.1 -》？
// 2

// 对根节点来做处理 1.文本  2.一个元素 x createElementVnode -> createElementBlock
// 3.多个 createElementBlock(Fragment)

function createRootCodegenNode(ast, context) {
  let { children } = ast;

  if (children.length == 1) {
    let child = children[0];

    if (child.type === NodeTypes.ELEMENT) {
      ast.codegenNode = child.codegenNode;
      context.removeHelper(CREATE_ELEMENT_VNODE);
      context.helper(CREATE_ELEMENT_BLOCK);
      context.helper(OPEN_BLOCK);
      ast.codegenNode.isBlock = true;
    } else {
      ast.codegenNode = child;
    }
  } else if (children.length > 0) {
    // 产生一个fragment

    ast.codegenNode = createVnodeCall(
      context,
      context.helper(Fragment),
      undefined,
      children
    );
    context.helper(CREATE_ELEMENT_BLOCK);
    context.helper(OPEN_BLOCK);
    ast.codegenNode.isBlock = true;
  }
}
function transform(ast) {
  // babel babel-traverse

  const context = createTransformContext(ast);
  traverseNode(ast, context);

  createRootCodegenNode(ast, context);

  // 对根节点处理
  ast.helpers = [...context.helpers.keys()];
}

export { transform };
