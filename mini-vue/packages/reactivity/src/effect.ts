import { DirtyLevels } from "./constants";

export type EffectScheduler = (...args: any[]) => any

export interface ReactiveEffectOptions {
  scheduler?: EffectScheduler
}


export let activeEffect;


export function effect(fn, options?: ReactiveEffectOptions) {
  // 创建一个响应式effect 数据变化后可以重新执行

  // 创建一个 effect，只要依赖的属性变化了就要执行回调
  const _effect = new ReactiveEffect(fn, () => {
    // scheduler
    _effect.run();
  });

  // 直接触发一次
  _effect.run();

  if (options) {
    // 用用户传递的覆盖掉内置的，比如 scheduler
    Object.assign(_effect, options);
  }

  const runner = _effect.run.bind(_effect);
  runner.effect = _effect; // 可以在 runner 方法上获取到 effect 的引用

  // 返回 runner 函数，外部使用可以自己让其重新 run
  return runner;
}


export class ReactiveEffect {
  _trackId = 0; // 用于记录当前 effect 执行了几次
  _depsLength = 0;
  _running = 0; // 标记当前 effect 是否正在执行，防止递归调用，进入死循环
  _dirtyLevel = DirtyLevels.Dirty;

  deps = []; // 依赖收集数组

  public active = true; // 创建的 effect 是响应式的

  // fn 用户编写的函数
  // 如果fn中依赖的数据发生变化后，需要重新调用 -> run()
  constructor(public fn, public scheduler) {}

  public get dirty() {
    // 访问 dirty 属性，会触发 get 拦截器
    return this._dirtyLevel === DirtyLevels.Dirty;
  }

  public set dirty(value) {
    this._dirtyLevel = value ? DirtyLevels.Dirty : DirtyLevels.NoDirty;
  }

  run() {
    // 每次运行后 effect 变为 no_dirty
    // 主要是给 computed 做缓存用的，当不是脏值，那么就返回上一次缓存的值
    this._dirtyLevel = DirtyLevels.NoDirty;

    // 让 fn 执行
    if (!this.active) {
      // 不是响应式的，执行后，什么都不用做
      return this.fn();
    }

    // ---------------- 是响应式的，需要做依赖收集

    // 这样可以处理 effect 嵌套的问题
    // effect(() => { effect(() => {}) })
    let lastEffect = activeEffect;

    try {
      // 将当前的 effect 保存到全局变量中
      // 当在 effect 副作用函数中对响应式对象取值的时候，会触发 proxy 的 get 拦截器
      // 此时就可以访问到这个全局的 activeEffect
      // const state = reactive({ name: "jw" })
      // effect(() => { app.innerHTML = state.name })
      activeEffect = this;

      // 在 effect 副作用重新执行前清理旧的依赖关系
      // 即依赖预清理机制，是 Vue 3 响应式系统的一个重要优化，它确保：
      //  - 只有当前实际依赖的数据才会触发 effect 的重新执行
      //  - 避免了不必要的更新计算
      //  - 防止了由于依赖变化导致的"幽灵更新"问题
      preCleanupEffect(this);

      this._running++;

      // 执行副作用函数
      // 如果里面访问了代理过的响应式对象，那么会在代理对象的 get 中执行依赖收集
      return this.fn();
    } finally {
      this._running--;

      // 如果非初始化阶段（即更新阶段），经过 trackEffect 后，会调用 cleanDepEffect 删除没有用到的依赖
      // 但是那边遗留了一个问题，就是新旧依赖数组长度不一致的时候，多的依赖没有删除
      // 所以需要 postCleanupEffect 来删除多余的依赖
      postCleanupEffect(this);

      // 一开始 lastEffect = activeEffect，activeEffect 是 undefined
      // 当副作用函数执行完，要将 activeEffect 置为 undefined
      activeEffect = lastEffect;
    }
  }

  // 停止所有的 effect 不参加响应式处理
  stop() {
    if (this.active) {
      this.active = false; // 后续来实现
      preCleanupEffect(this);
      postCleanupEffect(this);
    }
  }
}


