import { isFunction, isObject } from "@vue/shared";
import { ReactiveEffect } from "./effect";
import { isReactive } from "./reactive";
import { isRef } from "./ref";

export function watch(source, cb, options = {} as any) {
  // watchEffect 也是基于doWatch来实现的
  return doWatch(source, cb, options);
}

export function watchEffect(source, options = {}) {
  // 没有 cb 就是watchEffect
  return doWatch(source, null, options as any);
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

  console.log("=========ReactiveEffect 的 fn 函数：", getter.toString());
  const effect = new ReactiveEffect(getter, job);

  if (cb) {
    // 有回调函数，是 watch
    if (immediate) {
      // 立即先执行一次用户的回调，传递新值和老值
      job();
    } else {
      oldValue = effect.run();
      console.log("=========oldValue：", oldValue);
    }
  } else {
    // 没有回调函数，那么是 watchEffect
    effect.run(); // 直接执行即可
  }

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
