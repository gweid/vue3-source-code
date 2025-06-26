import type { ReactiveEffect } from "./effect";
import type { ComputedRefImpl } from './computed'

export type Dep = Map<ReactiveEffect, number> & {
  cleanup: () => void
  name: string
  computed?: ComputedRefImpl<any>
};

/**
 * 创建依赖收集器
 * @param cleanup 清理函数
 * @param key 依赖的属性
 * @returns 依赖收集器
 */
export const createDep = (
  cleanup: () => void,
  key: string
) => {
  const dep = new Map() as Dep; // 创建的收集器

  dep.cleanup = cleanup;
  dep.name = key; // 标识这个 effect 是给哪个属性服务的

  return dep;
};