/**
 * 收集依赖
 * @param effect 当前的 effect
 * @param dep 收集依赖的映射表 Map
 */
export function trackEffect(effect, dep) {

  // _trackId 是用来记录当前 effect 执行了几次
  // 这个不相等，有两种情况：
  //  初始化的时候，肯定不相等
  //  需要收集的依赖变更，会重新执行 effect.run，preCleanupEffect 会将 _trackId ++，此时就不相等了
  // 这样就有效避免了一个 effect 中 effect(() => { app.innerHTML = state.name + state.name }) 这种重复依赖的收集
  if (dep.get(effect) !== effect._trackId) {

    // 双向依赖关系：
    // ​  属性 → effect​​：通过 WeakMap<target, Map<key, Dep>> 结构存储
    // ​  effect → 属性​​：通过 effect.deps 数组存储
    // 这种双向引用使得清理时可以高效地解除关联
    dep.set(effect, effect._trackId); // 更新 id

    // { flag, name }、{ flag, age }
    let oldDep = effect.deps[effect._depsLength];

    // 如果不相等，那么就是新的依赖
    // 有两种情况：
    //  - 初始化，肯定不相等
    //  - 需要收集的依赖变更了（effect(() => app.innerHTML = state.flag ? state.name : state.age)）
    //    比如上面，根据条件变化，需要收集的依赖从 flag,name 变为了 flag,age
    if (oldDep !== dep) {

      if (oldDep) {
        // 删除掉老的
        cleanDepEffect(oldDep, effect);
      }

      // effect 中的 deps 数组记录了 收集器 dep
      // _depsLength++ 确保后面一个属性的收集在数组的位置正确
      effect.deps[effect._depsLength++] = dep; // 永远按照本次最新的来存放
    } else {
      // 依赖不变，将 _depsLength++
      // 遵循能复用就复用的逻辑
      effect._depsLength++;
    }
  }
}

/**
 * 派发更新
 * @param dep 副作用 Map
 */
export function triggerEffects(dep) {
  // 遍历所有副作用 effect，依次执行
  for (const effect of dep.keys()) {
    // 当前这个值是不脏的，但是触发更新需要将值变为脏值
    // 属性依赖了计算属性，需要让计算属性的 drity 在变为 true
    if (effect._dirtyLevel < DirtyLevels.Dirty) {
      effect._dirtyLevel = DirtyLevels.Dirty;
    }

    // _running > 0 代表当前 effect 正在执行
    // effect 正在执行，不要调用 scheduler，防止递归调用，进入死循环
    if (!effect._running) {

      // new ReactiveEffect 创建 effect 的时候，传递了更新函数
      if (effect.scheduler) {
        // 如果有更新函数，则执行更新函数，-> effect.run()
        effect.scheduler();
      }
    }
  }
}


function preCleanupEffect(effect) {
  // 这里设置 _depsLength 为 0，将指针回到初始位置，相当于清理旧依赖
  // 因为在 trackEffect 中，是通过 effect.deps[effect._depsLength++] = dep 这样来收集依赖的
  effect._depsLength = 0;

  // 每次执行 _trackId 都 +1，如果当前是同一个 effect 执行，_trackId 就是相同的
  // 举例：effect(() => { state.name + state.name + state.name })
  effect._trackId++;
}

/**
 * 将多余的依赖删除
 * @param effect 依赖
 */
function postCleanupEffect(effect) {
  // 旧的依赖是：[flag, name, a, b]
  // 新的依赖是：[flag, age]
  // 上面 trackEffect 只做了依赖更新，没有做多余依赖删除
  if (effect.deps.length > effect._depsLength) {
    for (let i = effect._depsLength; i < effect.deps.length; i++) {
      cleanDepEffect(effect.deps[i], effect); // 删除映射表中对应的 effect
    }
    effect.deps.length = effect._depsLength; // 更新依赖列表的长度
  }
}


/**
 * 清理依赖
 * @param dep 依赖
 * @param effect 副作用
 */
function cleanDepEffect(dep, effect) {
  dep.delete(effect);
  if (dep.size == 0) {
    dep.cleanup(); // 如果 map 为空，则删除这个属性
  }
}