import { t } from "@/common/i18n/index.js";
import { licenseURL, thirdPartyLicenseURL } from "@/common/links/github.js";
import { materialIconsGuideURL } from "@/common/links/google.js";
import { useMessageStore } from "@/renderer/store/message.js";

export function openCopyright() {
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
    ],
  });
}
