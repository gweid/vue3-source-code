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



### reactive





#### 实现 reactive

首先，看下 reactive 的使用

```js
const state = reactive({ name: 'jack' })
```

这就将一个对象变成了响应式



##### reactive 函数

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



##### mutableHandlers 函数

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



#### 实现 effect

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



##### effect 函数

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



#### 依赖收集

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



#### 派发更新



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



#### 依赖清理



##### 问题



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



##### 实现

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



#### effect 调度

effect 调度：数据更新了，不重新渲染，自行调度



**基本使用：**

```ts
const state = reactive({ name: "张三" });

const runner = effect(() => {
  app.innerHTML = state.name;
}, {
  scheduler() {
    console.log('数据更新了，不重新渲染，走这里面的逻辑');

    runner();
  }
});

setTimeout(() => {
  state.name = '李四';
}, 1000);
```



**实现 effect 调度：**

```js
export class ReactiveEffect {
  // ....

  // fn 用户编写的函数
  // 如果fn中依赖的数据发生变化后，需要重新调用 -> run()
  constructor(public fn, public scheduler) {}
  
  // ...
}



export function effect(fn, options?: ReactiveEffectOptions) {
  // 创建一个 effect，只要依赖的属性变化了就要执行回调
  const _effect = new ReactiveEffect(fn, () => {
    // scheduler
    _effect.run();
  });

  // 直接触发一次
  _effect.run();

  if (options) {
    // 用用户传递的覆盖掉内置的，比如 scheduler
    Object.assign(_effect, options);
  }

  const runner = _effect.run.bind(_effect);
  runner.effect = _effect; // 可以在 runner 方法上获取到 effect 的引用

  // 返回 runner 函数，外部使用可以自己让其重新 run
  return runner;
}
```

实现也很简单：

- 当有传 options 参数，那么使用传递的覆盖掉内置的 scheduler
- 定义一个 runner 为 effect.run()，返回，即可在外部访问这个 run



#### 深度代理

当绑定的属性是深层对象时，需要将要将里面的对象也转换成响应式



**实现：**

```ts
export const mutableHandlers: ProxyHandler<any> = {
  get(target, key, recevier) {

    // ...

    let res = Reflect.get(target, key, recevier);

    if (isObject(res)) {
      // 当取的值也是对象的时候，需要对这个对象在进行代理，递归代理
      return reactive(res);
    }

    return res;
  },
  set(target, key, value, recevier) {
    // ...
  },
};
```



#### 总结 reactive

![](./imgs/img5.png)

- 首先，通过 reactive 函数，利用 Proxy 代理，将数据转换成响应式的
  - 当是深层对象，要将里面的对象也转换成响应式
- 然后，effect 执行副作用函数，在副作用函数中如果访问了响应式对象属性，那么会触发代理对象的 get 函数
- 在代理对象的 get 函数中，会对访问的属性进行依赖收集
  - 但是这里会有重复收集依赖的问题，所以在执行 effect 副作用函数之前（即还没有触发代理对象的 get 之前），先将上一次收集的依赖进行预清理，
- 然后在进行代理对象的修改时，触发代理对象的 set 函数，在这里进行派发更新



### ref

ref 是基于 reactive 实现的，内部实际上使用的是 reactive

```ts
// 类似 reactive({ value: true })
const flag = ref(true)
```



#### 实现 ref

**基本使用：**

```ts
const state = ref('张三');

const runner = effect(() => {
  app.innerHTML = state.value;
});

setTimeout(() => {
  state.value = '李四';
}, 1000);
```



**实现：**

```ts
export function isRef(value) {
  return value && value.__v_isRef;
}



export function ref(value) {
  return createRef(value);
}


function createRef(rawValue) {
  // 如果 rawValue 是 ref 对象，则直接返回
  if (isRef(rawValue)) {
    return rawValue;
  }

  return new RefImpl(rawValue);
}


class RefImpl {
  public __v_isRef = true; // 增加 ref 标识
  public _value; // 用来保存 ref 的值的
  public _rawValue; // 用来保存 ref 的原始值的(即旧数据)
  public dep; // 用于收集对应的 effect

  constructor(value) {
    this._rawValue = value
    this._value = toReactive(value)
  }

  get value() {
    // 收集依赖
    trackRefValue(this);

    return this._value;
  }

  set value(newValue) {
    // 比较新旧数据有没有变化，有变化才需要派发更新
    if (newValue !== this._rawValue) {
      this._rawValue = newValue; // 更新值
      this._value = toReactive(newValue);

      // 派发更新
      triggerRefValue(this);
    }
  }
}
```

