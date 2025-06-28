const queue = []; // 缓存当前要执行的队列
let isFlushing = false; // 是否正在执行
const resolvePromise = Promise.resolve();

// 主要通过事件环的机制，延迟更新操作 先走宏任务 --> 微任务（更新操作）
// 也就是多个 update 进来，会先走宏任务，添加进 queue
// 等宏任务执行完，那么开启微任务，再走 resolvePromise.then
// 此时就可以遍历 queue 执行里面的 job
export function queueJob(job) {
  if (!queue.includes(job)) {
    // 去除重复的

    // this.name = "李四";
    // this.name = "王五"
    // this.name = "赵六"
    // 这三个生成的 update 会被去重，到最后只执行一次 update ---> effect.run
    queue.push(job); // 让任务入队列
  }

  if (!isFlushing) {
    isFlushing = true;

    resolvePromise.then(() => {
      isFlushing = false;
      const copy = queue.slice(0); // 先拷贝在执行
      queue.length = 0;
      copy.forEach((job) => job());
      copy.length = 0;
    });
  }
}
