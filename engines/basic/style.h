// 戦型。居飛車と振り飛車で駒の理想位置が異なるため、評価テーブルを切り替える。
#pragma once

#include <string>

namespace shogi {
namespace basic {

enum Style : int {
  STYLE_STATIC_ROOK = 0,   // 居飛車
  STYLE_RANGING_ROOK = 1,  // 振り飛車
  STYLE_RANDOM = 2,        // 合法手からランダムに選ぶ (探索しない)
  STYLE_COUNT_WITH_TABLE = 2,
};

inline const char* styleName(Style style) {
  switch (style) {
    case STYLE_RANGING_ROOK:
      return "ranging_rook";
    case STYLE_RANDOM:
      return "random";
    default:
      return "static_rook";
  }
}

inline bool parseStyle(const std::string& value, Style* style) {
  if (value == "static_rook") {
    *style = STYLE_STATIC_ROOK;
  } else if (value == "ranging_rook") {
    *style = STYLE_RANGING_ROOK;
  } else if (value == "random") {
    *style = STYLE_RANDOM;
  } else {
    return false;
  }
  return true;
}

}  // namespace basic
}  // namespace shogi
