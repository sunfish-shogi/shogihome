import path from "node:path";
import { pathToFileURL } from "node:url";
import { CustomScheme, net } from "electron";
import { getBundlePath, isDevelopment } from "@/background/proc/env.js";
import { getAppLogger } from "@/background/log.js";
import { t } from "@/common/i18n/index.js";

export const APP_SCHEME: CustomScheme = {
  scheme: "app",
  privileges: {
    standard: true,
    secure: true,
  },
} as const;

export function handleApp(req: Request): Response | Promise<Response> {
  if (req.method !== "GET") {
    return new Response("method not allowed", { status: 405 });
  }
  const { host, pathname } = new URL(req.url);
  if (host === "bundle") {
    const baseDir = getBundlePath();
    const pathToServe = path.resolve(baseDir, pathname.replace(/^\/+/, ""));
    const relativePath = path.relative(baseDir, pathToServe);
    const isSafe = relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
    if (!isSafe) {
      return new Response("bad", { status: 400 });
    }
    return net.fetch(pathToFileURL(pathToServe).toString());
  }
  return new Response("not found", { status: 404 });
}

export const FILE_SCHEME: CustomScheme = {
  scheme: "user-file",
  privileges: {
    standard: true,
    secure: true,
  },
} as const;

const allowedUserFileExtensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];

export function handleUserFile(req: Request): Response | Promise<Response> {
  if (req.method !== "GET") {
    return new Response("method not allowed", { status: 405 });
  }
  const { host, pathname } = new URL(req.url);
  if (host === "localhost") {
    const ext = path.extname(pathname).toLowerCase();
    if (!allowedUserFileExtensions.includes(ext)) {
      return new Response("not allowed", { status: 403 });
    }
    const fileURL = "file://" + pathname;
    return net.fetch(fileURL);
  }
  return new Response("not found", { status: 404 });
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
  { protocol: "app:", host: /^bundle$/ },
  { protocol: "user-file:", host: /^localhost$/ },
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
