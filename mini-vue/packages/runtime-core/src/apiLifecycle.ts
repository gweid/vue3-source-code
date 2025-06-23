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

function createHook(type) {
  // 将当前的实例存到了此钩子上

  return (hook, target = currentInstance) => {
    if (target) {
      // 当前钩子是在组件中运行的
      // 看当前钩子是否存放， 发布订阅
      const hooks = target[type] || (target[type] = []);

      // 让currentInstance 存到这个函数内容
      const wrapHook = () => {
        // 在钩子执行前，对实例进行校正处理
        setCurrentInstance(target);
        hook.call(target);
        unsetCurrentInstance();
      };
      // 在执行函数内部保证实例是正确
      hooks.push(wrapHook); // 这里有坑因为setup执行完毕后，就会将instance清空
    }
  };
}
// m -> [fn,fn]

export const onBeforeMount = createHook(LifeCycles.BEFORE_MOUNT);
export const onMounted = createHook(LifeCycles.MOUNTED);
export const onBeforeUpdate = createHook(LifeCycles.BEFORE_UPDATE);
export const onUpdated = createHook(LifeCycles.UPDATED);

export function invokeArray(fns) {
  for (let i = 0; i < fns.length; i++) {
    fns[i]();
  }
}
