import { isObject } from "@vue/shared";
import { reactive } from "./reactive";
import { track, trigger } from "./reactiveEffect";
import { ReactiveFlags } from "./constants";

// proxy 需要搭配 reflect 来使用保持默认行为的一致性
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