ref 是基于 reactive 的，如果是基本类型，直接取值，如果是对象，使用 toReactive 转换为响应式对象



**依赖收集：**

```ts
export function trackRefValue(ref) {
  if (activeEffect) {
    trackEffect(
      activeEffect,
      (ref.dep = ref.dep || createDep(() => (ref.dep = undefined), "undefined"))
    );
  }
}
```

可以看到，是调用的 trackEffect。此时 activeEffect 是在执行副作用函数 effect 时调用 effect.run 赋值上的



**派发更新：**

```ts
export function triggerRefValue(ref) {
  let dep = ref.dep;
  if (dep) {
    triggerEffects(dep); // 触发依赖更新
  }
}
```

可以看到，调用的 triggerEffects



#### 实现 toRef 与 toRefs



**基本使用：**

```ts
const state = reactive({ name: '张三', age: 18 });

const stateRef = toRef(state, 'name');

const stateRefs = toRefs(state);

const { age } = stateRefs;

const runner = effect(() => {
  app.innerHTML = `name: ${stateRef.value}, age: ${age.value}`;
});

setTimeout(() => {
  stateRef.value = '李四';
  age.value = 20;
}, 1000);
```

toRef 与 toRefs：

- toRef：可以为**响应式对象(`reactive`)**的某个属性创建一个 ref 引用，**保持对该属性的响应性**。场景：
  - 提取单个属性保持响应性
  - 需要单独操作某个响应式对象属性时
- toRefs：将一个响应式对象转换为普通对象，**但是这个普通对象可以解构而不会失去响应性**



**实现：**

```ts
class ObjectRefImpl {
  public __v_isRef = true; // 增加 ref 标识

  constructor(public _object, public _key) {}

  get value() {
    return this._object[this._key];
  }

  set value(newValue) {
    this._object[this._key] = newValue;
  }
}

export function toRef(object, key) {
  return new ObjectRefImpl(object, key);
}

export function toRefs(object) {
  const res = {};
  for (let key in object) {
    // 挨个属性调用 toRef
    res[key] = toRef(object, key);
  }
  return res;
}
```

主要是 ObjectRefImpl 类，将访问和设置值变为 getter 和 setter 形式



#### 实现 proxyRef

proxyRef 作用：自动解包 ref 引用，使得在访问对象属性时不需要显式使用 `.value`

这个方法比较少手动使用，一般在模版渲染的时候，自动使用，所以在模版中的 ref 不需要 .value



**使用：**

```ts
const state = reactive({ name: '张三', age: 18 });

const stateRefs = toRefs(state);

const proxyState = proxyRefs({ ...stateRefs });

effect(() => {
  // 使得 ref 不用使用 .value 就可以访问到值
  app.innerHTML = `name: ${proxyState.name}, age: ${proxyState.age}`;
});
```



**实现：**

```ts
export function proxyRefs(objectWithRef) {
  // 通过 proxy 代理
  return new Proxy(objectWithRef, {
    get(target, key, receiver) {
      let r = Reflect.get(target, key, receiver);

      // 如果 r 是 ref 对象，则返回 r.value，外部使用就不需要 .value 了
      return r.__v_isRef ? r.value : r;
    },
    set(target, key, value, receiver) {
      const oldValue = target[key];
      if (oldValue.__v_isRef) {
        oldValue.value = value; // 如果老值是 ref 需要给 ref 赋值
        return true;
      } else {
        return Reflect.set(target, key, value, receiver);
      }
    },
  });
}
```

通过 Proxy 将对象转换为响应性。通过 getter 和 setter 拦截访问和设置值，自动补上 .value



### computed

计算属性：基于响应式依赖进行缓存，只有在其依赖的响应式数据发生变化时才会重新计算



**基本使用：**

```ts
const state = reactive({ name: "张三" });


// 函数方式
const aliasName = computed(() => ("**" + state.name))


// 对象方式
const aliasName = computed({
  get(oldValue) {
    console.log("runner", oldValue);
    return "**" + state.name;
  },
  set(newValue) {
    state.name = newValue;
  },
});


// 副作用
effect(() => {
  app.innerHTML = aliasName.value;
});
```





**computed 函数**

