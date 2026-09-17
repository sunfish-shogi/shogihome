import { t } from "@/common/i18n/index.js";
import { licenseURL, thirdPartyLicenseURL } from "@/common/links/github.js";
import { materialIconsGuideURL } from "@/common/links/google.js";
import { Attachment } from "@/common/message.js";
import { isNative } from "@/renderer/ipc/api.js";
import { loadBuiltinEngineLicenses } from "@/renderer/wasm-engine/catalog.js";
import { useMessageStore } from "@/renderer/store/message.js";
import { buildProfile } from "virtual:shogihome/build-profile";

// 配布物 (結合物) 自身のライセンス。
//
// 本家の配布物は MIT で、上の t.shogiHome のリンクがそれにあたる。特別版では
// 組み込んだエンジンのライセンス次第で結合物全体の条件が変わるため
// (GPL のエンジンを組み込めば結合物も GPL になる)、ビルドプロファイルで足せるようにしてある。
function distributionAttachments(): Attachment[] {
  const distribution = buildProfile.license.distribution;
  if (!distribution) {
    return [];
  }
  const attachments: Attachment[] = [
    {
      type: "link",
      text: distribution.text,
      url: distribution.url,
    },
  ];
  if (distribution.sourceURL) {
    attachments.push({
      type: "link",
      text: `${distribution.text} Source Code`,
      url: distribution.sourceURL,
    });
  }
  return attachments;
}

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
      ...distributionAttachments(),
      {
        type: "link",
        text: "Third Party Libraries",
        // 依存するライブラリは配布物ごとに変わり得るため、一覧の URL も差し替えられる。
        url: buildProfile.license.thirdPartyURL || thirdPartyLicenseURL,
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
