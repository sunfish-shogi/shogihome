import https from "node:https";
import http from "node:http";
import { getAppLogger } from "@/background/log.js";
import ejpn from "encoding-japanese";
const convert = ejpn.convert;

export function fetch(url: string): Promise<string> {
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