```ts
export function computed(getterOrOptions) {
  // 判断是否是函数, computed 有两种使用方式
  // computed(() => state.name)  // 这种是只有 getter
  // computed({ get: () => state.name, set: () => {} }) // 这种是既有 getter 又有 setter
  let onlyGetter = isFunction(getterOrOptions);

  let getter;
  let setter;

  if (onlyGetter) {
    // computed 参数是函数
    getter = getterOrOptions;
    setter = () => {};
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }

  // 创建一个计算属性
  return new ComputedRefImpl(getter, setter); // 计算属性ref
}
```



**ComputedRefImpl 类：**

```ts
export class ComputedRefImpl<T> {
  public _value;
  public effect;
  public dep; // 依赖收集器

  constructor(getter, public setter) {
    // 创建一个 effect 来关联当前计算属性的 dirty 属性
    this.effect = new ReactiveEffect(
      () => getter(this._value), // 用户的 fn  state.name
      () => {
        // 这里就是 computed 的 setter，setter 中做派发更新
        // 计算属性依赖的值变化了，应该触发渲染 effect 重新执行
        triggerRefValue(this); // 依赖的属性变化后需要触发重新渲染，还需要将 dirty 变为 true
      }
    );
  }

  get value() {
    // 计算属性维护了一个 dirty（脏值），默认是 true，需要计算
    // 运行过一次后，dirty 变为 false，后面不在计算，使用上次的缓存值
    // 当依赖的值变化后，dirty 变为 true，需要重新计算
    // 让计算属性收集对应的 effect，当依赖的值变化后，会触发 effect 的重新执行
    if (this.effect.dirty) {
      // 有脏值，需要重新计算

      // 默认取值一定是脏的，但是执行一次 run 后就不脏了
      this._value = this.effect.run();

       /**
       * ! computed 依赖收集，收集 渲染 effect
       * ! 注意，这里收集的是渲染 effect，为什么呢？
       *   首先 const aliasName = computed({ get() { return state.name } })，这里 cpmputed
       */
      // 如果当前在 effect 中访问了计算属性，计算属性是可以收集这个 effect 的
      // 也就是计算属性本身收集 渲染 effect，区别依赖属性收集 computed effect
      trackRefValue(this);
    }

    // 没有脏值，直接返回
    return this._value;
  }

  set value(newValue) {
    // 这个就是 ref 的 setter
    this.setter(newValue);
  }
}
```

- 首先，初始化 ComputedRefImpl 类的时候，会创建一个 computed effect 来关联当前计算属性的 dirty 属性

  - 这个 computed effect 的 scheduler 函数，会进行派发更新，依赖的属性变化后需要触发重新渲染，还需要将 dirty 变为 true

    ```ts
    this.effect = new ReactiveEffect(
      () => getter(this._value), // 用户的 fn  state.name
      () => {
        // 这里就是 computed 的 setter，setter 中做派发更新
        // 计算属性依赖的值变化了，应该触发渲染 effect 重新执行
        triggerRefValue(this); // 依赖的属性变化后需要触发重新渲染，还需要将 dirty 变为 true
      }
    );
    ```

    triggerRefValue --> triggerEffects 中：

    ```ts
    export function triggerEffects(dep) {
      // 遍历所有副作用 effect，依次执行
      for (const effect of dep.keys()) {
        // 当前这个值是不脏的，但是触发更新需要将值变为脏值
        // 属性依赖了计算属性，需要让计算属性的 drity 在变为 true
        if (effect._dirtyLevel < DirtyLevels.Dirty) {
          effect._dirtyLevel = DirtyLevels.Dirty;
        }
    
        // _running > 0 代表当前 effect 正在执行
        // effect 正在执行，不要调用 scheduler，防止递归调用，进入死循环
        if (!effect._running) {
    
          // new ReactiveEffect 创建 effect 的时候，传递了更新函数
          if (effect.scheduler) {
            // 如果有更新函数，则执行更新函数，-> effect.run()
            effect.scheduler();
          }
        }
      }
    }
    ```

