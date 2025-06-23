function createInvoker(value) {
  const invoker = (e) => invoker.value(e);
  invoker.value = value; // 更改invoker中的value属性 可以修改对应的调用函数
  return invoker;
}
export default function patchEvent(el, name, nextValue) {
  // vue_event_invoker
  const invokers = el._vei || (el._vei = {});
  const eventName = name.slice(2).toLowerCase();
  const exisitingInvokers = invokers[name]; // 是否存在同名的事件绑定
  if (nextValue && exisitingInvokers) {
    // 事件换绑定
    return (exisitingInvokers.value = nextValue);
  }
  if (nextValue) {
    const invoker = (invokers[name] = createInvoker(nextValue)); // 创建一个调用函数，并且内部会执行nextValue
    return el.addEventListener(eventName, invoker);
  }
  if (exisitingInvokers) {
    // 现在没有，以前有
    el.removeEventListener(eventName, exisitingInvokers);
    invokers[name] = undefined;
  }
}
