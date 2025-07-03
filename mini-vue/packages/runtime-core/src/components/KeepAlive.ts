import { getCurrentInstance } from "../component";
import { onMounted, onUpdated } from "../apiLifecycle";
import { ShapeFlags } from "@vue/shared";

export const KeepAlive = {
  // 标记为 keep-alive
  __isKeepAlive: true,

  props: {
    max: Number,
  },

  setup(props, { slots }) {
    const { max } = props;
    const keys = new Set(); // 用来记录哪些组件缓存过
    const cache = new Map(); // 缓存表 <keep-alive key="xxx"> xx </keep-alive>

    // 在这个组件中需要一些dom方法 可以将元素移动到一个div 中，
    // 还可以卸载某个元素

    let pendingCacheKey = null;
    const instance = getCurrentInstance();

    // 这里是keepalive 特有的初始化方法
    // 激活时执行

    const { move, createElement, unmount: _unmount } = instance.ctx.renderer;

    function reset(vnode) {
      let shapeFlag = vnode.shapeFlag;
      // 1 | 4  = 5      5 - 1 =4
      if (shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
        shapeFlag -= ShapeFlags.COMPONENT_KEPT_ALIVE;
      }
      if (shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE) {
        shapeFlag -= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE;
      }
      vnode.shapeFlag = shapeFlag;
    }

    function unmount(vnode) {
      reset(vnode); // 将 vnode 标识去除
      _unmount(vnode); // 真正的做删除
    }

    function purneCacheEntry(key) {
      keys.delete(key);
      const cached = cache.get(key); // 之前缓存的结果
      // 还原vnode上的标识，否则无法走移除逻辑
      unmount(cached); // 走真实的删除dom元素
    }

    const cacheSubTree = () => {
      // 缓存组件的虚拟节点，里面有组件的dom元素
      cache.set(pendingCacheKey, instance.subTree);
    };

    // keep-alive 组件激活的时候执行
    instance.ctx.activate = function (vnode, container, anchor) {
      move(vnode, container, anchor); // 将元素直接移入到容器中
    };

    // 卸载的时候执行
    // 当切换到其他组件时，当前组件会被移动到一个隐藏容器 storageContainer 中
    // 组件实例保持活跃，但从 DOM 中移除
    const storageContainer = createElement("div");
    instance.ctx.deactivate = function (vnode) {
      move(vnode, storageContainer, null); // 将 dom 元素临时移动到这个div中但是没有被销毁
    };

    // 这两个分别会在组件挂载与更新的时候执行
    // 也就是顺序晚于 下面的 return 的 render 函数
    onMounted(cacheSubTree);
    onUpdated(cacheSubTree);

    // 缓存的是组件 -> 组件里有subtree -> subTree上有el元素 -> 移动到页面中

    // 返回渲染函数
    return () => {
      const vnode = slots.default();

      const comp = vnode.type;

      // key 取组件的 key 或者组件的 type
      const key = vnode.key == null ? comp : vnode.key;

      const cacheVNode = cache.get(key);
      pendingCacheKey = key;

      if (cacheVNode) {
        // 有缓存，不用重新创建组件的实例了，直接复用即可
        vnode.component = cacheVNode.component;
        // 告诉使用方不要初始化这个组件，这个是 keep-alive 组件
        // 挂载后，才会打上 COMPONENT_KEPT_ALIVE 标识，也就是二次渲染才有用
        vnode.shapeFlag |= ShapeFlags.COMPONENT_KEPT_ALIVE;
        keys.delete(key);
        keys.add(key); // 刷新缓存
      } else {
        // 没有缓存
        keys.add(key);

        if (max && keys.size > max) {
          // 说明达到了最大的缓存个数

          // keys.values().next().value：获取 set 集合中的第一个元素
          // 删除缓存的第一个
          purneCacheEntry(keys.values().next().value);
        }
      }

      // 这个组件不需要真的卸载，卸载的 dom 临时放到存储容器中存放
      vnode.shapeFlag |= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE;
      return vnode; // 等待组件加载完毕后在去缓存
    };
  },
};

export const isKeepAlive = (value) => value.type.__isKeepAlive;
