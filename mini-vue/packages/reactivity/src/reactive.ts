import { isObject } from "@vue/shared";
import { mutableHandlers } from "./baseHandler";
import { ReactiveFlags } from "./constants";

// 用于记录代理后的结果，可以复用
const proxyMap = new WeakMap();

/**
 * 创建响应式对象
 * @param target 需要代理的目标
 * @returns 代理后的对象
 */
export function reactive(target) {
  return createReactiveObject(target);
}

/**
 * 创建响应式对象函数
 * @param target 需要代理的目标
 * @returns 代理后的结果
 */
function createReactiveObject(target) {
  // 统一做判断，响应式对象必须是对象，使用的是 typeof 判断，支持 {} 和 []
  if (!isObject(target)) {
    return target;
  }

  // 如果已经是响应式对象，直接返回
  // proxy 的 mutableHandlers 中会拦截 IS_REACTIVE 属性的访问
  // 当访问 IS_REACTIVE 属性时，返回 true。不是代理过的对象不会触发
  if (target[ReactiveFlags.IS_REACTIVE]) {
    return target;
  }

  // 取缓存，如果有直接返回
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }

  // 创建代理
  let proxy = new Proxy(target, mutableHandlers);

  // 缓存代理后的结果
  proxyMap.set(target, proxy);

  return proxy;
}

/**
 * 将非响应式对象转换为响应式对象
 * @param value 需要转换的对象
 * @returns 转换后的响应式对象
 */
export function toReactive(value) {
  // 对象才转换
  return isObject(value) ? reactive(value) : value;
}

/**
 * 判断是否是响应式对象
 * @param value 需要判断的对象
 * @returns 是否是响应式对象
 */
export function isReactive(value) {
  return !!(value && value[ReactiveFlags.IS_REACTIVE]);
}
