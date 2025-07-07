import { ShapeFlags, isFunction, isObject, isString } from "@vue/shared";
import { isTeleport } from "./components/Teleport";

export const Text = Symbol("Text"); // 定义 Text 文本标识
export const Fragment = Symbol("Fragment"); // 定义 Fragment 片段标识

/**
 * 判断是否为虚拟节点
 * @param value 需要判断的值
 * @returns 是否为虚拟节点
 */
export function isVnode(value) {
  return value?.__v_isVnode;
}

// 判断两个虚拟节点的 type 和 key 是否相同
export function isSameVnode(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}

/**
 * 创建虚拟 DOM 节点
 * @param type 元素类型
 * @param props 元素属性
 * @param children 子节点
 * @param patchFlag 补丁标志
 * @returns 虚拟 DOM 节点
 */
export function createVnode(type, props, children?, patchFlag?) {
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT // 元素
    : isTeleport(type)
      ? ShapeFlags.TELEPORT // teleport
      : isObject(type)
        ? ShapeFlags.STATEFUL_COMPONENT // 带状态的组件
        : isFunction(type)
          ? ShapeFlags.FUNCTIONAL_COMPONENT // 函数组件
          : 0;

  // 虚拟 DOM 节点
  const vnode = {
    __v_isVnode: true,
    type,
    props,
    children,
    key: props?.key, // diff算法后面需要的key
    el: null, // 虚拟节点需要对应的真实节点是谁
    shapeFlag,
    ref: props?.ref,
    patchFlag,
  };

  debugger
  // 如果是动态节点，添加到全局变量 currentBlock 中
  // 后面会放到 vnode.dynamicChildren 中
  if (currentBlock && patchFlag > 0) {
    currentBlock.push(vnode);
  }

  if (children) {
    // 设置 子节点的 shapeFlag 标识
    if (Array.isArray(children)) {
      vnode.shapeFlag |= ShapeFlags.ARRAY_CHILDREN;
    } else if (isObject(children)) {
      // h 函数的第三个参数是对象，代表插槽
      vnode.shapeFlag |= ShapeFlags.SLOTS_CHILDREN;
    } else {
      // 子节点是 string 或者 number 类型，转为字符串
      children = String(children);
      vnode.shapeFlag |= ShapeFlags.TEXT_CHILDREN;
    }
  }

  return vnode;
}



// ------------------------ patch flag 相关 ------------------------

let currentBlock = null;

export function openBlock() {
  currentBlock = []; // 用于收集动态节点的
}

export function closeBlock() {
  currentBlock = null;
}

// 将动态节点收集到 vnode.dynamicChildren 中
export function setupBlock(vnode) {
  vnode.dynamicChildren = currentBlock; // 当前elementBlock会收集子节点，用当前block来收集
  closeBlock();
  return vnode;
}

// block 有收集虚拟节点的功能
// 这个 patchFlag 参数是在编译阶段传入的
// 编译阶段会将 template 编译成 render 函数，此时会根据是否动态节点，生成 patchFlag
// function render(_ctx, _cache, $props, $setup, $data, $options) {
//   return (_openBlock(), _createElementBlock("div", null, [
//     _createElementVNode("div", null, "Hello World"),
//     _createElementVNode("p", {
//       style: _normalizeStyle({ color: _ctx.red }),
//       class: _normalizeClass(_ctx.a),
//       b: _ctx.b
//     }, _toDisplayString(_ctx.name), 15 /* TEXT, CLASS, STYLE, PROPS */, ["b"])
//   ]))
// }
export function createElementBlock(type, props, children, patchFlag?) {
  const vnode = createVnode(type, props, children, patchFlag);
  // if (currentBlock) {
  //   currentBlock.push(vnode);
  // }
  return setupBlock(vnode);
}

export function toDisplayString(value) {
  return isString(value)
    ? value
    : value == null
      ? ""
      : isObject(value)
        ? JSON.stringify(value)
        : String(value);
}

export { createVnode as createElementVNode };