- getter 方法：判断 computed effect 的 dirty（脏值），如果是脏值，重新执行 effect.run() 进行计算，调用 trackRefValue 收集 computed 的依赖；没有脏值，直接返回缓存结果

  - 当执行了一次 effect.run()  之后，会将 dirty 设置为 false，那么后续如果依赖的属性没有变化，不会重新计算

    ```ts
    export class ReactiveEffect {
      _dirtyLevel = DirtyLevels.Dirty;
    
    
      // fn 用户编写的函数
      // 如果fn中依赖的数据发生变化后，需要重新调用 -> run()
      constructor(public fn, public scheduler) {}
    
      public get dirty() {
        // 访问 dirty 属性，会触发 get 拦截器
        return this._dirtyLevel === DirtyLevels.Dirty;
      }
    
      public set dirty(value) {
        this._dirtyLevel = value ? DirtyLevels.Dirty : DirtyLevels.NoDirty;
      }
    
      run() {
        // 每次运行后 effect 变为 no_dirty
        // 主要是给 computed 做缓存用的，当不是脏值，那么就返回上一次缓存的值
        this._dirtyLevel = DirtyLevels.NoDirty;
    
        // ...
      }
    }
    ```

  - 然后调用 trackRefValue ，**computed 做依赖收集，这里收集的是 render effect**

    > 为什么是 computed 收集到的是 render effect 呢？
    >
    > ```ts
    > const state = reactive({ name: "张三" });
    > 
    > const aliasName = computed({
    >   get(oldValue) {
    >     console.log("runner", oldValue);
    >     return "**" + state.name;
    >   },
    >   set(newValue) {
    >     state.name = newValue;
    >   },
    > });
    > 
    > 
    > effect(() => {
    >   app.innerHTML = aliasName.value;
    > });
    > ```
    >
    > - 首先调用 computed 会调用 new ReactiveEffect 来创建一个 computed effect
    >
    > - 接着 effect 调用，effect 会通过 new ReactiveEffect 得到一个 render effect，并且执行一次 render effect.run()，此时全局 activeEffect 被设置为 render effect
    >
    > - effect 中访问 aliasName.value，触发 computed 的 getter 函数，这里面调用一次 computed effect.run()，run 中：
    >
    >   - 首先使用 lastEffect 保存 activeEffect（上面设置成了 render effect，也就是此时的 lastEffect 是 render effect）
    >
    >   - 将 activeEffect 设置为 computed effect
    >
    >   - 然后调用 computed effect 的 fn 函数，即这里面的 `() => getter(this._value)` 这一块
    >
    >     ```ts
    >     export class ComputedRefImpl<T> {
    >       public effect; // 计算属性依赖
    >     
    >       constructor(getter, public setter) {
    >         // 创建一个 effect 来关联当前计算属性的 dirty 属性
    >         this.effect = new ReactiveEffect(
    >           () => getter(this._value), // 用户的 fn
    >           // 这个实际就是 schedule 函数
    >           () => {
    >             // 这里就是 computed 的 setter，setter 中做派发更新
    >             // 计算属性依赖的值变化了，应该触发渲染 effect 重新执行
    >             triggerRefValue(this); // 依赖的属性变化后需要触发重新渲染，还需要将 dirty 变为 true
    >           }
    >         );
    >       }
    >     }
    >     
    >     
    >     // () => getter(this._value) 是调用的 getter，就是下面的 get
    >     const aliasName = computed({
    >       get(oldValue) {
    >         console.log("runner", oldValue);
    >         return "**" + state.name;
    >       },
    >       set(newValue) {
    >         state.name = newValue;
    >       },
    >     });
    >     ```
    >
    >     这一段，这一段会访问 state.name，触发 state.name 的 getter 函数，进行依赖收集，因为上面将 activeEffect 设置为 computed effect，所以这里的 state.name 收集到的依赖是  computed effect
    >
    >   - 执行完之后，设置 activeEffect = lastEffect，那么此时的 activeEffect 变成了 render effect
    >
    > - 继续回到 computed getter 中，执行完 computed effect.run() 之后，调用 trackRefValue 为 computed 收集依赖。此时的 activeEffect 已经是 render effect 了，所以 computed 收集到的是 render effect
    >
    > 
    >
    > 这里很巧妙的设计：通过 state.name 关联 computed effect，computed 关联 render effect，当 state.name 变化，触发 computed effect 设置 dirty 为 true，并调用 computed effect 的 scheuler，scheuler 调用 computed 收集的 render effect 进行更新
    >
    > ```ts
    > this.effect = new ReactiveEffect(
    >   () => getter(this._value), // 用户的 fn  state.name
    >   // 这个实际就是 schedule 函数
    >   () => {
    >     // 这里就是 computed 的 setter，setter 中做派发更新
    >     // 计算属性依赖的值变化了，应该触发渲染 effect 重新执行
    >     triggerRefValue(this); // 依赖的属性变化后需要触发重新渲染，还需要将 dirty 变为 true
    >   }
    > );
    > ```

