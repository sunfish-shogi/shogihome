import { WebFrameMain } from "electron";
import { getAppLogger } from "@/background/log.js";
import { isDevelopment } from "@/background/proc/env.js";
import { t } from "@/common/i18n/index.js";

const allowedIPCSenders = [{ protocol: "app:", host: /^bundle$/ }];

export function validateIPCSender(frame: WebFrameMain | null) {
  if (isDevelopment()) {
    return;
  }
  if (!frame) {
    // TODO:
    //   electron 33.0.2 から 33.2.0 へのアップデートで frame が null になる可能性が生じるようになった。
    //   ただし、null になるのはナビゲーション中やフレーム破棄後であるとされ、ここに null が渡されるケースは無いと思われる。
    //   null の場合に例外を投げるようにしても良いが、十分な検証ができるまではエラーログの出力に留める。
    getAppLogger().error("validateIPCSender: frame is null");
    return;
  }
  const u = new URL(frame.url);
  for (const allowed of allowedIPCSenders) {
    if (u.protocol === allowed.protocol && allowed.host.test(u.host)) {
      return;
    }
  }
  const e = new Error(t.unexpectedEventSenderPleaseReport(frame.url));
  getAppLogger().error(e);
  throw e;
}
