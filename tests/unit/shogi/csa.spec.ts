import {
  exportCSA,
  importCSA,
  Move,
  PieceType,
  Position,
  Record,
  RecordMetadataKey,
  SpecialMove,
  Square,
} from "@/shogi";

describe("shogi/csa", () => {
  it("import/standard", () => {
    const data = `
' CSA形式棋譜ファイル Generated by Electron Shogi
V2.2
N+Electron John
N-Mr.Vue
$EVENT:TypeScript Festival
P1-KY-KE-GI-KI-OU-KI-GI-KE-KY
P2 * -HI *  *  *  *  * -KA * 
P3-FU-FU-FU-FU-FU-FU-FU-FU-FU
P4 *  *  *  *  *  *  *  *  * 
P5 *  *  *  *  *  *  *  *  * 
P6 *  *  *  *  *  *  *  *  * 
P7+FU+FU+FU+FU+FU+FU+FU+FU+FU
P8 * +KA *  *  *  *  * +HI * 
P9+KY+KE+GI+KI+OU+KI+GI+KE+KY
P+
P-
+
+7776FU
T0
-3334FU
T0
+8822UM
T10
-3122GI
T20
+0045KA
T30
%TORYO
T40
`;
    const record = importCSA(data) as Record;
    expect(record).toBeInstanceOf(Record);
    expect(
      record.metadata.getStandardMetadata(RecordMetadataKey.BLACK_NAME)
    ).toBe("Electron John");
    expect(
      record.metadata.getStandardMetadata(RecordMetadataKey.WHITE_NAME)
    ).toBe("Mr.Vue");
    expect(record.initialPosition.sfen).toBe(
      "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
    );
    expect(record.current.number).toBe(0);
    expect(record.current.move).toBe(SpecialMove.START);
    record.goto(1);
    expect((record.current.move as Move).getDisplayText()).toBe("▲７六歩(77)");
    record.goto(2);
    expect((record.current.move as Move).getDisplayText()).toBe("△３四歩(33)");
    record.goto(3);
    expect((record.current.move as Move).getDisplayText()).toBe(
      "▲２二角成(88)"
    );
    expect(record.current.elapsedMs).toBe(10000);
    record.goto(4);
    expect((record.current.move as Move).getDisplayText()).toBe("△２二銀(31)");
    expect(record.current.elapsedMs).toBe(20000);
    record.goto(5);
    expect((record.current.move as Move).getDisplayText()).toBe("▲４五角打");
    expect(record.current.elapsedMs).toBe(30000);
    record.goto(6);
    expect(record.current.move).toBe(SpecialMove.RESIGN);
    expect(record.current.elapsedMs).toBe(40000);
  });

  it("import/custom-position", () => {
    const data = `
V2.2
P1 *  *  *  *  *  *  * -KE * 
P2 *  *  *  *  *  * -KI-OU * 
P3 *  *  *  *  *  * -KI-FU+KE
P4 *  *  *  *  *  *  *  *  * 
P5 *  *  *  *  *  *  *  *  * 
P6 *  *  *  *  *  * -KA * +FU
P7 *  *  *  *  *  *  *  *  * 
P8 *  *  *  *  *  *  *  *  * 
P9 *  *  *  *  *  *  *  *  * 
P+00HI00HI00KI00KI
P-00AL
+
+1321NK,T0
-2221OU,T0
+0013KE,T0
-2122OU,T0
+0012KI,T0
-2212OU,T0
+0011HI,T0
-1211OU,T0
+0021KI,T0
-1112OU,T0
+0011HI,T0
%TSUMI,T0
`;
    const record = importCSA(data) as Record;
    expect(record).toBeInstanceOf(Record);
    expect(record.initialPosition.sfen).toBe(
      "sfen 7n1/6gk1/6gpN/9/9/6b1P/9/9/9 b 2R2Gb4s2n4l16p 1"
    );
    expect(record.current.number).toBe(0);
    expect(record.current.move).toBe(SpecialMove.START);
    record.goto(1);
    expect((record.current.move as Move).getDisplayText()).toBe(
      "▲２一桂成(13)"
    );
    record.goto(10);
    expect((record.current.move as Move).getDisplayText()).toBe("△１二玉(11)");
    record.goto(11);
    expect((record.current.move as Move).getDisplayText()).toBe("▲１一飛打");
    record.goto(12);
    expect(record.current.move).toBe(SpecialMove.MATE);
  });

  it("export/standard", () => {
    const record = new Record();
    record.metadata.setStandardMetadata(
      RecordMetadataKey.BLACK_NAME,
      "Electron John"
    );
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "Mr.Vue");
    record.metadata.setStandardMetadata(
      RecordMetadataKey.TITLE,
      "TypeScript Festival"
    );
    const move = (ff: number, fr: number, tf: number, tr: number): Move => {
      return record.position.createMove(
        new Square(ff, fr),
        new Square(tf, tr)
      ) as Move;
    };
    const drop = (pt: PieceType, tf: number, tr: number): Move => {
      return record.position.createMove(pt, new Square(tf, tr)) as Move;
    };
    record.append(move(7, 7, 7, 6));
    record.append(move(3, 3, 3, 4));
    record.append(move(8, 8, 2, 2).withPromote());
    record.append(move(3, 1, 2, 2));
    record.current.setElapsedMs(12345); // 12.345 seconds
    record.append(drop(PieceType.BISHOP, 4, 5));
    record.current.setElapsedMs(34567); // 34.567 seconds
    record.append(SpecialMove.RESIGN);
    record.current.setElapsedMs(56789); // 56.789 seconds
    expect(exportCSA(record, {}))
      .toBe(`' CSA形式棋譜ファイル Generated by Electron Shogi
V2.2
N+Electron John
N-Mr.Vue
$EVENT:TypeScript Festival
P1-KY-KE-GI-KI-OU-KI-GI-KE-KY
P2 * -HI *  *  *  *  * -KA * 
P3-FU-FU-FU-FU-FU-FU-FU-FU-FU
P4 *  *  *  *  *  *  *  *  * 
P5 *  *  *  *  *  *  *  *  * 
P6 *  *  *  *  *  *  *  *  * 
P7+FU+FU+FU+FU+FU+FU+FU+FU+FU
P8 * +KA *  *  *  *  * +HI * 
P9+KY+KE+GI+KI+OU+KI+GI+KE+KY
P+
P-
+
+7776FU
T0
-3334FU
T0
+8822UM
T0
-3122GI
T12
+0045KA
T34
%TORYO
T56
`);
  });

  it("export/custom-position", () => {
    const position = Position.newBySFEN(
      "sfen 7n1/6gk1/6gpN/9/9/6b1P/9/9/9 b 2R2Gb4s2n4l16p 1"
    ) as Position;
    const record = new Record(position) as Record;
    const move = (ff: number, fr: number, tf: number, tr: number): Move => {
      return record.position.createMove(
        new Square(ff, fr),
        new Square(tf, tr)
      ) as Move;
    };
    record.append(move(1, 3, 2, 1).withPromote());
    record.append(move(2, 2, 2, 1));
    expect(exportCSA(record, {}))
      .toBe(`' CSA形式棋譜ファイル Generated by Electron Shogi
V2.2
P1 *  *  *  *  *  *  * -KE * 
P2 *  *  *  *  *  * -KI-OU * 
P3 *  *  *  *  *  * -KI-FU+KE
P4 *  *  *  *  *  *  *  *  * 
P5 *  *  *  *  *  *  *  *  * 
P6 *  *  *  *  *  * -KA * +FU
P7 *  *  *  *  *  *  *  *  * 
P8 *  *  *  *  *  *  *  *  * 
P9 *  *  *  *  *  *  *  *  * 
P+00KI00KI00HI00HI
P-00FU00FU00FU00FU00FU00FU00FU00FU00FU00FU00FU00FU00FU00FU00FU00FU00KY00KY00KY00KY00KE00KE00GI00GI00GI00GI00KA
+
+1321NK
T0
-2221OU
T0
`);
  });
});
