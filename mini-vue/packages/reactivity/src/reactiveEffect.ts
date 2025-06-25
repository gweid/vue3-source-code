import { activeEffect, trackEffect, triggerEffects } from "./effect";
import { type Dep, createDep } from "./dep";

type KeyToDepMap = Map<any, Dep>
const targetMap = new WeakMap<object, KeyToDepMap>(); // 存放依赖收集的关系


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

    // 依赖收集的格式如下：WeakMap<target, Map<key, Dep>>
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

    // 不存在再回收集，避免重复收集依赖
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
