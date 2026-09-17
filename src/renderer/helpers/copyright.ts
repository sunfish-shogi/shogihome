import { t } from "@/common/i18n/index.js";
import { licenseURL, thirdPartyLicenseURL } from "@/common/links/github.js";
import { materialIconsGuideURL } from "@/common/links/google.js";
import { Attachment } from "@/common/message.js";
import { isNative } from "@/renderer/ipc/api.js";
import { loadBuiltinEngineLicenses } from "@/renderer/wasm-engine/catalog.js";
import { useMessageStore } from "@/renderer/store/message.js";

// 組み込み WebAssembly エンジンのライセンス。
//
// エンジンを配布物に含むのは Web 版だけで (Electron 版は .electron-builder.config.mjs の
// files に engines/ を含めない)、ライセンスの内容はエンジンのマニフェストが持つ。
// そのためここでの取得は非同期になる。読み込めなかったエンジンは catalog.ts 側で
// 除外されるため、ライセンス表示そのものは妨げない。
async function builtinEngineAttachments(): Promise<Attachment[]> {
  if (isNative()) {
    return [];
  }
  const attachments: Attachment[] = [];
  for (const license of await loadBuiltinEngineLicenses()) {
    attachments.push({
      type: "link",
      text: `${license.subject} (${license.spdx})`,
      url: license.url,
    });
    if (license.source) {
      attachments.push({
        type: "link",
        text: `${license.subject} Source Code`,
        url: license.source,
      });
    }
  }
  return attachments;
}

export async function openCopyright(): Promise<void> {
  useMessageStore().enqueue({
    text: "Copyright and License",
    attachments: [
      {
        type: "link",
        text: t.shogiHome,
        url: licenseURL,
      },
      {
        type: "link",
        text: "Third Party Libraries",
        url: thirdPartyLicenseURL,
      },
      {
        type: "link",
        text: "Material Icons",
        url: materialIconsGuideURL,
      },
      ...(await builtinEngineAttachments()),
    ],
  });
}
