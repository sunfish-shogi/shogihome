import { WebFrameMain } from "electron";
import { getAppLogger } from "@/background/log.js";
import { isDevelopment } from "@/background/proc/env.js";
import { t } from "@/common/i18n/index.js";

const allowedIPCSenders = [
  { protocol: "http:", host: /^localhost:[0-9]+$/ },
  { protocol: "file:", host: /^$/ },
];

export function validateIPCSender(frame: WebFrameMain | null) {
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

function validateHTTPRequestMethod(method: string) {
  if (method === "GET") {
    return;
  }
  const e = new Error(t.unexpectedHTTPMethodPleaseReport(method));
  getAppLogger().error(e);
  throw e;
}

const allowedHTTPRequestURLs = [
  { protocol: "http:", host: /^localhost:[0-9]+$/ },
  { protocol: "ws:", host: /^localhost:[0-9]+$/ },
  { protocol: "file:", host: /^$/ },
  { protocol: "devtools:" },
];

function validateHTTPRequestURL(url: string) {
  if (isDevelopment()) {
    return;
  }
  const u = new URL(url);
  for (const allowed of allowedHTTPRequestURLs) {
    if (u.protocol === allowed.protocol && (!allowed.host || allowed.host.test(u.host))) {
      return;
    }
  }
  const e = new Error(t.unexpectedRequestURLPleaseReport(url));
  getAppLogger().error(e);
  throw e;
}

export function validateHTTPRequest(method: string, url: string) {
  validateHTTPRequestMethod(method);
  validateHTTPRequestURL(url);
}
