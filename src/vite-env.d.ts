/// <reference types="vite/client" />

/* eslint-disable */
// 組み込み WebAssembly エンジンの一覧 (plugins/builtin_engines.ts が生成する)。
declare module "virtual:shogihome/builtin-engines" {
  export const BUILTIN_ENGINE_DIRS: string[];
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
