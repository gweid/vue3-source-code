# 手写 vue3



手写 vue3 核心功能，主要包含核心包：

- 编译时：
  - compiler-core：与平台无关的核心编译模块
  - compiler-dom：与浏览器相关的编译模块
  - compiler-sfc：单文件解析
- 运行时
  - runtime-core：与平台无关的运行时核心包
  - runtime-dom：浏览器运行时
- 响应式系统
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

      // 执行副作用函数
      // 如果里面访问了 reactive，那么会执行依赖收集
      return this.fn();
    } finally {

      // 一开始 lastEffect = activeEffect，activeEffect 是 undefined
      // 当副作用函数执行完，要将 activeEffect 置为 undefined
      activeEffect = lastEffect;
    }
  }
}
```

这里比较重要的一点：将创建的副作用，绑定到了全局属性 activeEffect 上，并将 activeEffect 导出了

后面调用 this.fn() 执行副作用函数，当副作用函数里面访问响应式对象时，触发 get，就会去拿这个 activeEffect 副作用，然后进行依赖收集。比如：

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

当访问 reactive 值的时候，触发 get，在这里面进行依赖收集。这里通过 track 函数进行依赖收集



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
  // 双向依赖关系：
  //   属性 → effect：通过 WeakMap<target, Map<key, Dep>> 结构存储
  //   effect → 属性：通过 effect.deps 数组存储
  // 这种双向引用使得清理时可以高效地解除关联
  dep.set(effect, effect._trackId); // 更新 id

  effect.deps[effect._depsLength++] = dep; // 永远按照本次最新的来存放
}
```

Vue 3 维护着**双向依赖关系**：

- **属性 → effect**：通过 `WeakMap<target, Map<key, Dep>>` 结构存储
- **effect → 属性**：通过 `effect.deps` 数组存储

这种双向引用使得清理时可以高效地解除关联



### 派发更新



```ts
export const mutableHandlers: ProxyHandler<any> = {
  get(target, key, recevier) {
    // ...
  },
  set(target, key, value, recevier) {

    // 获取老值
    let oldValue = target[key];

    // 设置新值
    let result = Reflect.set(target, key, value, recevier);

    // 新旧值不一致，需要派发更新
    if (oldValue !== value) {
      // 派发更新（更新页面）
      trigger(target, key, value, oldValue);
    }

    // 返回新值
    return result;
  },
};
```

当改变 reactive 值的时候，触发 set，在这里面进行派发更新



trigger 函数：

```ts
/**
 * 派发更新
 * @param target 响应式对象
 * @param key 需要更新的属性
 * @param newValue 新值
 * @param oldValue 老值
 * @returns 
 */
export function trigger(target, key, newValue, oldValue) {
  const depsMap = targetMap.get(target);

  if (!depsMap) {
    // 找不到，说明没有存储副作用函数，直接 return 即可
    return;
  }

  let dep = depsMap.get(key);

  if (dep) {
    // 修改的属性对应 effect 数组
    triggerEffects(dep);
  }
}
```



triggerEffects 函数：

```ts
/**
 * 派发更新
 * @param dep 副作用 Map
 */
export function triggerEffects(dep) {
  // 遍历所有副作用 effect，依次执行
  for (const effect of dep.keys()) {

    // new ReactiveEffect 创建 effect 的时候，传递了更新函数
    if (effect.scheduler) {
      // 如果有更新函数，则执行更新函数，-> effect.run()
      effect.scheduler();
    }
  }
}
```



### 依赖清理



#### 问题：



上面的依赖收集与派发更新几个问题，比如：



**问题 1：**

```ts
const state = reactive({ flag: true, name: "jw", age: 18 });

effect(() => {
  app.innerHTML = state.flag ? state.name : state.age;
});

setTimeout(() => {
  state.flag = false;
}, 1000);
```

当根据 flag 变化，产生不同结果，一开始是收集 [flag, name] 这两个依赖，但是 flag 变了之后，如果按照上面实现的逻辑，会变成 [flag, name, age]，但是此时已经不需要收集 name 依赖了。这造成了重复



**问题 2：**

```ts
effect(() => {
  app.innerHTML = state.flag ? state.name + state.name : state.age;
});
```

当同一个 effect 同时访问两次 name 时，effect.deps 中收集到的依赖是 [flag, name, name]。重复收集了 name 依赖



所以，在 effect 副作用重新执行前，需要清理旧的依赖关系。这就是 vue3 的依赖预清理机制，是 vue 3 响应式系统的一个重要优化，它确保：

- 只有当前实际依赖的数据才会触发 effect 的重新执行，避免了不必要的更新计算
- 防止因条件分支变化导致的无效依赖残留
- 避免不再使用的依赖关系持续占用内存
- 防止了由于依赖变化导致的"幽灵更新"问题



####实现

既然是在 effect 副作用重新执行前，需要清理旧的依赖关系，那么就是在 effect.run 函数中

