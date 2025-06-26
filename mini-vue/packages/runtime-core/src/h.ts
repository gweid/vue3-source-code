import { isObject } from "@vue/shared";
import { createVnode, isVnode } from "./createVnode";

/**
 * 创建虚拟 DOM 节点
 * @param type 元素类型
 * @param propsOrChildren 元素属性或子节点
 * @param children 子节点
 * @returns 虚拟 DOM 节点
 */
export function h(type, propsOrChildren?, children?) {
  let l = arguments.length;

  // 参数长度是 2：h('div', '哈哈哈哈')，那么第二个参数是子节点
  if (l === 2) {
    // h(h1,虚拟节点|属性)
    if (isObject(propsOrChildren) && !Array.isArray(propsOrChildren)) {
      // 虚拟节点
      if (isVnode(propsOrChildren)) {
        // h('div',h('a'))
        return createVnode(type, null, [propsOrChildren]);
      } else {
        // 属性
        return createVnode(type, propsOrChildren);
      }
    }

    return createVnode(type, null, propsOrChildren);
  } else {
    if (l > 3) {
      // 参数长度大于 3，那么从第三个参数开始都是子节点
      children = Array.from(arguments).slice(2);
    }

    if (l == 3 && isVnode(children)) {
      children = [children];
    }

    // == 3  | == 1
    return createVnode(type, propsOrChildren, children);
  }
}
