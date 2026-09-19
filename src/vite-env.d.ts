/// <reference types="vite/client" />

/* eslint-disable */
// 組み込み WebAssembly エンジンの一覧 (plugins/builtin_engines.ts が生成する)。
declare module "virtual:shogihome/builtin-engines" {
  export const BUILTIN_ENGINE_DIRS: string[];
}

// 特別版のビルドの設定 (plugins/build_profile.ts が生成する)。
declare module "virtual:shogihome/build-profile" {
  export const buildProfile: {
    features: {
      mobileSearchTab: boolean;
    };
    license: {
      distribution?: { text: string; url: string; sourceURL?: string };
      thirdPartyURL?: string;
    };
  };
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
