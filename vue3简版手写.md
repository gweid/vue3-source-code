# 手写 vue3



手写 vue3 核心功能，主要包含核心包：

- 编译时：
  - compiler-core：与平台无关的核心编译模块
  - compiler-dom：与浏览器相关的编译模块
  - compiler-sfc：单文件解析

- 运行时
  - runtime-core：与平台无关的运行时核心包
  - runtime-dom：浏览器运行时
  - reactivity：响应式系统



## 目录结构

```text
mini-vue
├── debug                          // 调试目录
│   ├── compiler                   // 调试编译时
│   ├── reactivity                 // 调试响应式
│   └── runtime                    // 调试运行时
├── packages                       // 手写 vue3 源码
│   ├── compiler-core
│   ├── compiler-dom
│   ├── compiler-sfc
│   ├── reactivity
│   ├── runtime-core
│   ├── runtime-dom
│   └── shared
├── scripts                        // 打包脚本
├── .npmrc                         // npm 配置
├── package.json                  
├── pnpm-lock.yaml                  
├── pnpm-workspace.yaml            // 设置 monorepo                  
└── tsconfig.json                  // ts 配置
```



## reactivity



响应式系统相关



### 实现 reactive 函数

首先，看下 reactive 的使用

```js
const state = reactive({ name: 'jack' })
```

这就将一个对象变成了响应式



#### reactive 的创建

```ts
// 用于记录代理后的结果，可以复用
const proxyMap = new WeakMap();


/**
 * 创建响应式对象
 * @param target 需要代理的目标
 * @returns 代理后的对象
 */
export function reactive(target) {
  return createReactiveObject(target);
}



/**
 * 创建响应式对象函数
 * @param target 需要代理的目标
 * @returns 代理后的结果
 */
function createReactiveObject(target) {
  // 统一做判断，响应式对象必须是对象
  if (!isObject(target)) {
    return target;
  }

  // 如果已经是响应式对象，直接返回
  // proxy 的 mutableHandlers 中会拦截 IS_REACTIVE 属性的访问
  // 当访问 IS_REACTIVE 属性时，返回 true。不是代理过的对象不会触发
  if (target[ReactiveFlags.IS_REACTIVE]) {
    return target;
  }

  // 取缓存，如果有直接返回
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }

  // 创建代理
  let proxy = new Proxy(target, mutableHandlers);

  // 缓存代理后的结果
  proxyMap.set(target, proxy);

  return proxy;
}
```

- 通过 createReactiveObject 将对象转换为 Proxy 代理对象

  - 首先判断：响应式对象必须是对象

  - 如果已经是响应式对象，直接返回

    > proxy 的 mutableHandlers 中会拦截 IS_REACTIVE 属性的访问
    >
    > 当访问 IS_REACTIVE 属性时，返回 true。不是代理过的对象不会触发

  - 取缓存，如果有直接返回

  - 通过 new Proxy 创建响应式代理

  - 缓存代理后的结果到全局的 proxyMap



#### mutableHandlers 函数

```js
export const mutableHandlers: ProxyHandler<any> = {
  get(target, key, recevier) {
    // 拦截 IS_REACTIVE 属性的访问，当访问 IS_REACTIVE 属性时，返回 true
    // 也就是告诉这是个响应式对象，被代理过的对象才会触发，普通对象不会触发
    if (key === ReactiveFlags.IS_REACTIVE) {
      return true;
    }

    // 当取值的时候  应该让响应式属性 和 effect 映射起来
    // 收集这个对象上的属性，和 effect 关联在一起。也就是依赖收集
    // track 收集，trigger 触发
    // console.log(activeEffect);
    track(target, key);

    // state.address

    // 使用 Reflect 可以保持默认行为的一致性
    // 不使用 Reflect，那么这里是 let res = target[key]，这样会丢失 receiver 绑定
    // receiver 参数在涉及原型链或继承时非常重要。Reflect 方法会自动处理 receiver 绑定，确保 this 指向正确
    // Reflect 的方法与 Proxy handler 的方法一一对应。比如 Proxy.get 对应 Reflect.get；Proxy.set 对应 Reflect.set
    let res = Reflect.get(target, key, recevier);

    if (isObject(res)) {
      // 当取的值也是对象的时候，需要对这个对象在进行代理，递归代理
      return reactive(res);
    }

    return res;
  },
  set(target, key, value, recevier) {

    let oldValue = target[key];

    // 设置属性
    let result = Reflect.set(target, key, value, recevier);

    if (oldValue !== value) {
      // 需要触发页面更新
      trigger(target, key, value, oldValue);
    }
 
    return result;
  },
};
```

