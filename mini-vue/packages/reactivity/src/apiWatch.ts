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
// 控制 depth 已经当前遍历到了那一层
function traverse(source, depth, currentDepth = 0, seen = new Set()) {
  if (!isObject(source)) {
    return source;
  }
  if (depth) {
    if (currentDepth >= depth) {
      return source;
    }
    currentDepth++; // 根据deep 属性来看是否是深度
  }
  if (seen.has(source)) {
    return source;
  }
  for (let key in source) {
    traverse(source[key], depth, currentDepth, seen);
  }
  return source; // 遍历就会触发每个属性的get
}

function doWatch(source, cb, { deep, immediate }) {
  // source ?  -> getter
  const reactiveGetter = (source) =>
    traverse(source, deep === false ? 1 : undefined);

  // 产生一个可以给ReactiveEffect 来使用的getter， 需要对这个对象进行取值操作，会关联当前的reactiveEffect
  let getter;
  if (isReactive(source)) {
    getter = () => reactiveGetter(source);
  } else if (isRef(source)) {
    getter = () => source.value;
  } else if (isFunction(source)) {
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

  console.log(getter.toString());
  const effect = new ReactiveEffect(getter, job);

  if (cb) {
    if (immediate) {
      // 立即先执行一次用户的回调，传递新值和老值
      job();
    } else {
      oldValue = effect.run();
      console.log(oldValue, "oldValue");
    }
  } else {
    // watchEffect
    effect.run(); // 直接执行即可
  }

  const unwatch = () => {
    effect.stop();
  };

  return unwatch;
}
