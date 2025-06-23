import {
  CREATE_ELEMENT_VNODE,
  CREATE_TEXT_VNODE,
  Fragment,
} from "./runtimeHelpers";

export enum NodeTypes {
  ROOT,
  ELEMENT,
  TEXT,
  COMMENT,
  SIMPLE_EXPRESSION, // {{ name }}
  INTERPOLATION, // {{}}
  ATTRIBUTE,
  DIRECTIVE,
  // containers
  COMPOUND_EXPRESSION, // {{ name}} + 'abc'
  IF,
  IF_BRANCH,
  FOR,
  TEXT_CALL, // createVnode
  // x
  VNODE_CALL,
  JS_CALL_EXPRESSION, // ()
  JS_OBJECT_EXPRESSION, // props
  JS_PROPERTY,
  JS_ARRAY_EXPRESSION,
  JS_FUNCTION_EXPRESSION,
  JS_CONDITIONAL_EXPRESSION,
  JS_CACHE_EXPRESSION,

  // ssr codegen
  JS_BLOCK_STATEMENT,
  JS_TEMPLATE_LITERAL,
  JS_IF_STATEMENT,
  JS_ASSIGNMENT_EXPRESSION,
  JS_SEQUENCE_EXPRESSION,
  JS_RETURN_STATEMENT,
}

export function createCallExpression(context, args) {
  let name = context.helper(CREATE_TEXT_VNODE);

  return {
    // createTextVnode()
    type: NodeTypes.JS_CALL_EXPRESSION,
    arguments: args, // createTextVnode(child,1)
    callee: name,
  };
}
export function createVnodeCall(context, tag, props, children) {
  // createElementVnode()
  let name;

  if (tag !== Fragment) {
    name = context.helper(CREATE_ELEMENT_VNODE);
  }

  return {
    // createTextVnode()
    type: NodeTypes.VNODE_CALL,
    callee: name,
    tag,
    props,
    children,
  };
}

export function createObjectExpression(properies) {
  // {a:1,b:2,c:3}

  return {
    type: NodeTypes.JS_OBJECT_EXPRESSION,
    properies,
  };
}
