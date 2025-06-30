import {
  currentInstance,
  setCurrentInstance,
  unsetCurrentInstance,
} from "./component";

export const enum LifeCycles {
  BEFORE_MOUNT = "bm",
  MOUNTED = "m",
  BEFORE_UPDATE = "bu",
  UPDATED = "u",
}

function createHook(type: LifeCycles) {
  // 将当前的实例存到了此钩子上

  // onMounted(() => { console.log("onMounted") });
  return (hook, target = currentInstance) => {
    if (target) {
      // 当前钩子是在组件中运行的
      // 往组件实例上挂生命周期钩子回调函数
      // 比如 onMounted 生命周期，可能调用了多次，使用数组存储：instance.m = [fn1, fn2]
      const hooks = target[type] || (target[type] = []);

      const wrapHook = () => {
        // 设置当前组件实例
        setCurrentInstance(target);

        // 执行钩子的回调
        hook.call(target);

        unsetCurrentInstance();
      };

      // 在执行函数内部保证实例是正确
      hooks.push(wrapHook); // 这里有坑因为setup执行完毕后，就会将instance清空
    }
  };
}

export const onBeforeMount = createHook(LifeCycles.BEFORE_MOUNT);
export const onMounted = createHook(LifeCycles.MOUNTED);
export const onBeforeUpdate = createHook(LifeCycles.BEFORE_UPDATE);
export const onUpdated = createHook(LifeCycles.UPDATED);

// 遍历执行相关钩子的回调函数
export function invokeArray(fns) {
  for (let i = 0; i < fns.length; i++) {
    fns[i]();
  }
}
