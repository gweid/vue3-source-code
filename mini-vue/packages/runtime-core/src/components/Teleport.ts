import { ShapeFlags } from "@vue/shared";

export const Teleport = {
  // 标识 Teleport 组件
  __isTeleport: true,

  remove(vnode, unmountChildren) {
    // vnode.type.remove(vnode, unmount);

    const { shapeFlag, children } = vnode;
    if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      unmountChildren(children);
    }
  },

  process(n1, n2, container, anchor, parentComponent, internals) {
    let { mountChildren, patchChildren, move } = internals;

    if (!n1) {
      // n1 不存在，是挂载

      // 获取需要挂载到的目标元素
      // 使用 teleport 的时候，通过 to 属性指定目标元素
      const target = (n2.target = document.querySelector(n2.props.to));

      if (target) {
        // 将子节点挂载到指定目标节点
        mountChildren(n2.children, target, parentComponent);
      }
    } else {
      // teleport 更新

      patchChildren(n1, n2, n2.target, parentComponent);

      if (n2.props.to !== n1.props.to) {
        const nextTarget = document.querySelector(n2.props.to);

        // 将子节点移动到指定目标节点
        n2.children.forEach((child) => move(child, nextTarget, anchor));
      }
    }
  },
};

export const isTeleport = (value) => value.__isTeleport;
