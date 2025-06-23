export default function patchStyle(el, prevValue, nextValue) {
  let style = el.style;
  for (let key in nextValue) {
    style[key] = nextValue[key]; // 新样式要全部生效
  }
  if (prevValue) {
    for (let key in prevValue) {
      // 看以前的属性，现在有没有，如果没有删除掉
      if (nextValue) {
        if (nextValue[key] == null) {
          style[key] = null;
        }
      }
    }
  }
}
