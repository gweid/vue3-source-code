import { isFunction } from "@vue/shared";
import { ReactiveEffect } from "./effect";
import { trackRefValue, triggerRefValue } from "./ref";

class ComputedRefImpl {
  public _value;
  public effect;
  public dep;
  constructor(getter, public setter) {
    // 我们需要创建一个effect 来关机当前计算属性的dirty属性

    this.effect = new ReactiveEffect(
      () => getter(this._value), // 用户的fn  state.name
      () => {
        // 计算属性依赖的值变化了，我们应该触发渲染effect重新执行
        triggerRefValue(this); // 依赖的属性变化后需要触发重新渲染，还需要将dirty变为true
      }
    );
  }
  get value() {
    // 让计算属性收集对应的effect
    // 这里我们需要做处理
    if (this.effect.dirty) {
      // 默认取值一定是脏的，但是执行一次run后就不脏了
      this._value = this.effect.run();
      trackRefValue(this);
      // 如果当前在effect中访问了计算属性，计算属性是可以收集这个effect的
    }
    return this._value;
  }
  set value(v) {
    // 这个就是ref的setter
    this.setter(v);
  }
}

export function computed(getterOrOptions) {
  let onlyGetter = isFunction(getterOrOptions);

  let getter;
  let setter;
  if (onlyGetter) {
    getter = getterOrOptions;
    setter = () => {};
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }
  return new ComputedRefImpl(getter, setter); // 计算属性ref
}
