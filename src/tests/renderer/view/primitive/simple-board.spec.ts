import { shallowMount } from "@vue/test-utils";
import { Position } from "tsshogi";
import { RectSize } from "@/common/assets/geometry.js";
import SimpleBoardView from "@/renderer/view/primitive/SimpleBoardView.vue";

const originalUserAgent = window.navigator.userAgent;

const setUserAgent = (value: string) => {
  Object.defineProperty(window.navigator, "userAgent", {
    value,
    configurable: true,
  });
};

const mountSimpleBoard = () => {
  return shallowMount(SimpleBoardView, {
    props: {
      maxSize: new RectSize(500, 500),
      position: new Position(),
    },
  });
};

const mountSimpleBoardWithTypeface = (typeface: "gothic" | "mincho") => {
  return shallowMount(SimpleBoardView, {
    props: {
      maxSize: new RectSize(500, 500),
      position: new Position(),
      typeface,
    },
  });
};

const parseDy = (dy: string | undefined) => {
  return Number.parseFloat(dy ?? "0");
};

describe("SimpleBoardView", () => {
  afterAll(() => {
    setUserAgent(originalUserAgent);
  });

  it("applies larger positive dy on Windows than on non-Windows", () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    const windowsWrapper = mountSimpleBoard();
    const windowsDy = parseDy(windowsWrapper.findAll("text").slice(18)[0].attributes("dy"));

    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    const macWrapper = mountSimpleBoard();
    const macDy = parseDy(macWrapper.findAll("text").slice(18)[0].attributes("dy"));

    expect(windowsDy).toBeGreaterThan(macDy);
    expect(macDy).toBe(0);
  });

  it("uses positive dy for both white and black board pieces on Windows mincho", () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    const wrapper = mountSimpleBoard();
    const pieceTexts = wrapper.findAll("text").slice(18);

    const whitePiece = pieceTexts.find((text) => !!text.attributes("transform"));
    const blackPiece = pieceTexts.find((text) => !text.attributes("transform"));
    if (!whitePiece || !blackPiece) {
      throw new Error("board pieces not found");
    }

    const whiteDy = parseDy(whitePiece.attributes("dy"));
    const blackDy = parseDy(blackPiece.attributes("dy"));

    expect(whiteDy).toBeGreaterThan(0);
    expect(blackDy).toBeGreaterThan(0);
  });

  it("does not apply dy correction to gothic on Windows", () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    const wrapper = mountSimpleBoardWithTypeface("gothic");
    const pieceTexts = wrapper.findAll("text").slice(18);
    const blackPiece = pieceTexts.find((text) => !text.attributes("transform"));
    if (!blackPiece) {
      throw new Error("black piece not found");
    }
    expect(parseDy(blackPiece.attributes("dy"))).toBe(0);
  });
});
