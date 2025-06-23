import { isObject } from "@vue/shared";
import { reactive } from "./reactive";
import { track, trigger } from "./reactiveEffect";
import { ReactiveFlags } from "./constants";

// proxy  需要搭配 reflect 来使用
export const mutableHandlers: ProxyHandler<any> = {
  get(target, key, recevier) {
    if (key === ReactiveFlags.IS_REACTIVE) {
      return true;
    }
    // 当取值的时候  应该让响应式属性 和 effect 映射起来
    // 依赖收集 todo...

    track(target, key); // 收集这个对象上的这个属性，和effect关联在一起
    // console.log(activeEffect, key);

    // state.address

    let res = Reflect.get(target, key, recevier);
    if (isObject(res)) {
      // 当取的值也是对象的时候，我需要对这个对象在进行代理，递归代理
      return reactive(res);
    }

    return res;
  },
  set(target, key, value, recevier) {
    // 找到属性 让对应的effect重新执行

    let oldValue = target[key];

    let result = Reflect.set(target, key, value, recevier);
    if (oldValue !== value) {
      // 需要触发页面更新
      trigger(target, key, value, oldValue);
    }
    // 触发更新 todo...
    return result;
  },
};
