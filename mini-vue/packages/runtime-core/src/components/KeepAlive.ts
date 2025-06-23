import { getCurrentInstance } from "../component";
import { onMounted, onUpdated } from "../apiLifecycle";
import { ShapeFlags } from "@vue/shared";

export const KeepAlive = {
  __isKeepAlive: true,
  props: {
    max: Number,
  },
  setup(props, { slots }) {
    const { max } = props;
    const keys = new Set(); // 用来记录哪些组件缓存过
    const cache = new Map(); // 缓存表  <keep-alive <xx> <keep-alive>

    // 在这个组件中需要一些dom方法 可以将元素移动到一个div 中，
    // 还可以卸载某个元素

    let pendingCacheKey = null;
    const instance = getCurrentInstance();

    const cacheSubTree = () => {
      cache.set(pendingCacheKey, instance.subTree); // 缓存组件的虚拟节点， 里面有组件的dom元素
    };

    // 这里是keepalive 特有的初始化方法
    // 激活时执行

    const { move, createElement, unmount: _unmount } = instance.ctx.renderer;

    function reset(vnode) {
      let shapeFlag = vnode.shapeFlag;
      // 1 | 4  = 5      5 -1 =4
      if (shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
        shapeFlag -= ShapeFlags.COMPONENT_KEPT_ALIVE;
      }
      if (shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE) {
        shapeFlag -= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE;
      }
      vnode.shapeFlag = shapeFlag;
    }
    function unmount(vnode) {
      reset(vnode); // 将vnode标识去除
      _unmount(vnode); // 真正的做删除
    }
    function purneCacheEntry(key) {
      keys.delete(key);
      const cached = cache.get(key); // 之前缓存的结果
      // 还原vnode上的标识，否则无法走移除逻辑
      unmount(cached); // 走真实的删除dom元素
    }

    instance.ctx.activate = function (vnode, container, anchor) {
      move(vnode, container, anchor); // 将元素直接移入到容器中
    };
    // 卸载的时候执行
    const storageContent = createElement("div");
    instance.ctx.deactivate = function (vnode) {
      move(vnode, storageContent, null); // 将dom元素临时移动到这个div中但是没有被销毁
    };

    onMounted(cacheSubTree);
    onUpdated(cacheSubTree);

    // 缓存的是组件 -》 组件里有subtree -》subTree上有el元素  -》移动到页面中

    return () => {
      // process
      const vnode = slots.default();

      const comp = vnode.type;

      const key = vnode.key == null ? comp : vnode.key;

      const cacheVNode = cache.get(key);
      pendingCacheKey = key;
      if (cacheVNode) {
        vnode.component = cacheVNode.component; // 不要在重新创建组件的实例了，直接复用即可
        vnode.shapeFlag |= ShapeFlags.COMPONENT_KEPT_ALIVE; // 告诉他不要做初始化操作
        keys.delete(key);
        keys.add(key); // 刷新缓存
      } else {
        keys.add(key);

        if (max && keys.size > max) {
          // 说明达到了最大的缓存个数

          // set中的第一个元素
          purneCacheEntry(keys.values().next().value);
        }
      }

      vnode.shapeFlag |= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE; // 这个组件不需要真的卸载，卸载的dom 临时放到存储容器中存放
      return vnode; // 等待组件加载完毕后在去缓存
    };
  },
};
export const isKeepAlive = (value) => value.type.__isKeepAlive;
