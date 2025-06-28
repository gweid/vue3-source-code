import { proxyRefs, reactive } from "@vue/reactivity";
import { ShapeFlags, hasOwn, isFunction } from "@vue/shared";

/**
 * 创建组件实例
 * @param vnode 组件的虚拟节点
 * @param parent 父组件实例
 * @returns 组件实例
 */
export function createComponentInstance(vnode, parent?) {
  const instance = {
    data: null, // 状态
    vnode, // 组件的虚拟节点
    subTree: null, // 子树（子虚拟节点，通过调用组件的 render 函数得到）
    isMounted: false, // 是否挂载完成
    update: null, // 组件的更新的函数
    props: {},
    attrs: {},
    slots: {}, // 插槽
    propsOptions: vnode.type.props, // 用户声明的哪些属性是组件的属性
    component: null,
    proxy: null, // 用来代理 props attrs,data 让用户更方便的使用
    setupState: {},
    exposed: null,
    parent,
    ctx: {} as any, // 如果是keepAlive 组件，就将dom api放入到这个属性上
    // p1 -> p2 -> p3
    // 所有的组件provide的都一样

    provides: parent ? parent.provides : Object.create(null),
  };

  return instance;
}

// 初始化属性
const initProps = (instance, rawProps) => {
  const props = {};
  const attrs = {};

  // 就是组件中定义的 props
  // const VueComponent = {
  //   props: {
  //     name: String
  //   }
  // }
  const propsOptions = instance.propsOptions || {}; // 

  if (rawProps) {
    for (let key in rawProps) {
      const value = rawProps[key]; // value String | number
      if (key in propsOptions) {
        // 组件中定义的属性，放进props
        props[key] = value;
      } else {
        // 没定义过的，放进 attrs
        attrs[key] = value;
      }
    }
  }

  // attrs 属性没有响应式
  instance.attrs = attrs;
  // props 不需要深度代理，组件不能更改 props
  instance.props = reactive(props);
};

// 初始化插槽
export function initSlots(instance, children) {
  if (instance.vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    // 如果是插槽，将插槽保存到 instance 实例上
    instance.slots = children;
  } else {
    instance.slots = {};
  }
}

const publicProperty = {
  $attrs: (instance) => instance.attrs,
  $slots: (instance) => instance.slots, // instance.$attrs  -> instance.slots
  // ...
};

// 代理组件实例的 handler 函数
const handler = {
  get(target, key) {
    // data 和 props属性中的名字不要重名
    const { data, props, setupState } = target;

    if (data && hasOwn(data, key)) {
      // 如果 data 中存在 key，则返回 data[key]
      return data[key];
    } else if (props && hasOwn(props, key)) {
      // 如果 props 中存在 key，则返回 props[key]
      return props[key];
    } else if (setupState && hasOwn(setupState, key)) {
      return setupState[key];
    }

    // 访问 $attrs 和 $slots 等属性
    const getter = publicProperty[key]; // 通过不同的策略来访问对应的方法
    if (getter) {
      return getter(target);
    }
  },
  set(target, key, value) {
    const { data, props, setupState } = target;
    if (data && hasOwn(data, key)) {
      data[key] = value;
    } else if (props && hasOwn(props, key)) {
      // props 不能修改
      console.warn("props are readonly");
      return false;
    } else if (setupState && hasOwn(setupState, key)) {
      setupState[key] = value;
    }
    return true;
  },
};

/**
 * 初始化组件
 * @param instance 组件实例
 */
export function setupComponent(instance) {
  const { vnode } = instance;

  // 初始化赋值属性
  initProps(instance, vnode.props);

  // 初始化插槽
  initSlots(instance, vnode.children); // instance.slots = children

  // 赋值代理对象
  instance.proxy = new Proxy(instance, handler);

  // 对于组件，type 就是这个组件对象
  /**
   * const VueComponent = {
   *    data() {
   *       return {
   *         name: "张三",
   *       };
   *    },
   *    render() {
   *       return h('div', `hello, ${this.name}`);
   *    },
   * };
   * 
   * h(VueComponent, { name: "李四" })
   * 
   * function h(type, propsOrChildren?, children?)
   */
  const { data = () => {}, render, setup } = vnode.type;

  if (setup) {
    // setup 上下文，就是 setup 函数的第二个参数: setup(props, setupContext) {}
    const setupContext = {
      // ....
      slots: instance.slots,
      attrs: instance.attrs,
      expose(value) {
        instance.exposed = value;
      },
      emit(event, ...payload) {
        // onMyEvent
        const eventName = `on${event[0].toUpperCase() + event.slice(1)}`;
        const handler = instance.vnode.props[eventName];
        handler && handler(...payload);
      },
    };

    setCurrentInstance(instance);

    // 执行 setup 函数
    const setupResult = setup(instance.props, setupContext);

    unsetCurrentInstance();

    if (isFunction(setupResult)) {
      // 如果 setup 返回的是一个函数，那么这个函数就是渲染函数 render
      instance.render = setupResult;
    } else {
      // 如果 setup 返回的是一个对象，将返回的对象会暴露给组件实例
      instance.setupState = proxyRefs(setupResult); // 将返回的值做脱 ref
    }
  }

  if (!isFunction(data)) {
    console.warn("data option must be a function");
  } else {
    // data 中可以拿到 props
    instance.data = reactive(data.call(instance.proxy));
  }

  // render 函数用来生成组件的子虚拟 DOM
  // render() {
  //   return h(Fragment, [
  //     h(Text, `姓名：${this.name}`),
  //     h("div", `年龄：${this.age}`),
  //   ]);
  // }
  if (!instance.render) {
    // 没有 render 用自己的 render
    instance.render = render;
  }
}

export let currentInstance = null;

export const getCurrentInstance = () => {
  return currentInstance;
};

export const setCurrentInstance = (instance) => {
  currentInstance = instance;
};

export const unsetCurrentInstance = () => {
  currentInstance = null;
};
