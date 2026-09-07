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

const mountSimpleBoardWithHeaderAndFooter = (options: {
  header: string;
  hideFooter: boolean;
  fontScale?: number;
}) => {
  return shallowMount(SimpleBoardView, {
    props: {
      maxSize: new RectSize(500, 500),
      position: new Position(),
      header: options.header,
      footer: "コメント",
      hideFooter: options.hideFooter,
      fontScale: options.fontScale ?? 1,
    },
  });
};

const getVerticalGeometry = (wrapper: ReturnType<typeof mountSimpleBoardWithHeaderAndFooter>) => {
  const header = wrapper.find(".header");
  const image = wrapper.find("image");
  const boardImageTop = Number(image.attributes("y"));
  const fileLabel = wrapper.findAll("text")[0];
  return {
    headerTop: header.exists()
      ? Number.parseFloat((header.element as HTMLElement).style.top)
      : undefined,
    fileLabelTop: Number(fileLabel.attributes("y")) - Number(fileLabel.attributes("font-size")) / 2,
    boardImageTop,
    bottomMargin: 500 - (boardImageTop + Number(image.attributes("height"))),
  };
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

  it("keeps the layout as is when the footer is visible", () => {
    const wrapper = mountSimpleBoardWithHeaderAndFooter({ header: "見出し", hideFooter: false });
    expect(wrapper.find(".footer").exists()).toBe(true);
    const geometry = getVerticalGeometry(wrapper);
    expect(geometry.headerTop).toBeCloseTo(500 * 0.017);
    expect(geometry.boardImageTop).toBeCloseTo(500 * (0.12 - 0.004));
  });

  it("balances the margins above the header and below the board when the footer is hidden", () => {
    const wrapper = mountSimpleBoardWithHeaderAndFooter({ header: "見出し", hideFooter: true });
    expect(wrapper.find(".footer").exists()).toBe(false);
    const geometry = getVerticalGeometry(wrapper);
    expect(geometry.headerTop).toBeCloseTo(geometry.bottomMargin);
    const withFooterGeometry = getVerticalGeometry(
      mountSimpleBoardWithHeaderAndFooter({ header: "見出し", hideFooter: false }),
    );
    expect(geometry.boardImageTop - (geometry.headerTop as number)).toBeCloseTo(
      withFooterGeometry.boardImageTop - (withFooterGeometry.headerTop as number),
    );
  });

  it("balances the margins above the file labels when the header is empty", () => {
    for (const fontScale of [1, 2]) {
      const wrapper = mountSimpleBoardWithHeaderAndFooter({
        header: "",
        hideFooter: true,
        fontScale,
      });
      const geometry = getVerticalGeometry(wrapper);
      expect(geometry.headerTop).toBeUndefined();
      expect(geometry.fileLabelTop).toBeCloseTo(geometry.bottomMargin);
    }
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
