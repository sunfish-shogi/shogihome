import { Language } from "@/common/i18n/index.js";
import { takeLanguageQueryParam } from "@/renderer/webapp/language.js";

describe("webapp/language", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function stubWindow(url: string) {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { toString: () => url },
      history: { state: null, replaceState },
    });
    return replaceState;
  }

  it("noQuery", () => {
    const replaceState = stubWindow("http://localhost/?mobile");
    expect(takeLanguageQueryParam()).toBeUndefined();
    expect(replaceState).not.toBeCalled();
  });

  it("withoutSavedSettings", () => {
    const replaceState = stubWindow("http://localhost/?mobile&lang=en");
    expect(takeLanguageQueryParam()).toStrictEqual({
      language: Language.EN,
      hasSavedAppSettings: false,
    });
    expect(replaceState).toBeCalledWith(null, "", "http://localhost/?mobile=");
  });

  it("withSavedSettings", () => {
    localStorage.setItem("appSetting", "{}");
    const replaceState = stubWindow("http://localhost/?lang=zh_tw");
    expect(takeLanguageQueryParam()).toStrictEqual({
      language: Language.ZH_TW,
      hasSavedAppSettings: true,
    });
    expect(replaceState).toBeCalledWith(null, "", "http://localhost/");
  });

  it("japanese", () => {
    const replaceState = stubWindow("http://localhost/?lang=ja");
    expect(takeLanguageQueryParam()).toBeUndefined();
    expect(replaceState).toBeCalledWith(null, "", "http://localhost/");
  });

  it("invalid", () => {
    const replaceState = stubWindow("http://localhost/?lang=xx");
    expect(takeLanguageQueryParam()).toBeUndefined();
    expect(replaceState).toBeCalledWith(null, "", "http://localhost/");
  });
});
