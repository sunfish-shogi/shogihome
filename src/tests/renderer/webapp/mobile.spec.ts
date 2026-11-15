import {
  isLikelyMobileDevice,
  mobileModeRecommendationStorageKey,
  recommendMobileMode,
  shouldRecommendMobileMode,
} from "@/renderer/webapp/mobile.js";
import { useConfirmationStore } from "@/renderer/store/confirm.js";

const desktopUA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const iPhoneUA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const androidTabletUA =
  "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const macUA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

type DeviceOptions = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  mobile?: boolean;
  media?: { [query: string]: boolean };
};

describe("webapp/mobile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    useConfirmationStore().cancel();
  });

  function stubDevice(options: DeviceOptions, url = "http://localhost/") {
    vi.stubGlobal("navigator", {
      userAgent: options.userAgent,
      platform: options.platform ?? "Win32",
      maxTouchPoints: options.maxTouchPoints ?? 0,
      userAgentData: options.mobile !== undefined ? { mobile: options.mobile } : undefined,
    });
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: { href: url, toString: () => url, assign },
      matchMedia: (query: string) => ({ matches: !!options.media?.[query] }),
    });
    return assign;
  }

  it("isLikelyMobileDevice", () => {
    stubDevice({ userAgent: desktopUA, media: { "(any-pointer: fine)": true } });
    expect(isLikelyMobileDevice()).toBeFalsy();
    stubDevice({ userAgent: iPhoneUA });
    expect(isLikelyMobileDevice()).toBeTruthy();
    stubDevice({ userAgent: androidTabletUA });
    expect(isLikelyMobileDevice()).toBeTruthy();
    stubDevice({ userAgent: desktopUA, mobile: true });
    expect(isLikelyMobileDevice()).toBeTruthy();
    // iPadOS
    stubDevice({ userAgent: macUA, platform: "MacIntel", maxTouchPoints: 5 });
    expect(isLikelyMobileDevice()).toBeTruthy();
    // Mac
    stubDevice({ userAgent: macUA, platform: "MacIntel", maxTouchPoints: 0 });
    expect(isLikelyMobileDevice()).toBeFalsy();
    // タッチ操作のみの端末
    stubDevice({ userAgent: desktopUA, media: { "(pointer: coarse)": true } });
    expect(isLikelyMobileDevice()).toBeTruthy();
    // タッチパネル付きの PC
    stubDevice({
      userAgent: desktopUA,
      media: { "(pointer: coarse)": true, "(any-pointer: fine)": true },
    });
    expect(isLikelyMobileDevice()).toBeFalsy();
  });

  it("shouldRecommendMobileMode", () => {
    stubDevice({ userAgent: iPhoneUA });
    expect(shouldRecommendMobileMode()).toBeTruthy();
    stubDevice({ userAgent: iPhoneUA }, "http://localhost/?mobile");
    expect(shouldRecommendMobileMode()).toBeFalsy();
    stubDevice({ userAgent: desktopUA });
    expect(shouldRecommendMobileMode()).toBeFalsy();
    stubDevice({ userAgent: iPhoneUA });
    localStorage.setItem(mobileModeRecommendationStorageKey, "declined");
    expect(shouldRecommendMobileMode()).toBeFalsy();
  });

  it("recommendMobileMode/yes", () => {
    const assign = stubDevice({ userAgent: iPhoneUA }, "http://localhost/?usen=abc");
    recommendMobileMode();
    const confirmation = useConfirmationStore();
    expect(confirmation.message).toBeTruthy();
    expect(confirmation.buttonType).toBe("yesNo");
    confirmation.ok();
    expect(assign).toBeCalledWith("http://localhost/?usen=abc&mobile=");
    expect(localStorage.getItem(mobileModeRecommendationStorageKey)).toBeNull();
  });

  it("recommendMobileMode/no", () => {
    const assign = stubDevice({ userAgent: iPhoneUA });
    recommendMobileMode();
    const confirmation = useConfirmationStore();
    expect(confirmation.message).toBeTruthy();
    confirmation.cancel();
    expect(assign).not.toBeCalled();
    expect(localStorage.getItem(mobileModeRecommendationStorageKey)).toBe("declined");
    recommendMobileMode();
    expect(confirmation.message).toBeUndefined();
  });

  it("recommendMobileMode/otherConfirmation", () => {
    stubDevice({ userAgent: iPhoneUA });
    const confirmation = useConfirmationStore();
    confirmation.show({ message: "other", onOk: () => {} });
    recommendMobileMode();
    expect(confirmation.message).toBe("other");
    expect(localStorage.getItem(mobileModeRecommendationStorageKey)).toBeNull();
  });
});