- get 函数：

  - 拦截 IS_REACTIVE 访问，当访问 IS_REACTIVE 属性时，返回 true，告诉这是个响应式对象，被代理过的对象才会触发，普通对象不会触发

  - track 收集依赖
  - 通过 Reflect.get 获取值
  - 当取的值也是对象的时候，需要对这个对象在进行代理，递归代理
  - 返回值

- set 函数：

  - 设置属性
  - 通过 trigger 触发更新（也就是让对应的 effect 执行，track 收集，trigger 触发）



### 实现 effect

effect 的基本使用：

```ts
const state = reactive({ name: "jw" });

effect(() => {
  app.innerHTML = state.name;
});
```

effect 的作用：

- **建立依赖关系**：追踪函数执行过程中访问的所有响应式属性
- **自动重新执行**：当依赖的响应式数据变化时，自动重新运行副作用函数
- **管理副作用生命周期**：提供清理和重新调度的能力（这里暂时先忽略生命周期）



#### effect 函数

```ts
export function effect(fn, options?) {
  // 创建一个响应式effect 数据变化后可以重新执行

  // 创建一个 effect，只要依赖的属性变化了就要执行回调
  const _effect = new ReactiveEffect(fn, () => {
    // scheduler
    _effect.run();
  });

  _effect.run();

  if (options) {
    Object.assign(_effect, options); // 用用户传递的覆盖掉内置的
  }

  const runner = _effect.run.bind(_effect);
  runner.effect = _effect; // 可以在 run 方法上获取到 effect 的引用

  // 返回 runner 函数，外部使用可以自己让其重新 run
  return runner;
}
```

这里比较核心的是通过 new ReactiveEffect 创建了一个副作用



ReactiveEffect:

```ts
export let activeEffect;

export class ReactiveEffect {

  public active = true; // 创建的 effect 是响应式的

  // fn 用户编写的函数
  // 如果fn中依赖的数据发生变化后，需要重新调用 -> run()
  constructor(public fn, public scheduler) {}

  run() {
    // 让 fn 执行
    if (!this.active) {
      // 不是响应式的，执行后，什么都不用做
      return this.fn();
    }

    // ---------------- 是响应式的，需要做依赖收集

    // 这样可以处理 effect 嵌套的问题
    // effect(() => { effect(() => {}) })
    let lastEffect = activeEffect;

    try {
      // 将当前的 effect 保存到全局变量中
      // 当在 effect 副作用函数中对响应式对象取值的时候，会触发 proxy 的 get 拦截器
      // 此时就可以访问到这个全局的 activeEffect
      // const state = reactive({ name: "jw" })
      // effect(() => { app.innerHTML = state.name })
      activeEffect = this;

      return this.fn(); // 依赖收集  -> state.name  state.age
    } finally {

      // 一开始 lastEffect = activeEffect，activeEffect 是 undefined
      // 当副作用函数执行完，要将 activeEffect 置为 undefined
      activeEffect = lastEffect;
    }
  }
}
```

这里比较重要的一点：将创建的副作用，绑定到了全局属性 activeEffect 上，并将 activeEffect 导出了

后面当访问响应式对象，触发 get 的时候，就会拿到这个 activeEffect 副作用，然后进行依赖收集。比如：

```ts
const state = reactive({ name: "jw" });

effect(() => {
  app.innerHTML = state.name;
});
```

这里访问响应式对象 state 时，触发 get，在这里面进行依赖收集



### 依赖收集

```ts
export const mutableHandlers: ProxyHandler<any> = {
  get(target, key, recevier) {
    // ...

    // 当取值的时候  应该让响应式属性 和 effect 映射起来
    // 收集这个对象上的属性，和 effect 关联在一起。也就是依赖收集
    // track 收集，trigger 触发
    // console.log(activeEffect);
    track(target, key);

    // ...

    return res;
  },
  set(target, key, value, recevier) {
    // ...
  },
};
```

