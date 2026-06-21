# やねうら王バイナリ定跡DB (.ybb)

## 公式ドキュメント

やねうら王バイナリ定跡DBはやねうら王の定跡データ形式であり、やねうら王定跡フォーマット2016と異なりバイナリデータで構成されています。
詳細は以下のドキュメントで説明されています。

https://github.com/yaneurao/YaneuraOu-ScriptCollection/blob/main/BookMinerCpp/docs/04-ybb.md

## ファイル全体の構成

ファイル全体は次の順序で要素が並んでいます。

1. index 領域
2. moves 領域

## index 領域

```text
magic[16] = "YANE-BINBOOK-V1\0"
record_count uint64
flags uint64
records[record_count]:
  packed_sfen[32]
  moves_offset uint64
  ply uint16
  move_count uint16
```

records は packed_sfen でソートしている必要があります。

## moves 領域 (flags bit0 = 0 の場合)

```text
move16 uint16
eval   int16
```

## moves 領域 (flags bit0 = 1 の場合)

```
move16 uint16
eval   int16
depth  uint16
```

## 値の表現

数値は Little Endian です。

packed_sfen はやねうら王の `PackedSfen` です。

指し手はやねうら王の `Move16` です。
cshogi の `move16` とは異なります。

詰みを表す評価値のベースの値は 32000 を使います。
