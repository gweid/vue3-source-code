/**
 * 为什么要通过这种方式创建事件呢？
 * 比如：多次绑定相同事件：div onClick=fn1     div click=fn2
 * 如果使用 div onClick=() => fn1()
 * 那么当改为 fn2 时，可以只修改为 div onClick=() => fn2()
 * 这就不用解绑再重新绑定了，相当于事件的缓存
 * @param value 事件
 * @returns 
 */
function createInvoker(value) {
  // 创建一个 invoker 函数，这个函数调用就是触发 invoker.value(e)
  const invoker = (e) => invoker.value(e);
  // invoker.value 赋值为事件函数
  invoker.value = value; // 更改 invoker 中的 value 属性 可以修改对应的调用函数
  return invoker;
}

/**
 * 处理事件
 * @param el 元素
 * @param name 事件名
 * @param nextValue 新事件
 * @returns 
 */
export default function patchEvent(el, name, nextValue) {
  // vue_event_invoker
  const invokers = el._vei || (el._vei = {});

  const eventName = name.slice(2).toLowerCase();

  const exisitingInvokers = invokers[name]; // 是否存在同名的事件绑定

  if (nextValue && exisitingInvokers) {
    // 事件换绑定
    return (exisitingInvokers.value = nextValue);
  }

  // 绑定事件
  if (nextValue) {
    // 创建一个调用函数，并且内部会执行 nextValue
    const invoker = (invokers[name] = createInvoker(nextValue));
    return el.addEventListener(eventName, invoker);
  }

  // 解绑事件
  if (exisitingInvokers) {
    // 现在没有，以前有
    el.removeEventListener(eventName, exisitingInvokers);
    invokers[name] = undefined;
  }
}