这里通过 track 函数进行依赖收集



track 函数：

```ts
const targetMap = new WeakMap(); // 存放依赖收集的关系


/**
 * 依赖收集
 * @param target 需要收集依赖的响应式对象
 * @param key 需要收集依赖的属性
 */
export function track(target, key) {
  // activeEffect 有这个属性 说明这个 key 是在 effect 中访问的
  // 没有说明在 effect 之外访问的不用进行收集
  // 响应式系统的核心目的是当数据变化时自动执行相关的副作用函数(effect)
  // 如果一个属性的访问不是在 effect 内部发生的，那么这个访问就与任何需要自动重新执行的代码无关
  // 如果对每次属性访问都进行依赖收集，即使这些访问与响应式更新无关，将会导致：大量不必要的内存占用，性能低下
  // 所以在实际应用中，只有那些需要在数据变化时重新执行的代码才应该放在 effect 中。例如：
  //  - 模板渲染 (Vue 内部使用 effect 来实现)
  //  - 计算属性 (computed)
  //  - 侦听器 (watch)
  //  - 生命周期钩子 (onMounted, onUnmounted 等)
  //  - 自定义的副作用函数
  // 因此，依赖收集只发生在 effect 内部，确保只有真正需要响应式更新的代码才会被收集
  if (activeEffect) {

    // 依赖收集的格式如下：
    // targetMap: { obj: { 属性：Map: { effect, effect, effect } } }
    // {
    //     { name: 'jw', age: 30 }: {
    //         name: {
    //             effect, effect
    //         }
    //     }
    // }

    let depsMap = targetMap.get(target);

    if (!depsMap) {
      // 新增的依赖
      targetMap.set(target, (depsMap = new Map()));
    }

    let dep = depsMap.get(key);

    if (!dep) {
      depsMap.set(
        key,
        (dep = createDep(() => depsMap.delete(key), key)) // 后面用于清理不需要的属性
      );
    }

    // 将当前的 effect 放入到 dep（依赖映射表）中
    // 后续可以根据值的变化触发此 dep 中存放的 effect
    trackEffect(activeEffect, dep);

    console.log('targetMap: ', targetMap);
  }
}
```

- 首先会判断是否有 activeEffect，这个是在 ReactiveEffect 中赋值的

  > 为什么只需要对在 effect 内部访问的响应式数据做依赖收集呢？
  >
  > - 如果一个属性的访问不是在 effect 内部发生的，那么这个访问就与任何需要自动重新执行的代码无关
  > - 如果对每次属性访问都进行依赖收集，即使这些访问与响应式更新无关，将会导致：大量不必要的内存占用，性能低下
  > - 所以在实际应用中，只有那些需要在数据变化时重新执行的代码才应该放在 effect 中。例如：
  >   - 模板渲染 (Vue 内部使用 effect 来实现)
  >   - 计算属性 (computed)
  >   - 侦听器 (watch)
  >   - 生命周期钩子 (onMounted, onUnmounted 等)
  >   - 自定义的副作用函数

- 判断当前 reactive 是否有被收集，没有就新建

- 判断当前收集的 reactive 是否有副作用函数，没有新建

- 通过 trackEffect 将当前的副作用 activeEffect 放入到 dep（依赖映射表）中，后续可以根据值的变化触发此 dep 中存放的 effect



trackEffect 函数：

```ts
export class ReactiveEffect {
  _trackId = 0; // 用于记录当前 effect 执行了几次
  _depsLength = 0;

  deps = []; // 依赖收集数组
  
  // ....
  
}



/**
 * 收集依赖
 * @param effect 当前的 effect
 * @param dep 收集依赖的映射表 Map
 */
export function trackEffect(effect, dep) {
  // 双向记忆：收集器 dep 记录了 effect，effect 中的 deps 数组记录了 收集器 dep
  dep.set(effect, effect._trackId); // 更新 id

  effect.deps[effect._depsLength++] = dep; // 永远按照本次最新的来存放
}
```



### 派发更新







