import https from "node:https";
import http from "node:http";
import { getAppLogger } from "@/background/log.js";
import ejpn from "encoding-japanese";
import { RateLimiter, WindowRule } from "./limitter.js";
import { isTest } from "@/background/proc/env.js";
const convert = ejpn.convert;

const domainLimiter = new Map<string, RateLimiter>();
const commonRules: WindowRule[] = isTest()
  ? [{ limit: 100, windowSec: 1 }]
  : [
      { limit: 2, windowSec: 1 },
      { limit: 3, windowSec: 2 },
      { limit: 4, windowSec: 4 },
      { limit: 6, windowSec: 8 },
      { limit: 8, windowSec: 16 },
      { limit: 10, windowSec: 24 },
      { limit: 12, windowSec: 32 },
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
