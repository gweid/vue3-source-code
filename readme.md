# VUE3 源码阅读（TODO）

基于 vue-next3.0.11 版本。



## 调试方法

1. 首先，将  vue-next 源码 clone 到本地，并执行 `yarn install` 装包

2. 接着，新建测试用例：新建 `examples/test.html`

   ```js
   <html lang="en">
   <head>
     <meta charset="UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <meta http-equiv="X-UA-Compatible" content="ie=edge">
     <title>Vue3源码调试</title>
     <script src="../packages/vue/dist/vue.global.js"></script>
   </head>
   
   <body>
     <div id="app"></div>
     <script>
       const { createApp, ref } = Vue
       const App = {
         template: `
           <div>{{ msg }}</div>
         `,
         setup() {
           const msg = ref('hello, vue3')
           return {
             msg
           }
         }
       }
   
       createApp(App).mount('#app')
     </script>
   </body>
   </html>
   ```

3. 接下来就是配置生成带 source-map 的 vue 包，用于源码调试。第一步，在源码根目录找到 `rollup.config.js`，加上 source-map 配置：

   ![](/imgs/img1.png)

   然后，需要找到源码根目录下的 `tsconfig.json`，把 `sourceMap` 设置为 true

   ![](/imgs/img2.png)

4. 最后，运行 `yarn dev`，在测试用例或者源码上打 debugger 进行调试即可，例如：

   ![](/imgs/img3.png)

   在浏览器打开 test.html，f12 将进入 debugger 模式



## Vue3 complier 编译优化

[优化细节](https://www.processon.com/embed/5fc9eef75653bb7d2b2aba77)