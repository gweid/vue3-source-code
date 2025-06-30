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

    // 第一次渲染的时候让虚拟节点和真实的 dom 创建关联 vnode.el = 真实 dom
    // 第二次渲染新的 vnode，可以和上一次的 vnode 做比对，之后更新对应的 el 元素，可以后续再复用这个 dom 元素
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

  // 比较、更新属性
  const patchProps = (oldProps, newProps, el) => {
    // 新的要全部生效
    for (let key in newProps) {
      hostPatchProp(el, key, oldProps[key], newProps[key]);
    }
    for (let key in oldProps) {
      if (!(key in newProps)) {
        // 以前多的现在没有了，需要删除掉，新属性传入 null 就是删除
        hostPatchProp(el, key, oldProps[key], null);
      }
    }
  };

  // 卸载所有子节点
  const unmountChildren = (children, parentComponent) => {
    for (let i = 0; i < children.length; i++) {
      let child = children[i];
      unmount(child, parentComponent);
    }
  };

  /**
   * 新旧虚拟 DOM 的 diff
   * 
   * vue3 中 diff 分为两种：
   *  1、全量 diff（递归 diff）
   *  2、快速 diff（靶向更新） -> 基于模板编译的
   * 
   * @param c1 旧虚拟 DOM 的子节点
   * @param c2 新虚拟 DOM 的子节点
   * @param el 容器
   * @param parentComponent 父组件
   */
  const patchKeyedChildren = (c1, c2, el, parentComponent) => {
    /**
     * 旧节点：[A, B, C, D, E, F, G]
     * 新节点：[A, B, E, C, D, H, I, G]
     * 
     * 
     * 同层比较，双端遍历预处理：
     *  - 从头部开始比对，直到遇到第一个不同的节点，退出
     *  - 从尾部开始比对，直到遇到第一个不同的节点，退出
     * 
     * 
     * 经过双端遍历后，剩下的子节点有几种情况：
     *  - 新增的节点
     *  - 删除的节点
     *  - 需要移动的节点
     * 
     * 
     * 然后对剩下的新节点，建立 key 和 这些节点在新列表中的索引 index 的映射表
     * 比如上面的，双端预处理后：
     *  - 待处理旧节点：[C, D, E, F]
     *  - 待处理新节点：[E, C, D, H, I]
     * 
     * 建立映射表：
     *  - key: E, index: 2
     *  - key: C, index: 3
     *  - key: D, index: 4
     *  - key: H, index: 5
     *  - key: I, index: 6
     * 
     * 遍历待处理的旧节点，通过 key 找到对应的映射表中的 index
     * 比如上面，遍历旧节点 [C, D]，
     *  - 旧节点 F 对应的映射表中没找到，需要删除
     *  - 其余旧节点都找到，可以复用
     * 
     * 
     * 最后，倒序遍历 [E, C, D, H, I]，从后向前处理确保插入位置正确
     * 
     * 
     * 
     * 
     * 旧节点：A - B - C - D - E - F - G
     * 新节点：A - B - E - C - D - H - I - G
     * 
     * 操作步骤：
     *  1. 识别头部 A、B 相同 → 跳过
     *  2. 识别尾部 G 相同 → 跳过
     *  3. 卸载 F
     *  4. 在 E 前插入 I
     *  5. 在 I 前插入 H
     *  6. 在 H 前插入 D
     *  7. 在 D 前插入 C
     *  8. 在 C 前插入 E
     */

    let i = 0; // 开始比对的索引
    let e1 = c1.length - 1; // 旧节点数组的尾部索引
    let e2 = c2.length - 1; // 新节点数组的尾部索引

    // 从头部开始比对，直到遇到第一个不同的节点，退出
    // 相同的节点，递归调用 patch
    while (i <= e1 && i <= e2) {
      // 有任何一方循环结束了 就要终止比较
      const n1 = c1[i];
      const n2 = c2[i];

      // 子节点相同
      if (isSameVnode(n1, n2)) {
        // 更新当前节点的属性和儿子（递归比较子节点）
        patch(n1, n2, el);
      } else {
        // 有不同，结束循环
        break;
      }
      i++;
    }

    // 从尾部开始比对，直到遇到第一个不同的节点，退出
    // 相同的节点，递归调用 patch
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2];

      if (isSameVnode(n1, n2)) {
        patch(n1, n2, el); // 更新当前节点的属性和儿子（递归比较子节点）
      } else {
        break;
      }
      e1--;
      e2--;
    }


    // 此时 i 会记录头部遍历终止的位置，e1 和 e2 会记录尾部遍历终止的位置


    // 先处理两种特殊情况：新的比旧的多 or 新的比旧的少
    if (i > e1) {
      // 比如：[a, b]  --> [a, b, c]
      // e1 与 e2 取得是长度
      // 双端遍历完后：i = 2, e1 = 1, e2 = 2；这种情况是新的多
      if (i <= e2) {
        // 如果是 [a, b] --> [c, a, b]
        // 双端遍历完后：i = 0, e1 = -1, e2 = 0
        let nextPos = e2 + 1; // 看一下当前下一个元素是否存在，有就是 [c, a, b]；没有就是 [a, b, c]
        let anchor = c2[nextPos]?.el;
        while (i <= e2) {
          patch(null, c2[i], el, anchor);
          i++;
        }
      }
    } else if (i > e2) {
      // 比如：[a, b, c] ---> [a, b]
      // 双端遍历完后：i = 2, e1 = 2, e2 = 1；这种情况就是新的少
      if (i <= e1) {
        while (i <= e1) {
          // 将元素一个个删除
          unmount(c1[i], parentComponent);
          i++;
        }
      }
    } else {
      // 处理完上面两个情况，并且对插入和移除做了处理
      // 后面就是剩余节点的比对了

      // i 是头部遍历结束的位置，比如：
      //   旧节点：A - B - C - D - E - F - G
      //   新节点：A - B - E - C - D - H - I - G
      // 双端遍历完: i = 2, e1 = 5, e2 = 6
      let s1 = i;
      let s2 = i;

      // 做一个映射表用于快速查找，看老的是否在新的里面还有，没有就删除，有的话就更新
      const keyToNewIndexMap = new Map();

      // 双端遍历完后，新的剩余: [E, C, D, H, I]
      // i = 2, e1 = 5, e2 = 6
      let toBePatched = e2 - s2 + 1; // 要倒序插入的个数

      // 填充 0，得到 [0, 0, 0, 0, 0]
      let newIndexToOldMapIndex = new Array(toBePatched).fill(0);

      // 对剩下的新节点，建立 key ---> index 的对应关系
      // 对于这里新的剩余 [E, C, D, H, I]，建立的关系：
      // {
      //   E --> 2
      //   C --> 3
      //   D --> 4
      //   H --> 5
      //   I --> 6
      // }
      for (let i = s2; i <= e2; i++) {
        const vnode = c2[i];
        keyToNewIndexMap.set(vnode.key, i);
      }


      // 遍历老的剩余节点，通过 key 找是否可以复用的节点
      // 老剩余：[C, D, E, F]   新剩余: [E --> 2, C --> 3, D --> 4, H --> 5, I --> 6]
      for (let i = s1; i <= e1; i++) {
        const vnode = c1[i];

        const newIndex = keyToNewIndexMap.get(vnode.key); // 通过 key 找到对应的索引

        if (newIndex == undefined) {
          // 如果新的里面找不到，则说明老的这个节点要删除
          unmount(vnode, parentComponent);
        } else {
          // 比较前后节点的差异，更新属性和儿子
          // i 可能是 0 的情况，为了保证 0 是没有比对过的元素，直接 i+1
          // C、D、E 在新的里面能够找到，进入这里
          // 对于 C: newIndex = 3, s2 = 2, i = 2
          // newIndexToOldMapIndex = [0, 3, 0, 0, 0]，0 表示新增的节点，不是 0 就代表新的在旧中的位置
          // 老的：[A, B, C, D, E, F, G]
          // 新的：[A, B, E, C, D, H, I, G]
          // 最终遍历完：newIndexToOldMapIndex = [5, 3, 4, 0, 0]
          newIndexToOldMapIndex[newIndex - s2] = i + 1;

          // 可复用，递归对比他的子节点
          patch(vnode, c2[newIndex], el);
        }
      }

      // newIndexToOldMapIndex = [5, 3, 4, 0, 0]
      // 经过最长递增子序列查找，得到 increasingSeq = [1, 2]
      // 所以对应到 [E, C, D, H, I]，就是 C、D 不动，E 移动到 C 前，创建 H、I，插入到 G 前
      let increasingSeq = getSequence(newIndexToOldMapIndex);
      let j = increasingSeq.length - 1; // 索引

      // 倒序遍历剩余的新节点 [E, C, D, H, I]，做移动插入处理
      // toBePatched 表示要插入的个数，这里是 5
      for (let i = toBePatched - 1; i >= 0; i--) {
        // 找到当前遍历到的节点的位置索引，比如 I 位置是 6
        let newIndex = s2 + i;
        // 找到当前节点的下一个节点
        let anchor = c2[newIndex + 1]?.el;
        // 当前节点
        let vnode = c2[newIndex];

        if (!vnode.el) {
          // 如果虚拟 DOM 没有 el 属性，代表是新列表中新增的元素，插入
          // 虚拟 DOM 与真实 DOM 建立关联是在 mountElement 第一次挂载的时候
          patch(null, vnode, el, anchor);
        } else {
          if (i == increasingSeq[j]) {
            // 不需要动的节点
            j--; // 做了 diff 算法有的优化
          } else {
            hostInsert(vnode.el, el, anchor); // 接着倒序插入
          }
        }
      }
    }
  };

  /**
   * diff 之前，新旧虚拟 DOM 的子节点的比较
   * @param n1 旧虚拟 DOM
   * @param n2 新虚拟 DOM
   * @param el 容器
   * @param anchor 锚点
   * @param parentComponent 父组件
   */
  const patchChildren = (n1, n2, el, anchor, parentComponent) => {
    // 子节点有三种：text、array、null

    const c1 = n1.children;
    const c2 = normalize(n2.children); // 格式化文本节点为虚拟 dom

    const prevShapeFlag = n1.shapeFlag;
    const shapeFlag = n2.shapeFlag;

    // 1.新的是文本，老的是数组移除老的；
    // 2.新的是文本，老的也是文本，内容不相同替换
    // 3.老的是文本，新的是空
    // 4.老的是文本，新的是数组
    // 5.老的是数组，新的不是数组，移除老的子节点
    // 6.老的是数组，新的是数组，全量 diff 算法

    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      // 如果新虚拟 DOM 是文本字符串

      // 如果老虚拟 DOM 是数组，则移除老的子节点
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        unmountChildren(c1, parentComponent);
      }

      // 如果新老虚拟 DOM 的文本内容不相同，则更新文本内容
      if (c1 !== c2) {
        hostSetElementText(el, c2);
      }
    } else {
      // 如果新虚拟 DOM 是数组

      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // 如果新老虚拟 DOM 是数组，则进行全量 diff 算法

          patchKeyedChildren(c1, c2, el, parentComponent);
        } else {
          // 新虚拟 DOM 是空，则移除老的子节点
          unmountChildren(c1, parentComponent);
        }
      } else {
        // 如果老虚拟 DOM 是文本字符串，替换成文本
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          hostSetElementText(el, "");
        }

        // 如果新虚拟 DOM 是数组，则挂载新的子节点
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
    // 1.比较元素的差异，肯定需要复用 dom 元素
    // 2.比较属性和元素的子节点
    let el = (n2.el = n1.el); // 对dom元素的复用

    let oldProps = n1.props || {};
    let newProps = n2.props || {};

    // 在比较元素的时候 针对某个属性来去比较
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
      // 全量 diff，比较子节点，这里面是 dom diff
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
      // 初始化渲染
      // 旧虚拟 DOM 不存在
      //  1. 通过 hostCreateText 创建文本节点
      //  2. 虚拟节点要关联真实节点，放在属性 el 上
      //  2. 将创建的文本节点插入到页面中
      hostInsert((n2.el = hostCreateText(n2.children)), container);
    } else {
      // 更新操作
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
      // 初始化
      mountChildren(n2.children, container, anchor, parentComponent);
    } else {
      // 更新
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

  // 执行组件
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

  // 创建组件的 effect，使得组件可以根据自身状态变化而更新
  function setupRenderEffect(instance, container, anchor, parentComponent) {
    const componentUpdateFn = () => {
      // 要在这里面区分，是第一次还是之后的
      const { bm, m } = instance;
      if (!instance.isMounted) {
        if (bm) {
          invokeArray(bm);
        }

        // 调用组件的 render 函数，得到子节点 VNode
        const subTree = renderComponent(instance);

        // 将子节点 VNode 挂载到容器中
        // 注意，此时就会将当前组件实例 instance 传入，作为 parentComponent 参数，这就建立了父子组件关系
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

    // queueJob 做异步更新
    const effect = new ReactiveEffect(componentUpdateFn, () =>
      queueJob(update)
    );

    const update = (instance.update = () => effect.run());
    update();
  }

  /**
   * 组件挂载
   * @param vnode 新 vnode
   * @param container 容器
   * @param anchor 锚点
   * @param parentComponent 父组件
   */
  const mountComponent = (vnode, container, anchor, parentComponent) => {
    // 1. 先创建组件实例，并将组件实例挂载到虚拟 DOM 的 component 属性上
    const instance = (vnode.component = createComponentInstance(
      vnode,
      parentComponent
    ));

    // 处理 keepAlive 组件
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

    // 2. 给组价实例的属性赋值
    setupComponent(instance);

    // 3. 创建组件的 effect，使得组件可以根据自身状态变化而更新
    setupRenderEffect(instance, container, anchor, parentComponent);
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

    // props 一致，不更新
    if (prevProps === nextProps) return false;

    // 如果属性不一致则更新
    return hasPropsChange(prevProps, nextProps || {});

    // updataProps(instance, prevProps, nextProps); // children   instance.component.proxy
  };

  /**
   * 组件的更新
   * @param n1 旧虚拟 DOM
   * @param n2 新虚拟 DOM
   */
  const updateComponent = (n1, n2) => {
    const instance = (n2.component = n1.component); // 复用组件的实例
    if (shouldComponentUpdate(n1, n2)) {
      instance.next = n2; // 如果调用update 有next属性，说明是属性更新，插槽更新
      instance.update(); // 让更新逻辑统一
    }
  };

  /**
   * 组件的挂载 or 更新入口
   * @param n1 旧虚拟 DOM
   * @param n2 新虚拟 DOM
   * @param container 容器
   * @param anchor 锚点
   * @param parentComponent 父组件
   */
  const processComponent = (n1, n2, container, anchor, parentComponent) => {
    if (n1 === null) {
      if (n2.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
        // 需要走keepAlive中的激活方法
        parentComponent.ctx.activate(n2, container, anchor);
      } else {
        // 组件挂载
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
   * @param parentComponent 父组件(通过 parentComponent 构建父子关系)
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
          // 对组件的处理：函数组件或者带状态的组件
          // 在 vue3 中通过静态提升、Patch Flag 标记等使得组件性能已经不输函数组件
          // 但函数组件无法使用响应式状态​​、​​缺少实例方法​等缺点
          // 所以 vue3 中已经不建议使用函数组件
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
      // 处理 Fragment 节点
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
      // 新虚拟 DOM 是 null，要移除当前容器中的 dom 元素
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
