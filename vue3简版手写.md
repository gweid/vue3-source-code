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



mutableHandlers 函数：

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



### 依赖收集







