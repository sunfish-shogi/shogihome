import { mobileWebAppURL, webAppURL } from "@/common/links/github.js";
import { Record, RecordMetadataKey } from "tsshogi";

describe("github", () => {
  it("webAppURL/noRecord", () => {
    expect(webAppURL()).toBe("https://sunfish-shogi.github.io/shogihome/webapp/index.html");
  });

  it("webAppURL/withRecord", () => {
    const record = Record.newByUSI(
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 2b3c 7i6h 3a4b",
    ) as Record;
    record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "bbb");
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "www");
    expect(webAppURL(record)).toBe(
      "https://sunfish-shogi.github.io/shogihome/webapp/index.html?usen=~0.6y22jm7ku2sq9co20q9ls3xq8lu1a49us09o.&branch=0&ply=12&bname=bbb&wname=www",
    );
  });

  it("mobileWebAppURL/noRecord", () => {
    expect(mobileWebAppURL()).toBe(
      "https://sunfish-shogi.github.io/shogihome/webapp/index.html?mobile",
    );
  });

  it("mobileWebAppURL/withRecord", () => {
    const record = Record.newByUSI(
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 2b3c 7i6h 3a4b",
    ) as Record;
    record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "bbb");
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "www");
    expect(mobileWebAppURL(record)).toBe(
      "https://sunfish-shogi.github.io/shogihome/webapp/index.html?usen=~0.6y22jm7ku2sq9co20q9ls3xq8lu1a49us09o.&branch=0&ply=12&bname=bbb&wname=www&mobile",
    );
  });
});
