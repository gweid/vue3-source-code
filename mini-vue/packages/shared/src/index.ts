export function isObject(value) {
  return typeof value === "object" && value !== null;
}

export function isFunction(value) {
  return typeof value == "function";
}
export function isString(value) {
  return typeof value == "string";
}
export * from "./shapeFlags";

const hasOwnProperty = Object.prototype.hasOwnProperty;
export const hasOwn = (value, key) => hasOwnProperty.call(value, key);

export * from "./patchFlags";
