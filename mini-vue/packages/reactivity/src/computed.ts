import { isFunction } from "@vue/shared";
import { ReactiveEffect } from "./effect";
import { trackRefValue, triggerRefValue } from "./ref";

export class ComputedRefImpl<T> {
  public _value; // 计算属性的结果值（缓存结果）
  public effect; // 计算属性依赖
  public dep; // 计算属性的依赖收集器

  constructor(getter, public setter) {
    // 创建一个 effect 来关联当前计算属性的 dirty 属性
    this.effect = new ReactiveEffect(
      () => getter(this._value), // 用户的 fn  state.name
      // 这个实际就是 schedule 函数
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
       * ! 注意，这里收集的是渲染 effect，为什么呢？解释看文档
       */
      // 如果当前在 effect 中访问了计算属性，计算属性是可以收集这个 effect 的
      // 也就是计算属性本身收集 渲染 effect，区别依赖属性收集 computed effect
      trackRefValue(this);
    }

    // 没有脏值，直接返回
    return this._value;
  }

  set value(newValue) {
    // 这个就是 computed 的 setter
    this.setter(newValue);
  }
}

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
  return new ComputedRefImpl(getter, setter); // 计算属性 ref
}
