// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getEngineDisplayInfo, updateEngineDisplayInfo } from "@/background/usi/display.js";
import { emptyUSIEngine, USIEngineOption, USIEngines } from "@/common/settings/usi.js";
import { ENGINE_ABI } from "@/common/wasm-engine/manifest.js";

vi.mock("@/background/log.js", () => ({ getAppLogger: () => ({ warn: vi.fn() }) }));

function writeManifest(dir: string, fields: { [key: string]: unknown } = {}): string {
  const manifestPath = path.join(dir, "engine.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      abi: ENGINE_ABI,
      module: "engine.js",
      name: "Test Engine",
      author: "Test",
      ...fields,
      presets: [{ id: "test", displayName: "Test" }],
    }),
  );
  return manifestPath;
}

function writeBanner(dir: string, name: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, "");
  return filePath;
}

function stringOption(name: string, defaultValue: string, value?: string): USIEngineOption {
  return { name, type: "string", order: 0, default: defaultValue, value };
}

function bannerURL(filePath: string): string {
  return `${pathToFileURL(filePath).href}?v=${Math.floor(fs.statSync(filePath).mtimeMs)}`;
}

describe("background/usi/display", () => {
  let tempDir: string;

  beforeEach(() => {
    // バナー画像のパスは実体のパスになるため、一時ディレクトリも実体のパスにしておく。
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-display-")));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("getEngineDisplayInfo", async () => {
    const manifestPath = writeManifest(tempDir, {
      banner: "images/banner.png",
      description: "Description",
      links: [{ label: "Website", url: "https://example.com/engine/" }],
    });
    expect(await getEngineDisplayInfo(manifestPath)).toStrictEqual({
      banners: [
        {
          url: pathToFileURL(path.join(tempDir, "images", "banner.png")).href,
          source: "manifest",
        },
      ],
      description: "Description",
      links: [{ label: "Website", url: "https://example.com/engine/" }],
    });
  });

  it("getEngineDisplayInfo/notDeclared", async () => {
    const manifestPath = writeManifest(tempDir);
    expect(await getEngineDisplayInfo(manifestPath)).toStrictEqual({});
  });

  it("getEngineDisplayInfo/nativeEngine/noBanner", async () => {
    expect(await getEngineDisplayInfo(path.join(tempDir, "engine.exe"))).toStrictEqual({});
  });

  it("getEngineDisplayInfo/nativeEngine", async () => {
    const engineDir = path.join(tempDir, "engine");
    const evalDir = path.join(engineDir, "eval");
    const bookDir = path.join(tempDir, "book");
    fs.mkdirSync(evalDir, { recursive: true });
    fs.mkdirSync(bookDir, { recursive: true });
    const engineBanner = writeBanner(engineDir, "banner.png");
    // 大文字・小文字は区別しない。
    const evalBanner = writeBanner(evalDir, "Banner.JPG");
    const bookBanner = writeBanner(bookDir, "banner.webp");
    // banner.* 以外は無視する。
    writeBanner(bookDir, "banner2.png");
    writeBanner(bookDir, "banner.svg");
    const info = await getEngineDisplayInfo(path.join(engineDir, "engine.exe"), {
      // 相対パスはエンジンのディレクトリを起点に解決する。
      EvalDir: stringOption("EvalDir", "eval"),
      BookDir: stringOption("BookDir", "book", bookDir),
    });
    expect(info).toStrictEqual({
      banners: [
        { url: bannerURL(engineBanner), source: "engine" },
        { url: bannerURL(evalBanner), source: "EvalDir" },
        { url: bannerURL(bookBanner), source: "BookDir" },
      ],
    });
  });

  it("getEngineDisplayInfo/nativeEngine/priority", async () => {
    // 1 つのディレクトリに複数ある場合は拡張子の優先順で 1 つだけ選ぶ。
    writeBanner(tempDir, "banner.webp");
    const png = writeBanner(tempDir, "banner.png");
    writeBanner(tempDir, "banner.jpg");
    expect(await getEngineDisplayInfo(path.join(tempDir, "engine.exe"))).toStrictEqual({
      banners: [{ url: bannerURL(png), source: "engine" }],
    });
  });

  it("getEngineDisplayInfo/nativeEngine/sameOrMissingDir", async () => {
    const banner = writeBanner(tempDir, "banner.png");
    const info = await getEngineDisplayInfo(path.join(tempDir, "engine.exe"), {
      // エンジンのディレクトリと同じ場合は重複して並べない。
      EvalDir: stringOption("EvalDir", "."),
      // 存在しないディレクトリは無視する。
      BookDir: stringOption("BookDir", "not-found"),
    });
    expect(info).toStrictEqual({
      banners: [{ url: bannerURL(banner), source: "engine" }],
    });
  });

  it("getEngineDisplayInfo/nativeEngine/symlink", async () => {
    const bookDir = path.join(tempDir, "book");
    fs.mkdirSync(bookDir);
    const banner = writeBanner(bookDir, "banner.png");
    fs.symlinkSync(bookDir, path.join(tempDir, "link"), "junction");
    const info = await getEngineDisplayInfo(path.join(tempDir, "engine.exe"), {
      // リンクを経由して同じディレクトリを指している場合も重複して並べない。
      EvalDir: stringOption("EvalDir", "book"),
      BookDir: stringOption("BookDir", "link"),
    });
    expect(info).toStrictEqual({
      banners: [{ url: bannerURL(banner), source: "EvalDir" }],
    });
  });

  it("getEngineDisplayInfo/nativeEngine/onlyOptionDir", async () => {
    const bookDir = path.join(tempDir, "book");
    fs.mkdirSync(bookDir);
    const banner = writeBanner(bookDir, "banner.gif");
    const info = await getEngineDisplayInfo(path.join(tempDir, "engine.exe"), {
      EvalDir: stringOption("EvalDir", "<empty>"),
      BookDir: stringOption("BookDir", "book"),
    });
    expect(info).toStrictEqual({
      banners: [{ url: bannerURL(banner), source: "BookDir" }],
    });
  });

  it("getEngineDisplayInfo/brokenManifest", async () => {
    const manifestPath = path.join(tempDir, "engine.json");
    fs.writeFileSync(manifestPath, "{");
    expect(await getEngineDisplayInfo(manifestPath)).toStrictEqual({});
  });

  it("updateEngineDisplayInfo", async () => {
    const manifestPath = writeManifest(tempDir, {
      banner: "banner.png",
      description: "Description",
    });
    const engines = new USIEngines();
    // マニフェストに無い項目は保存された値を消す。
    engines.addEngine({
      ...emptyUSIEngine(),
      uri: "es://usi-engine/wasm",
      name: "wasm",
      path: manifestPath,
      links: [{ label: "Stale", url: "https://example.com/stale/" }],
    });
    // 保存された値は使わない。
    engines.addEngine({
      ...emptyUSIEngine(),
      uri: "es://usi-engine/native",
      name: "native",
      path: path.join(tempDir, "native", "engine.exe"),
      banners: [{ url: "file:///stale.png", source: "engine" }],
      description: "Stale",
      links: [{ label: "Stale", url: "https://example.com/stale/" }],
    });
    await updateEngineDisplayInfo(engines);
    const wasm = engines.getEngine("es://usi-engine/wasm");
    expect(wasm?.banners).toStrictEqual([
      { url: pathToFileURL(path.join(tempDir, "banner.png")).href, source: "manifest" },
    ]);
    expect(wasm?.description).toBe("Description");
    expect(wasm).not.toHaveProperty("links");
    const native = engines.getEngine("es://usi-engine/native");
    expect(native).not.toHaveProperty("banners");
    expect(native).not.toHaveProperty("description");
    expect(native).not.toHaveProperty("links");
  });

  it("updateEngineDisplayInfo/nativeEngine", async () => {
    const engineDir = path.join(tempDir, "native");
    fs.mkdirSync(engineDir);
    const engines = new USIEngines();
    engines.addEngine({
      ...emptyUSIEngine(),
      uri: "es://usi-engine/native",
      name: "native",
      path: path.join(engineDir, "engine.exe"),
      // 以前のバージョンで保存された banner は取り除く。
      ...{ banner: "file:///legacy.png" },
    });
    await updateEngineDisplayInfo(engines);
    expect(engines.getEngine("es://usi-engine/native")).not.toHaveProperty("banner");
    expect(engines.getEngine("es://usi-engine/native")).not.toHaveProperty("banners");

    // 登録後に置かれたバナー画像も、次に読み込んだときに反映する。
    const banner = writeBanner(engineDir, "banner.png");
    await updateEngineDisplayInfo(engines);
    expect(engines.getEngine("es://usi-engine/native")?.banners).toStrictEqual([
      { url: bannerURL(banner), source: "engine" },
    ]);
  });
});
