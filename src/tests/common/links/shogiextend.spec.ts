import { shogiExtendSharedBoardURL } from "@/common/links/shogiextend.js";
import { Record } from "tsshogi";

describe("shogiextend", () => {
  it("shogiExtendSharedBoardURL", () => {
    const record = Record.newByUSI(
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 2b3c 7i6h 3a4b",
    );
    expect(shogiExtendSharedBoardURL(record as Record)).toBe(
      "https://www.shogi-extend.com/share-board?turn=12&xbody=cG9zaXRpb24gc3RhcnRwb3MgbW92ZXMgMmcyZiAzYzNkIDdnN2YgNWM1ZCAzaTRoIDhiNWIgNWk2aCA1ZDVlIDZoN2ggMmIzYyA3aTZoIDNhNGI",
    );
  });
});
