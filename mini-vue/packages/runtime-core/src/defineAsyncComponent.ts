import { ref } from "@vue/reactivity";
import { h } from "./h";
import { isFunction, isObject } from "@vue/shared";

export function defineAsyncComponent(options) {
  if (isFunction(options)) {
    options = { loader: options };
  }

  return {
    setup() {
      const {
        loader,
        errorComponent,
        timeout,
        delay,
        loadingComponent,
        onError,
      } = options;
      const loaded = ref(false);
      const loading = ref(false);

      const error = ref(false); // 超时

      let loadingTimer = null;
      if (delay) {
        loadingTimer = setTimeout(() => {
          loading.value = true;
        }, delay);
      }

      let Comp = null;

      let attempts = 0;
      function loadFunc() {
        return loader().catch((err) => {
          // 这里我们手动处理异常
          if (onError) {
            return new Promise((resolve, reject) => {
              const retry = () => resolve(loadFunc());
              const fail = () => reject(err);
              onError(err, retry, fail, ++attempts);
            });
          } else {
            throw err; // 将错误继续传递
          }
        });
      }

      loadFunc()
        .then((comp) => {
          Comp = comp;
          loaded.value = true;
        })
        .catch((err) => {
          error.value = err;
        })
        .finally(() => {
          loading.value = false;
          // 无论成功失败完成后都不需要在切换成loading状态
          clearTimeout(loadingTimer);
        });

      if (timeout) {
        setTimeout(() => {
          error.value = true;
          throw new Error("组件加载加载失败");
        }, timeout);
      }

      const placeholder = h("div");

      return () => {
        if (loaded.value) {
          return h(Comp);
        } else if (error.value && errorComponent) {
          return h(errorComponent);
        } else if (loading.value && loadingComponent) {
          return h(loadingComponent);
        } else {
          return placeholder;
        }
      };
    },
  };
}
