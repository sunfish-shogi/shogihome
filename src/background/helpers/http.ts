import https from "node:https";
import http from "node:http";
import { getAppLogger } from "@/background/log.js";
import ejpn from "encoding-japanese";
import { RateLimiter, WindowRule } from "./limiter.js";
import { isTest } from "@/background/proc/env.js";
const convert = ejpn.convert;

const domainLimiter = new Map<string, RateLimiter>();
domainLimiter.set(
  "live4.computer-shogi.org",
  new RateLimiter([
    { limit: 1, windowMs: 1 * 1000 },
    { limit: 2, windowMs: 2 * 1000 },
    { limit: 3, windowMs: 4 * 1000 },
    { limit: 4, windowMs: 8 * 1000 },
    { limit: 5, windowMs: 12 * 1000 },
    { limit: 6, windowMs: 18 * 1000 },
  ]),
);
const commonRules: WindowRule[] = isTest()
  ? [{ limit: 100, windowMs: 1 * 1000 }]
  : [
      { limit: 2, windowMs: 1 * 1000 },
      { limit: 3, windowMs: 2 * 1000 },
      { limit: 4, windowMs: 4 * 1000 },
      { limit: 5, windowMs: 8 * 1000 },
      { limit: 6, windowMs: 12 * 1000 },
      { limit: 8, windowMs: 16 * 1000 },
    ];

export async function fetch(url: string): Promise<string> {
  const hostName = new URL(url).hostname;
  let limiter = domainLimiter.get(hostName);
  if (!limiter) {
    limiter = new RateLimiter(commonRules);
    domainLimiter.set(hostName, limiter);
  }

  await limiter.waitUntilAllowed();

  return new Promise((resolve, reject) => {
    const get = url.startsWith("http://") ? http.get : https.get;
    getAppLogger().debug(`fetch remote file: ${url}`);
    const req = get(url);
    req.setTimeout(5000, () => {
      reject(new Error(`request timeout: ${url}`));
      req.destroy();
    });
    req.on("error", (e) => {
      reject(new Error(`request failed: ${url}: ${e}`));
    });
    req.on("response", (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`request failed: ${url}: ${res.statusCode}`));
        return;
      }
      const data: Buffer[] = [];
      res
        .on("readable", () => {
          for (let chunk = res.read(); chunk; chunk = res.read()) {
            data.push(chunk);
          }
        })
        .on("end", () => {
          const concat = Buffer.concat(data);
          const decoded = convert(concat, { type: "string", to: "UNICODE" });
          resolve(decoded);
        })
        .on("error", (e) => {
          reject(new Error(`request failed: ${url}: ${e}`));
        });
    });
  });
}
