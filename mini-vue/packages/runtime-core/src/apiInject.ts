import { currentInstance } from "./component";

// 基本使用：provide('name', '张三')

// comp3 中 inject('name')
// 1. 默认情况下，子组件会从父组件中继承 provide 的值
// 2. 如果子组件中提供了新的 provide，那么子组件的 provide 会覆盖父组件的 provide

// comp1 --> comp2 --> comp3：形成一个链，将 comp1 的 provide 传递给 comp2，将 comp2 的 provide 传递给 comp3
// 这样, comp3 中 provide 就包含了 comp1 和 comp2 的 provide 的值


//  1. 默认情况下，子组件会从父组件中继承 provide 的值
//  2. 如果子组件中提供了新的 provide，那么子组件的 provide 会合并父组件的
export function provide(key, value) {
  // provide 和 inject 是建立在组件基础上的
  if (!currentInstance) return;

  // 获取父组件的 provide
  const parentProvide = currentInstance.parent?.provides;

  // 获取当前组件的 provide
  // 在创建组件实例的时候，就创建了 provides，继承自父组件
  let provides = currentInstance.provides;

  if (parentProvide === provides) {
    // 如果在子组件上新增了 provides 需要拷贝一份全新的
    // 这样就能做到：子组件的 provide 可以访问到父组件的，但是子组件新增的 provide 父组件没法访问
    provides = currentInstance.provides = Object.create(provides);
  }

  // 将 provide 的值设置到当前组件的 provides 中
  provides[key] = value;
}

export function inject(key, defaultValue) {
  // 建立在组件基础上的
  if (!currentInstance) return;

  // 获取父组件的 provides（跨组件传值，所以肯定是获取父组件的）
  const provides = currentInstance.parent?.provides;

  if (provides && key in provides) {
    return provides[key]; // 直接从provides中取出来使用
  } else {
    // 返回默认值
    // inject('msg', '默认值')
    return defaultValue;
  }
}
