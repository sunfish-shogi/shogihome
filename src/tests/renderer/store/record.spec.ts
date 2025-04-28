import { CommentBehavior, SearchCommentFormat } from "@/common/settings/comment.js";
import {
  Color,
  InitialPositionSFEN,
  InitialPositionType,
  Move,
  PieceType,
  RecordFormatType,
  RecordMetadataKey,
  SpecialMoveType,
  Square,
  formatPV,
  specialMove,
} from "tsshogi";
import { SCORE_MATE_INFINITE } from "@/common/game/usi.js";
import { RecordManager, SearchInfoSenderType } from "@/renderer/store/record.js";

describe("store/record", () => {
  it("new", () => {
    const recordManager = new RecordManager();
    expect(recordManager.unsaved).toBeFalsy();
    expect(recordManager.record.position.sfen).toBe(InitialPositionSFEN.STANDARD);
    expect(recordManager.record.moves).toHaveLength(1);
  });

  it("reset", () => {
    const recordManager = new RecordManager();
    recordManager.appendMove({ move: specialMove(SpecialMoveType.RESIGN) });
    expect(recordManager.record.moves).toHaveLength(2);
    expect(recordManager.unsaved).toBeTruthy();

    // 指定した局面 (SFEN) で初期化する。
    recordManager.resetBySFEN(InitialPositionSFEN.HANDICAP_4PIECES);
    expect(recordManager.record.position.sfen).toBe(InitialPositionSFEN.HANDICAP_4PIECES);
    expect(recordManager.record.moves).toHaveLength(1);
    expect(recordManager.unsaved).toBeFalsy();

    // 1 手追加する。
    recordManager.appendMove({ move: specialMove(SpecialMoveType.RESIGN) });
    expect(recordManager.record.moves).toHaveLength(2);
    expect(recordManager.unsaved).toBeTruthy();

    // 指定した局面で初期化する。
    recordManager.resetByInitialPositionType(InitialPositionType.HANDICAP_ROOK);
    expect(recordManager.record.position.sfen).toBe(InitialPositionSFEN.HANDICAP_ROOK);
    expect(recordManager.record.moves).toHaveLength(1);
    expect(recordManager.unsaved).toBeFalsy();

    // 1 手追加する。
    recordManager.appendMove({
      move: new Move(new Square(3, 3), new Square(3, 4), false, Color.WHITE, PieceType.PAWN, null),
    });
    expect(recordManager.record.moves).toHaveLength(2);
    expect(recordManager.record.current.ply).toBe(1);
    expect(recordManager.unsaved).toBeTruthy();

    // 指し手をすべて削除する。
    recordManager.reset();
    expect(recordManager.record.position.sfen).toBe(InitialPositionSFEN.HANDICAP_ROOK);
    expect(recordManager.record.moves).toHaveLength(1);
    expect(recordManager.unsaved).toBeFalsy();

    // 1 手追加する。
    recordManager.appendMove({
      move: new Move(new Square(3, 3), new Square(3, 4), false, Color.WHITE, PieceType.PAWN, null),
    });
    expect(recordManager.record.moves).toHaveLength(2);
    expect(recordManager.record.current.ply).toBe(1);
    expect(recordManager.unsaved).toBeTruthy();

    // 現在の局面で初期化する。
    recordManager.resetByCurrentPosition();
    expect(recordManager.record.position.sfen).toBe(
      "lnsgkgsnl/7b1/pppppp1pp/6p2/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );
    expect(recordManager.record.moves).toHaveLength(1);
    expect(recordManager.unsaved).toBeFalsy();
  });

  it("changePieceSet/from_standard", () => {
    const recordManager = new RecordManager();
    recordManager.changePieceSet({
      king: 1, // -1
      rook: 1, // -1
      bishop: 3, // +1
      gold: 3, // -1
      silver: 6, // +2
      knight: 2, // -2
      lance: 3, // -1
      pawn: 15, // -3
    });
    expect(recordManager.record.position.sfen).toBe(
      "BSsS1gs1l/7b1/3pppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );
  });

  it("changePieceSet/with_hands", () => {
    const recordManager = new RecordManager();
    recordManager.resetBySFEN(
      "l6nl/9/p3p2pp/2p3p2/3pk2P1/P1P3P2/3PP3P/1g1+r+s1G2/L3NKS+rL b Bb2g2s2n4p 114",
    );
    // no change
    recordManager.changePieceSet({
      king: 2,
      rook: 2,
      bishop: 2,
      gold: 4,
      silver: 4,
      knight: 4,
      lance: 4,
      pawn: 18,
    });
    expect(recordManager.record.position.sfen).toBe(
      "l6nl/9/p3p2pp/2p3p2/3pk2P1/P1P3P2/3PP3P/1g1+r+s1G2/L3NKS+rL b Bb2g2s2n4p 1",
    );
    // remove bishop and knight
    recordManager.changePieceSet({
      king: 2,
      rook: 2,
      bishop: 0,
      gold: 4,
      silver: 4,
      knight: 0,
      lance: 4,
      pawn: 18,
    });
    expect(recordManager.record.position.sfen).toBe(
      "l7l/9/p3p2pp/2p3p2/3pk2P1/P1P3P2/3PP3P/1g1+r+s1G2/L4KS+rL b 2g2s4p 1",
    );
    // add full pieces
    recordManager.changePieceSet({
      king: 18,
      rook: 18,
      bishop: 18,
      gold: 18,
      silver: 18,
      knight: 18,
      lance: 18,
      pawn: 18,
    });
    expect(recordManager.record.position.sfen).toBe(
      "lKKKKKKKl/KKKKKKKKK/pRRRpRRpp/RRpRRRpRR/RRRpkRBPB/PBPBBBPBB/BBBPPBBBP/BgB+r+sBGBG/LGGGGKS+rL b 6G8S9N7L5g8s9n7l4p 1",
    );
  });

  it("appendComment", () => {
    const recordManager = new RecordManager();
    recordManager.appendComment("aaa", CommentBehavior.INSERT);
    expect(recordManager.record.current.comment).toBe("aaa");
    expect(recordManager.unsaved).toBeTruthy();
    recordManager.appendComment("aaa", CommentBehavior.NONE);
    expect(recordManager.record.current.comment).toBe("aaa");
    recordManager.appendComment("bbb", CommentBehavior.INSERT);
    expect(recordManager.record.current.comment).toBe("bbb\naaa");
    recordManager.appendComment("ccc", CommentBehavior.APPEND);
    expect(recordManager.record.current.comment).toBe("bbb\naaa\nccc");
    recordManager.appendComment("ddd", CommentBehavior.OVERWRITE);
    expect(recordManager.record.current.comment).toBe("ddd");
    recordManager.appendComment("", CommentBehavior.INSERT);
    expect(recordManager.record.current.comment).toBe("ddd");
  });

  it("appendSearchComment", () => {
    const recordManager = new RecordManager();
    recordManager.appendSearchComment(
      SearchInfoSenderType.RESEARCHER,
      SearchCommentFormat.SHOGIHOME,
      {
        depth: 8,
        score: 158,
        nodes: 123456,
        pv: [
          new Move(new Square(7, 7), new Square(7, 6), false, Color.BLACK, PieceType.PAWN, null),
          new Move(new Square(3, 3), new Square(3, 4), false, Color.WHITE, PieceType.PAWN, null),
        ],
      },
      CommentBehavior.INSERT,
      {
        engineName: "Engine01",
      },
    );
    recordManager.appendSearchComment(
      SearchInfoSenderType.PLAYER,
      SearchCommentFormat.SHOGIHOME,
      {
        depth: 10,
        score: 210,
        nodes: 12345678,
        pv: [
          new Move(new Square(2, 7), new Square(2, 6), false, Color.BLACK, PieceType.PAWN, null),
          new Move(new Square(3, 3), new Square(3, 4), false, Color.WHITE, PieceType.PAWN, null),
        ],
      },
      CommentBehavior.INSERT,
    );
    expect(recordManager.record.current.comment).toBe(
      "先手有望\n*評価値=210\n*読み筋=▲２六歩△３四歩\n*深さ=10\n*ノード数=12345678\n\n互角\n#評価値=158\n#読み筋=▲７六歩△３四歩\n#深さ=8\n#ノード数=123456\n#エンジン=Engine01\n",
    );
    expect(recordManager.unsaved).toBeTruthy();
  });

  it("appendSearchComment/mate", () => {
    const recordManager = new RecordManager();
    recordManager.appendSearchComment(
      SearchInfoSenderType.PLAYER,
      SearchCommentFormat.SHOGIHOME,
      { mate: 15 },
      CommentBehavior.APPEND,
      { engineName: "Engine01" },
    );
    recordManager.appendSearchComment(
      SearchInfoSenderType.RESEARCHER,
      SearchCommentFormat.SHOGIHOME,
      { mate: -SCORE_MATE_INFINITE },
      CommentBehavior.APPEND,
      { engineName: "Engine02" },
    );
    expect(recordManager.record.current.comment).toBe(
      "*詰み=先手勝ち:15手\n*エンジン=Engine01\n\n#詰み=後手勝ち\n#エンジン=Engine02\n",
    );
    expect(recordManager.unsaved).toBeTruthy();
  });

  it("appendSearchComment/third-party", () => {
    const recordManager = new RecordManager();
    const pv1 = [
      new Move(new Square(5, 3), new Square(5, 4), false, Color.WHITE, PieceType.PAWN, null),
      new Move(new Square(2, 5), new Square(3, 3), true, Color.BLACK, PieceType.KNIGHT, null),
    ];
    const pv2 = [
      new Move(PieceType.GOLD, new Square(5, 4), false, Color.BLACK, PieceType.GOLD, null),
      new Move(new Square(5, 3), new Square(6, 2), false, Color.WHITE, PieceType.KING, null),
    ];
    const pv3 = [
      new Move(new Square(7, 8), new Square(3, 8), true, Color.WHITE, PieceType.ROOK, null),
      new Move(PieceType.PAWN, new Square(3, 7), false, Color.BLACK, PieceType.PAWN, null),
    ];
    const searchInfo1 = { depth: 10, score: 210, nodes: 12345678, pv: pv1 };
    const searchInfo2 = { depth: 15, mate: 22, pv: pv2 };
    const searchInfo3 = { mate: -16, nodes: 123456, pv: pv3 };
    const searchInfo4 = { pv: pv3 };
    for (const format of [
      SearchCommentFormat.FLOODGATE,
      SearchCommentFormat.CSA3,
      SearchCommentFormat.SHOGIGUI,
    ]) {
      for (const sender of [SearchInfoSenderType.PLAYER, SearchInfoSenderType.RESEARCHER]) {
        recordManager.appendSearchComment(sender, format, searchInfo1, CommentBehavior.APPEND);
        recordManager.appendSearchComment(sender, format, searchInfo2, CommentBehavior.APPEND);
        recordManager.appendSearchComment(sender, format, searchInfo3, CommentBehavior.APPEND);
        recordManager.appendSearchComment(sender, format, searchInfo4, CommentBehavior.APPEND);
      }
    }
    expect(recordManager.record.current.comment).toBe(
      // Floodgate
      "* 210 -5354FU +2533NK\n" +
        "* 30000 +0054KI -5362OU\n" +
        "* -30000 -7838RY +0037FU\n" +
        "* 0 -7838RY +0037FU\n" +
        "* 210 -5354FU +2533NK\n" +
        "* 30000 +0054KI -5362OU\n" +
        "* -30000 -7838RY +0037FU\n" +
        "* 0 -7838RY +0037FU\n" +
        // CSA V3
        "* 210 -5354FU +2533NK #12345678\n" +
        "* 30000 +0054KI -5362OU\n" +
        "* -30000 -7838RY +0037FU #123456\n" +
        "* 0 -7838RY +0037FU\n" +
        "* 210 -5354FU +2533NK #12345678\n" +
        "* 30000 +0054KI -5362OU\n" +
        "* -30000 -7838RY +0037FU #123456\n" +
        "* 0 -7838RY +0037FU\n" +
        // ShogiGUI
        "*対局 深さ 10 ノード数 12345678 評価値 210 読み筋 △５四歩(53) ▲３三桂成(25)\n" +
        "*対局 深さ 15 評価値 30000 読み筋 ▲５四金打 △６二玉(53)\n" +
        "*対局 ノード数 123456 評価値 -30000 読み筋 △３八飛成(78) ▲３七歩打\n" +
        "*対局 読み筋 △３八飛成(78) ▲３七歩打\n" +
        "*解析 深さ 10 ノード数 12345678 評価値 210 読み筋 △５四歩(53) ▲３三桂成(25)\n" +
        "*解析 深さ 15 評価値 30000 読み筋 ▲５四金打 △６二玉(53)\n" +
        "*解析 ノード数 123456 評価値 -30000 読み筋 △３八飛成(78) ▲３七歩打\n" +
        "*解析 読み筋 △３八飛成(78) ▲３七歩打",
    );
  });

  describe("inCommentPVs", () => {
    it("standard", () => {
      const recordManager = new RecordManager();
      recordManager.importRecord(
        "l2g2gnl/1r2k2p1/2ns1pPs1/p1pp1R3/1p6p/P1PPS2B1/1PS1P3P/2GK1G3/LN6L b 4Pbn 71",
      );
      recordManager.updateComment(`
#読み筋=▲４七飛△４二金▲４四歩△同　歩▲同　角△４三歩▲５五角△３三桂▲６五歩△６二金▲６四歩△５四銀▲４四歩△５一桂▲４三歩成△同　金▲同　飛成△同　玉
*読み筋=▲４七飛△４二金▲６五歩△同　桂▲同　銀△同　歩▲４四歩`);
      const pvs = recordManager.inCommentPVs;
      expect(pvs).toHaveLength(2);
      expect(formatPV(recordManager.record.position, pvs[0])).toBe(
        "▲４七飛△４二金▲４四歩△同　歩▲同　角△４三歩▲５五角△３三桂▲６五歩△６二金▲６四歩△５四銀▲４四歩△５一桂▲４三歩成△同　金▲同　飛成△同　玉",
      );
      expect(formatPV(recordManager.record.position, pvs[1])).toBe(
        "▲４七飛△４二金▲６五歩△同　桂▲同　銀△同　歩▲４四歩",
      );
    });

    it("floodgate", () => {
      const recordManager = new RecordManager();
      recordManager.importRecord(
        "l2g2gnl/1r2k2p1/2ns1pPs1/p1pp1R3/1p6p/P1PPS2B1/1PS1P3P/2GK1G3/LN6L b 4Pbn 71",
      );
      recordManager.updateComment(
        "* -800 +4447HI -3142KI +0044FU -4344FU +2644KA -0043FU +4455KA -2133KE +6665FU -6162KI +6564FU -6354GI +0044FU -0051KE +4443TO -4243KI +4743RY -5243OU",
      );
      const pvs = recordManager.inCommentPVs;
      expect(pvs).toHaveLength(1);
      expect(formatPV(recordManager.record.position, pvs[0])).toBe(
        "▲４七飛△４二金▲４四歩△同　歩▲同　角△４三歩▲５五角△３三桂▲６五歩△６二金▲６四歩△５四銀▲４四歩△５一桂▲４三歩成△同　金▲同　飛成△同　玉",
      );
    });

    it("shogi-gui", () => {
      const recordManager = new RecordManager();
      recordManager.importRecord(
        "lnsgk1snl/6gb1/p1pppp2p/6R2/9/1rP6/P2PPPP1P/1BG6/LNS1KGSNL w 3P2p 16",
      );
      recordManager.updateComment(
        "*対局 時間 00:00.8 深さ 22/28 ノード数 744743 評価値 88 読み筋 ▲３四飛(24) △３三角(22) ▲５八玉(59) △５二玉(51) ▲３六歩(37) △７六飛(86) ▲７七角(88) △７四飛(76) ▲同　飛(34) △同　歩(73) ▲２四歩打 △２五飛打 ▲３七桂(29) △２九飛成(25) ▲４五桂(37) △４四角(33) ▲同　角(77) △同　歩(43) ▲８二歩打 △同　銀(71) ▲５五角打 \n" +
          "*解析 0 △ 候補1 時間 00:00.0 深さ 32 ノード数 1 評価値 0 読み筋 △３三角(22) \n" +
          "*解析 0  候補2 時間 00:00.0 深さ 32 ノード数 1 評価値 0 読み筋 △３三角(22) \n",
      );
      const pvs = recordManager.inCommentPVs;
      expect(pvs).toHaveLength(3);
      expect(formatPV(recordManager.record.position, pvs[0])).toBe(
        "△３三角▲５八玉△５二玉▲３六歩△７六飛▲７七角△７四飛▲同　飛△同　歩▲２四歩△２五飛▲３七桂△２九飛成▲４五桂△４四角▲同　角△同　歩▲８二歩△同　銀▲５五角",
      );
      expect(formatPV(recordManager.record.position, pvs[1])).toBe("△３三角");
      expect(formatPV(recordManager.record.position, pvs[2])).toBe("△３三角");
    });

    it("piyo-shogi", () => {
      const recordManager = new RecordManager();
      recordManager.importRecord(
        "ln1g1kb1l/1r4g2/p2p1snp1/4spp1p/1pp1p2N1/2PP1PS1P/PPBSP1P2/2G1G2R1/LN1K4L b P 41",
      );
      recordManager.updateComment(
        "#指し手[62]△７五歩  ▲３三桂成  △同金  ▲７五歩  △同角  ▲４八飛  △６四角  ▲７九玉  △７四桂打  ▲４五歩  △８六歩  ▲同歩  △同桂  ▲８八金  △３二玉  ",
      );
      expect(recordManager.inCommentPVs).toHaveLength(1);
      expect(formatPV(recordManager.record.position, recordManager.inCommentPVs[0])).toBe(
        "▲３三桂成△同　金▲７五歩△同　角▲４八飛△６四角▲７九玉△７四桂▲４五歩△８六歩▲同　歩△同　桂▲８八金△３二玉",
      );
    });

    it("kishin-analytics", () => {
      const recordManager = new RecordManager();
      recordManager.importRecord(
        "ln2k2nl/1r4gb1/p1pgpp1p1/5sP1p/9/3PPS3/PPP1SP2P/2G1G2R1/LN1K3NL w S3Pbp 54",
      );
      recordManager.updateComment(
        "* Engine suisho Version Suisho5/YaneuraOu-V7.50 候補1 深さ 13/19 ノード数 596119 評価値 -47 読み筋 △７四金(63) ▲５五歩(56)\n" +
          "* Engine suisho Version Suisho5/YaneuraOu-V7.50 候補2 深さ 12/14 ノード数 596119 評価値 -46 読み筋 △１三角(22) ▲１六歩(17) △５二玉(51) ▲１五歩(16) △同　歩(14) ▲同　香(19) △４六角(13) ▲同　歩(47) △１五香(11) ▲１二銀打 △４九銀打 ▲２一銀(12) △５八銀成(49) ▲同　飛(28)\n" +
          "* Engine suisho Version Suisho5/YaneuraOu-V7.50 候補3 深さ 12/19 ノード数 596119 評価値 -20 読み筋 △３八歩打 ▲同　飛(28) △２七角打 ▲３七飛(38) △４九角成(27) ▲５九金(58) △８五馬(49) ▲５八金(59) △７四歩(73) ▲１六歩(17)",
      );
      const pvs = recordManager.inCommentPVs;
      expect(pvs).toHaveLength(3);
      expect(formatPV(recordManager.record.position, pvs[0])).toBe("△７四金▲５五歩");
    });
  });

  it("setGameStartMetadata/csa-v2-time", () => {
    const recordManager = new RecordManager();
    recordManager.setGameStartMetadata({
      gameTitle: "New Game",
      blackName: "Player 1",
      whiteName: "Player 2",
      blackTimeLimit: { timeSeconds: 600, byoyomi: 30, increment: 0 },
      whiteTimeLimit: { timeSeconds: 600, byoyomi: 30, increment: 0 },
    });
    const metadata = recordManager.record.metadata;
    expect(metadata.getStandardMetadata(RecordMetadataKey.TITLE)).toBe("New Game");
    expect(metadata.getStandardMetadata(RecordMetadataKey.BLACK_NAME)).toBe("Player 1");
    expect(metadata.getStandardMetadata(RecordMetadataKey.WHITE_NAME)).toBe("Player 2");
    expect(metadata.getStandardMetadata(RecordMetadataKey.TIME_LIMIT)).toBe("10:00+30");
    expect(metadata.getStandardMetadata(RecordMetadataKey.BLACK_TIME_LIMIT)).toBeUndefined();
    expect(metadata.getStandardMetadata(RecordMetadataKey.WHITE_TIME_LIMIT)).toBeUndefined();
  });

  it("setGameStartMetadata/csa-v3-time", () => {
    const recordManager = new RecordManager();
    recordManager.setGameStartMetadata({
      blackTimeLimit: { timeSeconds: 300, byoyomi: 0, increment: 5 },
      whiteTimeLimit: { timeSeconds: 150, byoyomi: 0, increment: 5 },
    });
    const metadata = recordManager.record.metadata;
    expect(metadata.getStandardMetadata(RecordMetadataKey.TIME_LIMIT)).toBeUndefined();
    expect(metadata.getStandardMetadata(RecordMetadataKey.BLACK_TIME_LIMIT)).toBe("300+0+5");
    expect(metadata.getStandardMetadata(RecordMetadataKey.WHITE_TIME_LIMIT)).toBe("150+0+5");
  });

  it("appendMovesSilently", () => {
    const recordManager = new RecordManager();
    recordManager.appendMovesSilently([
      new Move(new Square(7, 7), new Square(7, 6), false, Color.BLACK, PieceType.PAWN, null),
      new Move(new Square(3, 3), new Square(3, 4), false, Color.WHITE, PieceType.PAWN, null),
    ]);
    expect(recordManager.record.current.ply).toBe(0);
    expect(recordManager.record.moves).toHaveLength(3);
    expect(recordManager.unsaved).toBeTruthy();
  });

  it("importRecord", () => {
    const recordManager = new RecordManager();
    expect(
      recordManager.importRecord(`手合割：平手
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/00:00:00)
   2 ８四歩(83)   ( 0:00/00:00:00)
**評価値=80
*
*#評価値=-60
   3 ７六歩(77)   ( 0:00/00:00:00)
**詰み=先手勝ち
*
*#詰み=後手勝ち
   4 ８五歩(84)   ( 0:00/00:00:00)
**詰み=先手勝ち:15手
*
*#詰み=後手勝ち:8手
`),
    ).toBeUndefined();
    recordManager.changePly(2);
    expect(recordManager.record.current.customData).toStrictEqual({
      playerSearchInfo: { score: 80 },
      researchInfo: { score: -60 },
    });
    recordManager.changePly(3);
    expect(recordManager.record.current.customData).toStrictEqual({
      playerSearchInfo: { mate: SCORE_MATE_INFINITE },
      researchInfo: { mate: -SCORE_MATE_INFINITE },
    });
    recordManager.changePly(4);
    expect(recordManager.record.current.customData).toStrictEqual({
      playerSearchInfo: { mate: 15 },
      researchInfo: { mate: -8 },
    });
    expect(recordManager.unsaved).toBeTruthy();

    expect(recordManager.importRecord(InitialPositionSFEN.TSUME_SHOGI)).toBeUndefined();
    expect(recordManager.record.position.sfen).toBe(InitialPositionSFEN.TSUME_SHOGI);
    expect(recordManager.record.moves).toHaveLength(1);
    expect(recordManager.unsaved).toBeTruthy();

    expect(
      recordManager.importRecord(
        `手合割：平手
1 ２六歩(27)
2 ８四歩(83)
3 ２五歩(26)`,
        { markAsSaved: false },
      ),
    ).toBeUndefined();
    expect(recordManager.record.position.sfen).toBe(InitialPositionSFEN.STANDARD);
    expect(recordManager.record.moves).toHaveLength(4);
    expect(recordManager.unsaved).toBeTruthy();

    expect(
      recordManager.importRecord(
        `手合割：平手
▲５八飛    △８四歩    ▲７六歩    △８五歩    ▲７七角`,
        { markAsSaved: true },
      ),
    ).toBeUndefined();
    expect(recordManager.record.position.sfen).toBe(InitialPositionSFEN.STANDARD);
    expect(recordManager.record.moves).toHaveLength(6);
    expect(recordManager.unsaved).toBeFalsy();

    expect(
      recordManager.importRecord(`手合割：平手`, { type: RecordFormatType.SFEN }),
    ).toBeInstanceOf(Error);
  });
});
