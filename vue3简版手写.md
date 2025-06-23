# 手写 vue3



手写 vue3 核心功能，主要包含核心包：

- 编译时：
  - compiler-core：与平台无关的核心编译模块
  - compiler-dom：与浏览器相关的编译模块
  - compiler-sfc：单文件解析

- 运行时
  - runtime-core：与平台无关的运行时核心包
  - runtime-dom：浏览器运行时
  - reactivity：响应式系统



## 目录结构

```text
mini-vue
├── vue                          // vue 源码目录
│   ├── packages
│   │   ├── vue
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── rollup.config.js
├── vue-debug                    // 调试 vue 源码的项目
│   ├── index.html               // 具体调试文件
├── .gitignore
└── readme.md
```