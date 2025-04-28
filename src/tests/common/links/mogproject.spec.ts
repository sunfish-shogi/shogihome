import { shogiPlaygroundURL } from "@/common/links/mogproject.js";
import { Record, RecordMetadataKey } from "tsshogi";

describe("mogproject", () => {
  it("shogiPlaygroundURL/recordOnly", () => {
    const record = Record.newByUSI(
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 2b3c 7i6h 3a4b",
    ) as Record;
    expect(shogiPlaygroundURL(record)).toBe(
      "https://play.mogproject.com/?u=~0.6y22jm7ku2sq9co20q9ls3xq8lu1a49us09o.&move=12&flip=false&bn=&wn=",
    );
  });

  it("shogiPlaygroundURL/flipped", () => {
    const record = Record.newByUSI(
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 2b3c 7i6h 3a4b",
    ) as Record;
    expect(shogiPlaygroundURL(record, true)).toBe(
      "https://play.mogproject.com/?u=~0.6y22jm7ku2sq9co20q9ls3xq8lu1a49us09o.&move=12&flip=true&bn=&wn=",
    );
  });

  it("shogiPlaygroundURL/withPlayerNames", () => {
    const record = Record.newByUSI(
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 2b3c 7i6h 3a4b",
    ) as Record;
    record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "Sente Name");
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "Gote Name");
    expect(shogiPlaygroundURL(record)).toBe(
      "https://play.mogproject.com/?u=~0.6y22jm7ku2sq9co20q9ls3xq8lu1a49us09o.&move=12&flip=false&bn=Sente%20Name&wn=Gote%20Name",
    );
  });
});
