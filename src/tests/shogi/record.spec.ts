import {
  Color,
  getNextColorFromUSI,
  importKakinoki,
  Move,
  Record,
  SpecialMove,
  specialMoveToDisplayString,
  Square,
} from "@/shogi";

describe("shogi/record", () => {
  it("constructor", () => {
    const record = new Record();
    expect(record.first.move).toBe(SpecialMove.START);
    expect(record.first.next).toBeNull();
    expect(record.first.comment).toBe("");
    expect(record.first.customData).toBeUndefined();
    expect(record.first.nextColor).toBe(Color.BLACK);
    expect(record.current).toBe(record.first);
  });

  it("clear", () => {
    const record = new Record();
    record.first.comment = "abc";
    record.first.customData = "foo bar baz";
    record.append(SpecialMove.INTERRUPT);
    expect(record.first.next).toBe(record.current);
    expect(record.first.comment).toBe("abc");
    expect(record.first.customData).toBe("foo bar baz");
    record.clear();
    expect(record.first.move).toBe(SpecialMove.START);
    expect(record.first.next).toBeNull();
    expect(record.first.comment).toBe("");
    expect(record.first.customData).toBeUndefined();
    expect(record.current).toBe(record.first);
  });

  it("displayString", () => {
    expect(specialMoveToDisplayString(SpecialMove.RESIGN)).toBe("投了");
    expect(specialMoveToDisplayString(SpecialMove.TIMEOUT)).toBe("切れ負け");
  });

  it("usi", () => {
    expect(getNextColorFromUSI("position startpos moves ")).toBe(Color.BLACK);
    expect(getNextColorFromUSI("position startpos moves 2g2f 8c8d 2f2e")).toBe(
      Color.WHITE
    );
    expect(
      getNextColorFromUSI(
        "position sfen lnsgkgsnl/1r5b1/p1ppppppp/1p7/7P1/9/PPPPPPP1P/1B5R1/LNSGKGSNL w - 1 moves 8d8e"
      )
    ).toBe(Color.BLACK);
  });

  it("append/goBack/goForward/goto", () => {
    const record = new Record();
    const move = (ff: number, fr: number, tf: number, tr: number): Move => {
      return record.position.createMove(
        new Square(ff, fr),
        new Square(tf, tr)
      ) as Move;
    };
    expect(record.append(move(7, 7, 7, 6))).toBeTruthy();
    expect(record.current.nextColor).toBe(Color.WHITE);
    expect(record.append(move(3, 3, 3, 4))).toBeTruthy();
    expect(record.current.nextColor).toBe(Color.BLACK);
    expect(record.append(move(2, 7, 2, 6))).toBeTruthy();
    expect(record.current.nextColor).toBe(Color.WHITE);
    expect(record.goBack()).toBeTruthy();
    expect(record.goBack()).toBeTruthy();
    expect(record.append(move(8, 3, 8, 4))).toBeTruthy();
    expect(record.append(move(7, 9, 7, 8))).toBeTruthy();

    expect(record.goBack()).toBeTruthy();
    expect(record.goBack()).toBeTruthy();
    expect(record.goBack()).toBeTruthy();
    expect(record.usi).toBe(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves"
    );
    expect(record.goBack()).toBeFalsy();

    expect(record.goForward()).toBeTruthy();
    record.goto(Number.MAX_SAFE_INTEGER);
    expect(record.usi).toBe(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 8c8d 7i7h"
    );
    expect(record.goForward()).toBeFalsy();

    record.goto(2);
    expect(record.usi).toBe(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 8c8d"
    );
    record.switchBranchByIndex(0);
    expect(record.usi).toBe(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d"
    );
  });

  it("repetition", () => {
    const data = `
手合割：平手
手数----指手---------消費時間--
   1 ２六歩(27)        ( 0:00/00:00:00)
   2 ８四歩(83)        ( 0:00/00:00:00)
   3 ７六歩(77)        ( 0:00/00:00:00)
   4 ８五歩(84)        ( 0:00/00:00:00)
   5 ７七角(88)        ( 0:00/00:00:00)
   6 ３四歩(33)        ( 0:00/00:00:00)
   7 ６八銀(79)        ( 0:00/00:00:00)
   8 ３二金(41)        ( 0:00/00:00:00)
   9 ２五歩(26)        ( 0:00/00:00:00)
  10 ７七角成(22)       ( 0:00/00:00:00)
  11 同　銀(68)        ( 0:00/00:00:00)
  12 ２二銀(31)        ( 0:00/00:00:00)
  13 ４八銀(39)        ( 0:00/00:00:00)
  14 ３三銀(22)        ( 0:00/00:00:00)
  15 ４六歩(47)        ( 0:00/00:00:00)
  16 ６二銀(71)        ( 0:00/00:00:00)
  17 ３六歩(37)        ( 0:00/00:00:00)
  18 ４二玉(51)        ( 0:00/00:00:00)
  19 ３七桂(29)        ( 0:00/00:00:00)
  20 ６四歩(63)        ( 0:00/00:00:00)
  21 ６八玉(59)        ( 0:00/00:00:00)
  22 ６三銀(62)        ( 0:00/00:00:00)
  23 ７八金(69)        ( 0:00/00:00:00)
  24 ７四歩(73)        ( 0:00/00:00:00)
  25 ４七銀(48)        ( 0:00/00:00:00)
  26 ７三桂(81)        ( 0:00/00:00:00)
  27 １六歩(17)        ( 0:00/00:00:00)
  28 １四歩(13)        ( 0:00/00:00:00)
  29 ９六歩(97)        ( 0:00/00:00:00)
  30 ９四歩(93)        ( 0:00/00:00:00)
  31 ４八金(49)        ( 0:00/00:00:00)
  32 ８一飛(82)        ( 0:00/00:00:00)
  33 ２九飛(28)        ( 0:00/00:00:00)
  34 ６二金(61)        ( 0:00/00:00:00)
  35 ５六銀(47)        ( 0:00/00:00:00)
  36 ５四銀(63)        ( 0:00/00:00:00)
  37 ６六歩(67)        ( 0:00/00:00:00)
  38 ６三銀(54)        ( 0:00/00:00:00)
  39 ４七銀(56)        ( 0:00/00:00:00)
  40 ５四銀(63)        ( 0:00/00:00:00)
  41 ５六銀(47)        ( 0:00/00:00:00)
  42 ６三銀(54)        ( 0:00/00:00:00)
  43 ４七銀(56)        ( 0:00/00:00:00)
  44 ５四銀(63)        ( 0:00/00:00:00)
  45 ５六銀(47)        ( 0:00/00:00:00)
  46 ６三銀(54)        ( 0:00/00:00:00)
  47 ４七銀(56)        ( 0:00/00:00:00)
  48 ５四銀(63)        ( 0:00/00:00:00)
  49 ５六銀(47)        ( 0:00/00:00:00)
`;
    const record = importKakinoki(data) as Record;
    record.goto(49);
    expect(record.repetition).toBeTruthy();
    expect(record.perpetualCheck).toBeFalsy();
    record.goBack();
    expect(record.repetition).toBeFalsy();
    expect(record.perpetualCheck).toBeFalsy();
  });

  it("perpetualCheck/black", () => {
    const data = `
後手の持駒：金 歩五 
  ９ ８ ７ ６ ５ ４ ３ ２ １
+---------------------------+
| 龍 ・ ・ ・ ・ ・ ・v桂v香|一
| ・ ・ ・ ・ ・ ・v銀 ・v玉|二
|v歩 ・v桂 ・ ・v銀 ・v銀 ・|三
| ・v金 ・ ・ ・ 角v歩 ・v歩|四
| ・ ・v歩 歩 歩 桂 歩v歩 ・|五
| 玉 歩v銀 ・ ・ 金 ・ ・ 歩|六
| 桂 ・ ・ ・v歩 ・ ・ ・ ・|七
| ・ 金 ・ ・ ・ ・v龍 ・ ・|八
| 香 香 ・ ・ ・ ・ ・ ・ ・|九
+---------------------------+
先手の持駒：角 香 歩二 
手数----指手---------消費時間--
   1 １三香打           ( 0:00/00:00:00)
   2 同　玉(12)        ( 0:00/00:00:00)
   3 ３一角打           ( 0:00/00:00:00)
   4 ２四玉(13)        ( 0:00/00:00:00)
   5 ４二角成(31)       ( 0:00/00:00:00)
   6 １三玉(24)        ( 0:00/00:00:00)
   7 ３一馬(42)        ( 0:00/00:00:00)
   8 ２四玉(13)        ( 0:00/00:00:00)
   9 ４二馬(31)        ( 0:00/00:00:00)
  10 １三玉(24)        ( 0:00/00:00:00)
  11 ３一馬(42)        ( 0:00/00:00:00)
  12 ２四玉(13)        ( 0:00/00:00:00)
  13 ４二馬(31)        ( 0:00/00:00:00)
  14 １三玉(24)        ( 0:00/00:00:00)
  15 ３一馬(42)        ( 0:00/00:00:00)
  16 ２四玉(13)        ( 0:00/00:00:00)
  17 ４二馬(31)        ( 0:00/00:00:00)
`;
    const record = importKakinoki(data) as Record;
    record.goto(17);
    expect(record.repetition).toBeTruthy();
    expect(record.perpetualCheck).toBe(Color.BLACK);
    record.goBack();
    expect(record.repetition).toBeFalsy();
    expect(record.perpetualCheck).toBeNull();
  });

  it("perpetualCheck/white", () => {
    const data = `
後手の持駒：歩三 
  ９ ８ ７ ６ ５ ４ ３ ２ １
+---------------------------+
| ・v桂 ・ ・ ・ ・ ・v香v香|一
| ・ ・ ・ ・ 飛 ・ ・v金 ・|二
| ・v金 ・ ・ 歩 ・ ・ ・v桂|三
|v歩 ・ ・ ・ ・ ・ 銀v歩v玉|四
| ・ 玉v歩 ・v歩v歩 歩 ・ ・|五
| 歩 ・ 歩v角 ・ ・ ・ 金 ・|六
| ・ 銀 ・ 銀 ・ ・ 桂 ・ 歩|七
| ・ ・ 銀 ・ ・ ・ ・ ・ ・|八
| 香 桂v馬 ・ ・ ・ ・ ・v龍|九
+---------------------------+
先手の持駒：金 香 歩五 
後手番
手数----指手---------消費時間--
   1 ７三桂(81)        ( 0:00/00:00:00)
   2 ８六玉(85)        ( 0:00/00:00:00)
   3 ６八馬(79)        ( 0:00/00:00:00)
   4 ９七玉(86)        ( 0:00/00:00:00)
   5 ７九馬(68)        ( 0:00/00:00:00)
   6 ８六玉(97)        ( 0:00/00:00:00)
   7 ６八馬(79)        ( 0:00/00:00:00)
   8 ９七玉(86)        ( 0:00/00:00:00)
   9 ７九馬(68)        ( 0:00/00:00:00)
  10 ８六玉(97)        ( 0:00/00:00:00)
  11 ６八馬(79)        ( 0:00/00:00:00)
  12 ９七玉(86)        ( 0:00/00:00:00)
  13 ７九馬(68)        ( 0:00/00:00:00)
  14 ８六玉(97)        ( 0:00/00:00:00)
`;
    const record = importKakinoki(data) as Record;
    record.goto(14);
    expect(record.repetition).toBeTruthy();
    expect(record.perpetualCheck).toBe(Color.WHITE);
    record.goBack();
    expect(record.repetition).toBeFalsy();
    expect(record.perpetualCheck).toBeNull();
  });

  it("newByUSI/position-startpos", () => {
    // 平手100手
    const data =
      "position startpos moves 2g2f 3c3d 7g7f 4c4d 3i4h 3a3b 5g5f 9c9d 9g9f 3b4c 4i5h 2b3c 3g3f 4a3b 7i7h 5c5d 6g6f 8b5b 5i6h 5a6b 6f6e 4d4e 8h3c+ 2a3c 7h6g 5d5e 5f5e 5b5e 6g6f 5e5a 6h7h 6b7b 5h6g 7b8b 6i6h 7a7b 4h5g 4e4f 4g4f B*4g B*1h 3d3e 3f3e P*3h 5g4h 4g5h+ 6f5g 5h4i 1h2g 3h3i+ 2g4i 3i4i 4h4g B*3i 2h1h 5a5g+ 6h5g 4i4h 4g3f S*2h 3e3d 2h2i 3d3c+ 2i1h+ 3c4c R*3h B*1f 4h4g 1f3h 4g5g 6g7g 3i4h+ 4c5b 4h3h 5b6a 3h5f 7h8h 7b6a R*5a N*8e G*7i G*6f R*5b 6a5b 5a5b+ R*7b 5b7b 8b7b R*5b 7b6a 5b5f+ 5g5f 7g7h R*4h B*4d 5f6g S*6b 6a7b 4d6f 6g6f resign";
    const record = Record.newByUSI(data) as Record;
    expect(record).toBeInstanceOf(Record);
    expect(record.length).toBe(100);
  });

  it("newByUSI/position-sfen", () => {
    // 飛車香落ち51手
    const data =
      "position sfen lnsgkgsn1/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 4c4d 2f2e 2b3c 1g1f 3a4b 1f1e 4b4c 2h1h 4a3b 1e1d 1c1d 1h1d P*1c 1d1h 5a4b 4g4f 6a7b 1h4h 7a6b 3i3h 5c5d 3h4g 6b5c 4g5f 7c7d P*1b 8a7c 4f4e 6c6d 4e4d 5c4d P*4e 4d5e 5f5e 5d5e S*4d 4c4d 4e4d S*5d 1b1a+ 3c1a S*1b 1a3c 1b2a P*4e 2a3b+ 4b3b N*6f";
    const record = Record.newByUSI(data) as Record;
    expect(record).toBeInstanceOf(Record);
    expect(record.length).toBe(51);
  });

  it("newByUSI/startpos", () => {
    // 平手100手
    const data =
      "startpos moves 2g2f 3c3d 7g7f 4c4d 3i4h 3a3b 5g5f 9c9d 9g9f 3b4c 4i5h 2b3c 3g3f 4a3b 7i7h 5c5d 6g6f 8b5b 5i6h 5a6b 6f6e 4d4e 8h3c+ 2a3c 7h6g 5d5e 5f5e 5b5e 6g6f 5e5a 6h7h 6b7b 5h6g 7b8b 6i6h 7a7b 4h5g 4e4f 4g4f B*4g B*1h 3d3e 3f3e P*3h 5g4h 4g5h+ 6f5g 5h4i 1h2g 3h3i+ 2g4i 3i4i 4h4g B*3i 2h1h 5a5g+ 6h5g 4i4h 4g3f S*2h 3e3d 2h2i 3d3c+ 2i1h+ 3c4c R*3h B*1f 4h4g 1f3h 4g5g 6g7g 3i4h+ 4c5b 4h3h 5b6a 3h5f 7h8h 7b6a R*5a N*8e G*7i G*6f R*5b 6a5b 5a5b+ R*7b 5b7b 8b7b R*5b 7b6a 5b5f+ 5g5f 7g7h R*4h B*4d 5f6g S*6b 6a7b 4d6f 6g6f resign";
    const record = Record.newByUSI(data) as Record;
    expect(record).toBeInstanceOf(Record);
    expect(record.length).toBe(100);
  });

  it("newByUSI/sfen", () => {
    // 飛車香落ち51手
    const data =
      "sfen lnsgkgsn1/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 4c4d 2f2e 2b3c 1g1f 3a4b 1f1e 4b4c 2h1h 4a3b 1e1d 1c1d 1h1d P*1c 1d1h 5a4b 4g4f 6a7b 1h4h 7a6b 3i3h 5c5d 3h4g 6b5c 4g5f 7c7d P*1b 8a7c 4f4e 6c6d 4e4d 5c4d P*4e 4d5e 5f5e 5d5e S*4d 4c4d 4e4d S*5d 1b1a+ 3c1a S*1b 1a3c 1b2a P*4e 2a3b+ 4b3b N*6f";
    const record = Record.newByUSI(data) as Record;
    expect(record).toBeInstanceOf(Record);
    expect(record.length).toBe(51);
  });

  it("newByUSI/moves", () => {
    // 平手100手
    const data =
      "moves 2g2f 3c3d 7g7f 4c4d 3i4h 3a3b 5g5f 9c9d 9g9f 3b4c 4i5h 2b3c 3g3f 4a3b 7i7h 5c5d 6g6f 8b5b 5i6h 5a6b 6f6e 4d4e 8h3c+ 2a3c 7h6g 5d5e 5f5e 5b5e 6g6f 5e5a 6h7h 6b7b 5h6g 7b8b 6i6h 7a7b 4h5g 4e4f 4g4f B*4g B*1h 3d3e 3f3e P*3h 5g4h 4g5h+ 6f5g 5h4i 1h2g 3h3i+ 2g4i 3i4i 4h4g B*3i 2h1h 5a5g+ 6h5g 4i4h 4g3f S*2h 3e3d 2h2i 3d3c+ 2i1h+ 3c4c R*3h B*1f 4h4g 1f3h 4g5g 6g7g 3i4h+ 4c5b 4h3h 5b6a 3h5f 7h8h 7b6a R*5a N*8e G*7i G*6f R*5b 6a5b 5a5b+ R*7b 5b7b 8b7b R*5b 7b6a 5b5f+ 5g5f 7g7h R*4h B*4d 5f6g S*6b 6a7b 4d6f 6g6f resign";
    const record = Record.newByUSI(data) as Record;
    expect(record).toBeInstanceOf(Record);
    expect(record.length).toBe(100);
  });

  it("newByUSI/sfen-no-moves", () => {
    // 平手途中局面・指し手無し
    const data =
      "sfen ln1g2g1l/2s2k3/2ppp3p/5p2b/P2r1N3/2P2P3/1P1PP1P1P/1SGKG2+R1/LN5NL b S5Pbs 57";
    const record = Record.newByUSI(data) as Record;
    expect(record).toBeInstanceOf(Record);
    expect(record.length).toBe(0);
  });
});