- setter 方法：就是调用的 computed 的 setter



这里需要捋一下 computed effect 与其它 effect

- 计算属性维护了一个 dirty 属性，默认就是 true，稍后运行过一次会将 dirty 变为 false，并且稍后依赖的值变化后会再次让 dirty 变为 true
- 计算属性也是一个 effect，依赖的属性会收集这个computed effect，当前值变化后，会让 computed effect 里面 dirty 变为 true
- 计算属性具备收集能力的，可以收集对应依赖的 render effect，依赖的值变化后会触发 render effect 重新执行



### watch

实际上，watch 不属于 reactivity，而是 runtime-core



#### 实现 watch

**基本使用：**

```ts
const numState = ref(18);
const state = reactive({ name: "张三" });

effect(() => {
  app.innerHTML = `学号: ${refState.value} --- 姓名: ${state.name}`;
});

watch(numState, (newVal, oldVal) => {
  console.log('numState 变化了：', newVal, oldVal);
});

watch(() => state.name, (newVal, oldVal) => {
  console.log('state.name 变化了：', newVal, oldVal);
});

setTimeout(() => {
  state.name = "李四";
  refState.value = 20;
}, 1000);
```



**实现：**

```ts
export function watch(source, cb, options = {} as any) {
  return doWatch(source, cb, options);
}


function doWatch(source, cb, { deep, immediate }) {
  // source --> getter
  const reactiveGetter = (source) =>
    traverse(source, deep === false ? 1 : undefined);

  // 产生一个可以给 ReactiveEffect 来使用的 getter
  // 需要对这个对象进行取值操作，会关联当前的 reactiveEffect
  let getter;
  if (isReactive(source)) {
    // reactive 对象，默认开启深度监听
    getter = () => reactiveGetter(source);
  } else if (isRef(source)) {
    // ref
    getter = () => source.value;
  } else if (isFunction(source)) {
    // 函数
    getter = source;
  }

  let oldValue;

  let clean;
  const onCleanup = (fn) => {
    clean = () => {
      fn();
      clean = undefined;
    };
  };

  // 相当于 ReactiveEffect 的 scheduler
  const job = () => {
    if (cb) {
      const newValue = effect.run();

      if (clean) {
        clean(); //  在执行回调前，先调用上一次的清理操作进行清理
      }

      cb(newValue, oldValue, onCleanup);
      oldValue = newValue;
    } else {
      effect.run(); // watchEffect
    }
  };


  const effect = new ReactiveEffect(getter, job);

  oldValue = effect.run();

  const unwatch = () => {
    effect.stop();
  };

  return unwatch;
}



// 控制 depth 当前遍历到了那一层
// 这里的 source 就是 reactive 对象
function traverse(source, depth, currentDepth = 0, seen = new Set()) {
  if (!isObject(source)) {
    return source;
  }

  // 如果手动关闭了 deep，那么 depth = 1
  // 其它情况，depth = undefined，不会走下面逻辑
  if (depth) {
    if (currentDepth >= depth) {
      return source;
    }
    currentDepth++; // 根据deep 属性来看是否是深度
  }

  // 防止循环递归
  if (seen.has(source)) {
    return source;
  }

  // 遍历 reactive 对象的每个属性
  // 主要作用：触发每个属性的 getter 操作，进行依赖收集
  // ! 这里收集到的是 watch effect
  for (let key in source) {
    traverse(source[key], depth, currentDepth, seen);
  }

  return source; // 遍历就会触发每个属性的get
}
```

主要逻辑在 doWatch 函数中：

- 产生一个可以给 ReactiveEffect 来使用的 getter，这个 getter 的作妖作用就是，当访问 state 属性的时候，触发 getter 进行依赖收集，将 watch effect 收集起来
  - 当是 reactive，遍历 reactive 所有属性，触发 getter 进行依赖收集
  - ref 时，访问 ref.value 触发 getter 进行依赖收集
  - 是函数时，() => state.name 也会访问属性触发 getter 依赖收集
- 产生一个 ReactiveEffect 的 scheduler（即上面的 job）
- 当 state 属性变更，触发收集到的 watch effect 进行更新，即调用 watch effect 的 scheduler 函数，获取新值



#### 实现 watchEffect