```ts
export class ReactiveEffect {
  _trackId = 0; // 用于记录当前 effect 执行了几次
  _depsLength = 0;
  _running = 0;

  deps = []; // 依赖收集数组

  public active = true; // 创建的 effect 是响应式的

  // ...

  run() {
    // ...

    try {
      // ...

      // 在 effect 副作用重新执行前清理旧的依赖关系
      // 即依赖预清理机制，是 Vue 3 响应式系统的一个重要优化，它确保：
      //  - 只有当前实际依赖的数据才会触发 effect 的重新执行
      //  - 避免了不必要的更新计算
      //  - 防止了由于依赖变化导致的"幽灵更新"问题
      preCleanupEffect(this);

      this._running++;

      // 执行副作用函数
      // 如果里面访问了代理过的响应式对象，那么会在代理对象的 get 中执行依赖收集
      return this.fn();
    } finally {
      this._running--;
      
      // 如果非初始化阶段（即更新阶段），经过 trackEffect 后，会调用 cleanDepEffect 删除没有用到的依赖
      // 但是那边遗留了一个问题，就是新旧依赖数组长度不一致的时候，多的依赖没有删除
      // 所以需要 postCleanupEffect 来删除多余的依赖
      postCleanupEffect(this);

      // ...
    }
  }
}



function preCleanupEffect(effect) {
  // 这里设置 _depsLength 为 0，将指针回到初始位置，相当于清理旧依赖
  // 因为在 trackEffect 中，是通过 effect.deps[effect._depsLength++] = dep 这样来收集依赖的
  effect._depsLength = 0;

  // 每次执行 _trackId 都是 +1， 如果当前同一个 effect 执行，_trackId 就是相同的
  // 举例：effect(() => { state.name + state.name + state.name })
  // 如果
  effect._trackId++;
}
```



trackEffect 函数中：

```ts
export function trackEffect(effect, dep) {

  if (dep.get(effect) !== effect._trackId) {
    // 双向记忆：收集器 dep 记录了 effect，effect 中的 deps 数组记录了收集器 dep
    dep.set(effect, effect._trackId); // 更新 id

    // { flag, name }、{ flag, age }
    let oldDep = effect.deps[effect._depsLength];

    // 如果不相等，那么就是新的依赖
    // 有两种情况：
    //  - 初始化，那么肯定不相等
    //  - 需要收集的依赖变更了（effect(() => app.innerHTML = state.flag ? state.name : state.age)）
    //    比如上面，根据条件变化，需要收集的依赖从 flag,name 变为了 flag,age
    if (oldDep !== dep) {
      if (oldDep) {
        // 删除掉老的
        cleanDepEffect(oldDep, effect);
      }

      // effect 中的 deps 数组记录了 收集器 dep
      // _depsLength++ 确保后面一个属性的收集在数组的位置正确
      effect.deps[effect._depsLength++] = dep; // 永远按照本次最新的来存放
    } else {
      // 依赖不变
      effect._depsLength++;
    }
  }
}
```



依赖预清理：

- 首先，在 effect 执行之前的 run 函数中，通过 preCleanupEffect：

  - 设置 effect._depsLength = 0
  - 设置 effect._trackId++（\_trackId 主要用来记录当前 effect 执行的次数）

- 然后，在重新触发代理对象 get 函数，依赖重新收集时

  - 首先判断 dep.get(effect) !== effect._trackId，这个不相等，有两种情况：

    - 初始化的时候，肯定不相等

    - 需要收集的依赖变更，会重新执行 effect.run，preCleanupEffect 会将 _trackId ++，此时就不相等了

      > 这样就有效避免了一个 effect 中重复依赖的收集
      >
      > 比如：effect(() => { app.innerHTML = state.name + state.name })

  - 然后通过 effect.deps[effect._depsLength] 获取旧的依赖

    - 这里在 preCleanupEffect 函数中，已经将 effect._depsLength 重置为 0 了
    - 对比当前依赖和旧依赖，删除非本次需要收集的依赖

- 最后，调用 postCleanupEffect 清除多余的依赖（因为上面一步，只做了依赖更新，没有做多余的依赖删除）

  > 如果非初始化阶段（即更新阶段），经过 trackEffect 后，会调用 cleanDepEffect 删除没有用到的依赖
  >
  > 但是那边遗留了一个问题，就是新旧依赖数组长度不一致的时候，多的依赖没有删除
  >
  > 所以需要 postCleanupEffect 来删除多余的依赖



### 总结

- 首先，通过 reactive 函数，利用 Proxy 代理，将数据转换成响应式的
- 然后，effect 执行副作用函数，在副作用函数中如果访问了响应式对象属性，那么会触发代理对象的 get 函数
- 在代理对象的 get 函数中，会对访问的属性进行依赖收集
  - 但是这里会有重复收集依赖的问题，所以在执行 effect 副作用函数之前（即还没有触发代理对象的 get 之前），先将上一次收集的依赖进行预清理，
- 然后在进行代理对象的修改时，触发代理对象的 set 函数，在这里进行派发更新