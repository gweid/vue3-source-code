import { nodeOps } from "./nodeOps";
import patchProp from "./patchProp";
import { createRenderer } from "@vue/runtime-core";


// 将节点操作和属性操作合并在一起
// renderOptions = {
//   patchProp,
//   insert,
//   remove,
//   createElement,
//   ...
// }
const renderOptions = Object.assign({ patchProp }, nodeOps);

// render 方法
export const render = (vnode, container) => {
  return createRenderer(renderOptions).render(vnode, container);
};

export * from "@vue/runtime-core";
