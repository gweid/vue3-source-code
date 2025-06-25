// reactive shallowReactive

import { activeEffect, trackEffect, triggerEffects } from "./effect";
import { toReactive } from "./reactive";
import { createDep } from "./dep";

// ref   shallowRef
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

export function trackRefValue(ref) {
  // activeEffect 是在执行副作用函数 effect 时调用 effect.run 赋值的
  if (activeEffect) {
    trackEffect(
      activeEffect,
      (ref.dep = ref.dep || createDep(() => (ref.dep = undefined), "undefined"))
    );
  }
}

export function triggerRefValue(ref) {
  let dep = ref.dep;
  if (dep) {
    triggerEffects(dep); // 触发依赖更新
  }
}



// ------------------------------- toRef , toRefs -------------------------------

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




// ------------------------------- proxyRefs -------------------------------

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

export function isRef(value) {
  return value && value.__v_isRef;
}
