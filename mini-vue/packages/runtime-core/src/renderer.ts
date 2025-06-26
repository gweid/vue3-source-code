import { ShapeFlags, hasOwn } from "@vue/shared";
import { Fragment, Text, createVnode, isSameVnode } from "./createVnode";
import getSequence from "./seq";
import { ReactiveEffect, isRef, reactive } from "@vue/reactivity";
import { queueJob } from "./scheduler";
import { createComponentInstance, setupComponent } from "./component";
import { invokeArray } from "./apiLifecycle";
import { isKeepAlive } from "./components/KeepAlive";
import { PatchFlags } from "packages/shared/src/patchFlags";

/**
 * 创建渲染器
 * @param renderOptions 渲染选项
 * @returns 
 */
export function createRenderer(renderOptions) {
  // core 中不关心如何渲染

  const {
    insert: hostInsert,
    remove: hostRemove,
    createElement: hostCreateElement,
    createText: hostCreateText,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    patchProp: hostPatchProp,
  } = renderOptions;

  /**
   * 处理子节点
   * 子节点可能不是虚拟 DOM 形式，而是字符串或者数字
   * @param children 子节点
   * @returns 
   */
  const normalize = (children) => {
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        if (
          typeof children[i] === "string" ||
          typeof children[i] === "number"
        ) {
          // 当子节点不是虚拟 DOM 形式，而是字符串或者数字，则将其转换为虚拟 DOM
          children[i] = createVnode(Text, null, String(children[i]));
        }
      }
    }

    return children;
  };

  /**
   * 挂载子节点
   * @param children 子节点
   * @param container 容器
   * @param anchor 锚点
   * @param parentComponent 父组件
   */
  const mountChildren = (children, container, anchor, parentComponent) => {
    // 格式化子节点，主要处理子节点可能不是虚拟 DOM 形式，而是字符串或者数字
    // 将其转换为虚拟 DOM 形式
    normalize(children);

    // 遍历每个子节点，调用 patch
    for (let i = 0; i < children.length; i++) {
      //  children[i] 可能是纯文本元素
      patch(null, children[i], container, anchor, parentComponent);
    }
  };

  /**
   * 挂载元素节点
   * @param vnode 虚拟节点
   * @param container 容器
   * @param anchor 锚点
   * @param parentComponent 父组件
   */
  const mountElement = (vnode, container, anchor, parentComponent) => {
    const { type, children, props, shapeFlag, transition } = vnode;

    // 第一次渲染的时候让虚拟节点和真实的 dom 创建关联 vnode.el = 真实dom
    // 第二次渲染新的vnode，可以和上一次的vnode做比对，之后更新对应的el元素，可以后续再复用这个dom元素
    let el = (vnode.el = hostCreateElement(type));

    if (props) {
      for (let key in props) {
        hostPatchProp(el, key, null, props[key]);
      }
    }

    // 9 & 8 > 0 说明儿子是文本元素
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      hostSetElementText(el, children);
    } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      // 子节点是数组形式
      mountChildren(children, el, anchor, parentComponent);
    }

    if (transition) {
      transition.beforeEnter(el);
    }

    hostInsert(el, container, anchor);

    if (transition) {
      transition.enter(el);
    }
    // hostCreateElement()
  };

  const processElement = (n1, n2, container, anchor, parentComponent) => {
    if (n1 === null) {
      // 初始化操作
      mountElement(n2, container, anchor, parentComponent);
    } else {
      // 更新操作
      patchElement(n1, n2, container, anchor, parentComponent);
    }
  };

  const patchProps = (oldProps, newProps, el) => {
    // 新的要全部生效
    for (let key in newProps) {
      hostPatchProp(el, key, oldProps[key], newProps[key]);
    }
    for (let key in oldProps) {
      if (!(key in newProps)) {
        // 以前多的现在没有了，需要删除掉
        hostPatchProp(el, key, oldProps[key], null);
      }
    }
  };

  const unmountChildren = (children, parentComponent) => {
    for (let i = 0; i < children.length; i++) {
      let child = children[i];
      unmount(child, parentComponent);
    }
  };

  // vue3 中 diff 分为两种：
  //  1、全量 diff（递归diff）
  //  2、快速 diff(靶向更新) -> 基于模板编译的
  const patchKeyedChildren = (c1, c2, el, parentComponent) => {
    // 比较两个儿子的差异更新el
    // appendChild  removeChild  inserBefore
    // [a,b,c,e,f,d]
    // [a,b,c,e,f]
    // 1.减少比对范围， 先从头开始比，在从尾部开始比较  确定不一样的范围
    // 2. 从头比对， 在从尾巴比对，如果有多余的或者新增的直接操作即可

    // [a,b,c];
    // [a,b,d,e];

    let i = 0; // 开始比对的索引
    let e1 = c1.length - 1; // 第一个数组的尾部索引
    let e2 = c2.length - 1; // 第二个数组的尾部索引

    while (i <= e1 && i <= e2) {
      // 有任何一方循环结束了 就要终止比较
      const n1 = c1[i];
      const n2 = c2[i];
      if (isSameVnode(n1, n2)) {
        patch(n1, n2, el); // 更新当前节点的属性和儿子（递归比较子节点）
      } else {
        break;
      }
      i++;
    }
    // 到c的位置终止了
    // 到d的位置 终止
    // c
    // d e
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2];
      // i =0
      // [a,b,c]  // e1 = 2
      // [d,a,b,c]; // e2 = 3
      if (isSameVnode(n1, n2)) {
        patch(n1, n2, el); // 更新当前节点的属性和儿子（递归比较子节点）
      } else {
        break;
      }
      e1--;
      e2--;
    }
    // [a,b] [a,b,c]  |  [a,b] [c,a,b ]
    // 处理增加和删除的特殊情况 [a,b,c] [a,b] |  [c,a,b] [a,b]

    // 最终比对乱序的情况

    // a b
    // a b c  ->   i = 2 , e1 = 1, e2 = 2     i>e1 && i<=e2

    //   a b
    // c a b ->    i = 0, e1 = -1  e2 = 0     i> e1 && i <=e2  新多老的少

    if (i > e1) {
      // 新的多
      if (i <= e2) {
        // 有插入的部分
        // insert()
        let nextPos = e2 + 1; // 看一下当前下一个元素是否存在
        let anchor = c2[nextPos]?.el;
        while (i <= e2) {
          patch(null, c2[i], el, anchor);
          i++;
        }
      }
      // a,b,c
      // a,b   i = 2   e1 = 2  e2 = 1    i>e2   i<=e1
    } else if (i > e2) {
      if (i <= e1) {
        // c,a,b
        // a,b    i = 0  e1= 1    e2=-1    i>e2   i<=e1
        while (i <= e1) {
          unmount(c1[i], parentComponent); // 将元素一个个删除
          i++;
        }
      }
    } else {
      // 以上确认不变化的节点，并且对插入和移除做了处理

      // 后面就是特殊的比对方式了

      let s1 = i;
      let s2 = i;

      const keyToNewIndexMap = new Map(); // 做一个映射表用于快速查找， 看老的是否在新的里面还有，没有就删除，有的话就更新
      let toBePatched = e2 - s2 + 1; // 要倒序插入的个数

      let newIndexToOldMapIndex = new Array(toBePatched).fill(0);

      // [4,2,3,0]  -> [1,2] 根据最长递增子序列求出对应的 索引结果

      // 格局新的节点，找到对应老的位置

      for (let i = s2; i <= e2; i++) {
        const vnode = c2[i];
        keyToNewIndexMap.set(vnode.key, i);
      }
      for (let i = s1; i <= e1; i++) {
        const vnode = c1[i];
        const newIndex = keyToNewIndexMap.get(vnode.key); // 通过key找到对应的索引
        if (newIndex == undefined) {
          // 如果新的里面找不到则说明老的有的要删除掉
          unmount(vnode, parentComponent);
        } else {
          // 比较前后节点的差异，更新属性和儿子
          // 我们i 可能是0的情况，为了保证0 是没有比对过的元素，直接 i+1
          newIndexToOldMapIndex[newIndex - s2] = i + 1; // [5,3,4,0]
          patch(vnode, c2[newIndex], el); // 服用
        }
      }

      // 调整顺序
      // 我们可以按照新的队列 倒序插入insertBefore 通过参照物往前面插入

      // 插入的过程中，可能新的元素的多，需要创建

      // 先从索引为3的位置倒序插入

      let increasingSeq = getSequence(newIndexToOldMapIndex);
      let j = increasingSeq.length - 1; // 索引
      for (let i = toBePatched - 1; i >= 0; i--) {
        // 3 2 1 0
        let newIndex = s2 + i; // h 对应的索引，找他的下一个元素作为参照物，来进行插入
        let anchor = c2[newIndex + 1]?.el;
        let vnode = c2[newIndex];
        if (!vnode.el) {
          // 新列表中新增的元素
          patch(null, vnode, el, anchor); // 创建h插入
        } else {
          if (i == increasingSeq[j]) {
            j--; // 做了diff算法有的优化
          } else {
            hostInsert(vnode.el, el, anchor); // 接着倒序插入
          }
        }
      }
      // 倒序比对每一个元素，做插入操作
    }
  };

  const patchChildren = (n1, n2, el, anchor, parentComponent) => {
    //  text  array  null
    const c1 = n1.children;
    const c2 = normalize(n2.children);

    const prevShapeFlag = n1.shapeFlag;
    const shapeFlag = n2.shapeFlag;

    // 1.新的是文本，老的是数组移除老的；
    // 2.新的是文本，老的也是文本，内容不相同替换
    // 3.老的是数组，新的是数组，全量 diff 算法
    // 4.老的是数组，新的不是数组，移除老的子节点
    // 5.老的是文本，新的是空
    // 6.老的是文本，新的是数组

    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        unmountChildren(c1, parentComponent);
      }
      if (c1 !== c2) {
        hostSetElementText(el, c2);
      }
    } else {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // 全量diff 算法 两个数组的比对
          // 6

          patchKeyedChildren(c1, c2, el, parentComponent);
        } else {
          unmountChildren(c1, parentComponent);
        }
      } else {
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          hostSetElementText(el, "");
        }
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          mountChildren(c2, el, anchor, parentComponent);
        }
      }
    }
  };

  const patchBlockChildren = (n1, n2, el, anchor, parentComponent) => {
    for (let i = 0; i < n2.dynamicChildren.length; i++) {
      patch(
        n1.dynamicChildren[i],
        n2.dynamicChildren[i],
        el,
        anchor,
        parentComponent
      );
    }
  };

  const patchElement = (n1, n2, container, anchor, parentComponent) => {
    // 1.比较元素的差异，肯定需要复用dom元素
    // 2.比较属性和元素的子节点
    let el = (n2.el = n1.el); // 对dom元素的复用

    let oldProps = n1.props || {};
    let newProps = n2.props || {};

    // 在比较元素的时候 针对某个熟悉来去比较
    const { patchFlag, dynamicChildren } = n2;

    if (patchFlag) {
      if (patchFlag & PatchFlags.STYLE) {
        //
      }
      if (patchFlag & PatchFlags.STYLE) {
        //
      }
      if (patchFlag & PatchFlags.TEXT) {
        // 只要文本是动态的只比较文本
        if (n1.children !== n2.children) {
          return hostSetElementText(el, n2.children);
        }
      }
    } else {
      // hostPatchProp 只针对某一个属性来处理  class style event attr
      patchProps(oldProps, newProps, el);
    }

    if (dynamicChildren) {
      // 线性比对
      patchBlockChildren(n1, n2, el, anchor, parentComponent);
    } else {
      // 全量diff
      patchChildren(n1, n2, el, anchor, parentComponent);
    }
  };

  /**
   * 处理文本节点
   * @param n1 旧虚拟 DOM
   * @param n2 新虚拟 DOM
   * @param container 容器
   */
  const processText = (n1, n2, container) => {
    if (n1 == null) {
      // 旧虚拟 DOM 不存在
      //  1. 通过 hostCreateText 创建文本节点
      //  2. 虚拟节点要关联真实节点，放在属性 el 上
      //  2. 将创建的文本节点插入到页面中
      hostInsert((n2.el = hostCreateText(n2.children)), container);
    } else {
      const el = (n2.el = n1.el);
      // 如果文本内容不一致，重置文本内容
      if (n1.children !== n2.children) {
        hostSetText(el, n2.children);
      }
    }
  };
  // 渲染走这里，更新也走这里
  const processFragment = (n1, n2, container, anchor, parentComponent) => {
    if (n1 == null) {
      mountChildren(n2.children, container, anchor, parentComponent);
    } else {
      patchChildren(n1, n2, container, anchor, parentComponent);
    }
  };

  const updateComponentPreRender = (instance, next) => {
    instance.next = null;
    instance.vnode = next; // instance.props
    updataProps(instance, instance.props, next.props || {});

    // 组件更新的时候 需要更新插槽
    Object.assign(instance.slots, next.children);
  };

  function renderComponent(instance) {
    // attrs , props  = 属性
    const { render, vnode, proxy, props, attrs, slots } = instance;
    if (vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
      return render.call(proxy, proxy);
    } else {
      // 此写法 不用使用了，vue3中没有任何性能优化
      return vnode.type(attrs, { slots }); // 函数式组件
    }
  }

  function setupRenderEffect(instance, container, anchor, parentComponent) {
    const componentUpdateFn = () => {
      // 我们要在这里面区分，是第一次还是之后的
      const { bm, m } = instance;
      if (!instance.isMounted) {
        if (bm) {
          invokeArray(bm);
        }
        const subTree = renderComponent(instance);
        patch(null, subTree, container, anchor, instance);
        instance.isMounted = true;
        instance.subTree = subTree;

        if (m) {
          invokeArray(m);
        }
      } else {
        // 基于状态的组件更新

        const { next, bu, u } = instance;
        if (next) {
          // 更新属性和插槽
          updateComponentPreRender(instance, next);
          // slots , props
        }

        if (bu) {
          invokeArray(bu);
        }

        const subTree = renderComponent(instance);
        patch(instance.subTree, subTree, container, anchor, instance);
        instance.subTree = subTree;

        if (u) {
          invokeArray(u);
        }
      }
    };

    const effect = new ReactiveEffect(componentUpdateFn, () =>
      queueJob(update)
    );

    const update = (instance.update = () => effect.run());
    update();
  }

  const mountComponent = (vnode, container, anchor, parentComponent) => {
    // 1. 先创建组件实例
    const instance = (vnode.component = createComponentInstance(
      vnode,
      parentComponent
    ));

    if (isKeepAlive(vnode)) {
      instance.ctx.renderer = {
        createElement: hostCreateElement, // 内部需要创建一个div来缓存dom
        move(vnode, container, anchor) {
          // 需要把之前渲染的dom放入到容器中
          hostInsert(vnode.component.subTree.el, container, anchor);
        },
        unmount, // 如果组件切换需要将现在容器中的元素移除
      };
    }

    // 2. 给实例的属性赋值
    setupComponent(instance);

    // 3. 创建一个effect
    setupRenderEffect(instance, container, anchor, parentComponent);
    // 组件可以基于自己的状态重新渲染，effect

    // 根据propsOptions 来区分出 props,attrs
    // 元素更新  n2.el = n1.el
    // 组件更新  n2.component.subTree.el =  n1.component.subTree.el

    // props.name, attrs.a， data.y
  };

  const hasPropsChange = (prevProps, nextProps) => {
    let nKeys = Object.keys(nextProps);
    if (nKeys.length !== Object.keys(prevProps).length) {
      return true;
    }

    for (let i = 0; i < nKeys.length; i++) {
      const key = nKeys[i];
      if (nextProps[key] !== prevProps[key]) {
        return true;
      }
    }

    return false;
  };

  const updataProps = (instance, prevProps, nextProps) => {
    // instance.props  ->

    if (hasPropsChange(prevProps, nextProps)) {
      // 看属性是否存在变化
      for (let key in nextProps) {
        // 用新的覆盖掉所有老的
        instance.props[key] = nextProps[key]; // 更新
      }
      for (let key in instance.props) {
        // 删除老的多于的
        if (!(key in nextProps)) {
          delete instance.props[key];
        }
      }
      // instance.props.address = '上海'
    }
  };

  const shouldComponentUpdate = (n1, n2) => {
    const { props: prevProps, children: prevChildren } = n1;
    const { props: nextProps, children: nextChildren } = n2;

    if (prevChildren || nextChildren) return true; // 有插槽直接走重新渲染即可

    if (prevProps === nextProps) return false;

    // 如果属性不一致实则更新
    return hasPropsChange(prevProps, nextProps || {});

    // updataProps(instance, prevProps, nextProps); // children   instance.component.proxy
  };

  const updateComponent = (n1, n2) => {
    const instance = (n2.component = n1.component); // 复用组件的实例
    if (shouldComponentUpdate(n1, n2)) {
      instance.next = n2; // 如果调用update 有next属性，说明是属性更新，插槽更新
      instance.update(); // 让更新逻辑统一
    }
  };

  const processComponent = (n1, n2, container, anchor, parentComponent) => {
    if (n1 === null) {
      if (n2.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
        // 需要走keepAlive中的激活方法
        parentComponent.ctx.activate(n2, container, anchor);
      } else {
        mountComponent(n2, container, anchor, parentComponent);
      }
    } else {
      // 组件的更新
      updateComponent(n1, n2);
    }
  };

  /**
   * 将虚拟节点变成真实节点，并进行渲染
   * 这里面涉及到 diff 比对
   * @param n1 旧虚拟 DOM
   * @param n2 新虚拟 DOM
   * @param container 容器
   * @param anchor 锚点
   * @param parentComponent 父组件
   */
  const patch = (n1, n2, container, anchor = null, parentComponent = null) => {
    if (n1 === n2) {
      // 新旧虚拟 DOM 相等，即两次渲染同一个元素，直接跳过即可
      return;
    }

    // 新旧虚拟 DOM 的 type 或者 key 不相等，直接移除老的 DOM 元素，初始化新的 DOM 元素
    // 也就是说，diff 比较的前提是 type 和 key 必须相同
    if (n1 && !isSameVnode(n1, n2)) {
      unmount(n1, parentComponent);
      n1 = null; // 设置 n1 为 null，执行后续的 n2 的初始化
    }

    const { type, shapeFlag, ref } = n2;

    switch (type) {
      case Text:
        // 文本节点的处理
        processText(n1, n2, container);
        break;
      case Fragment:
        // 处理 Fragment 节点
        processFragment(n1, n2, container, anchor, parentComponent);
        break;
      default:
        if (shapeFlag & ShapeFlags.ELEMENT) {
          // 处理元素节点
          processElement(n1, n2, container, anchor, parentComponent);
        } else if (shapeFlag & ShapeFlags.TELEPORT) {
          // 处理 teleport 节点
          type.process(n1, n2, container, anchor, parentComponent, {
            mountChildren,
            patchChildren,
            move(vnode, container, anchor) {
              // 此方法可以将组件 或者dom元素移动到指定的位置
              hostInsert(
                vnode.component ? vnode.component.subTree.el : vnode.el,
                container,
                anchor
              );
            },
          });
        } else if (shapeFlag & ShapeFlags.COMPONENT) {
          // 对组件的处理，vue3 中使用函数式组件，已经废弃了，没有性能节约
          processComponent(n1, n2, container, anchor, parentComponent);
        }
    }

    if (ref !== null) {
      // n2 是dom 还是 组件 还是组件有expose
      setRef(ref, n2);
    }
  };

  function setRef(rawRef, vnode) {
    let value =
      vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT
        ? vnode.component.exposed || vnode.component.proxy
        : vnode.el;
    if (isRef(rawRef)) {
      rawRef.value = value;
    }
  }

  const unmount = (vnode, parentComponent) => {
    const { shapeFlag, transition, el } = vnode;
    const performRemove = () => {
      hostRemove(vnode.el);
    };
    if (shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE) {
      // 需要找keep走失活逻辑
      parentComponent.ctx.deactivate(vnode);
    } else if (vnode.type === Fragment) {
      unmountChildren(vnode.children, parentComponent);
    } else if (shapeFlag & ShapeFlags.COMPONENT) {
      unmount(vnode.component.subTree, parentComponent);
    } else if (shapeFlag & ShapeFlags.TELEPORT) {
      vnode.type.remove(vnode, unmountChildren);
    } else {
      if (transition) {
        transition.leave(el, performRemove);
      } else {
        performRemove();
      }
    }
  };

  /**
   * render 函数
   * ! 多次调用 render 会进行虚拟节点的比较，在进行更新
   * @param vnode 虚拟节点
   * @param container 容器
   */
  const render = (vnode, container) => {
    if (vnode == null) {
      // 我要移除当前容器中的dom元素
      if (container._vnode) {
        unmount(container._vnode, null);
      }
    } else {
      // 将虚拟节点变成真实节点，并进行渲染
      patch(container._vnode || null, vnode, container);
      // 将当前 vnode 挂载到 container 中
      container._vnode = vnode;
    }
  };

  return {
    render,
  };
}
