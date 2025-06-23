export default function patchClass(el, value) {
  if (value == null) {
    // 移除class
    el.removeAttribute("class");
  } else {
    el.className = value;
  }
}
