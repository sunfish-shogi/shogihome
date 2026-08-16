#include "position.h"

#include <cstdlib>
#include <sstream>

namespace shogi {

const char* Position::STARTPOS_SFEN =
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

const Delta DIRECTION_DELTAS[DIRECTION_COUNT] = {
    {0, -1},   // UP
    {0, 1},    // DOWN
    {1, 0},    // LEFT
    {-1, 0},   // RIGHT
    {1, -1},   // LEFT_UP
    {-1, -1},  // RIGHT_UP
    {1, 1},    // LEFT_DOWN
    {-1, 1},   // RIGHT_DOWN
    {1, -2},   // LEFT_UP_KNIGHT
    {-1, -2},  // RIGHT_UP_KNIGHT
    {1, 2},    // LEFT_DOWN_KNIGHT
    {-1, 2},   // RIGHT_DOWN_KNIGHT
};

int reverseDirection(int direction) {
  switch (direction) {
    case DIR_UP:
      return DIR_DOWN;
    case DIR_DOWN:
      return DIR_UP;
    case DIR_LEFT:
      return DIR_RIGHT;
    case DIR_RIGHT:
      return DIR_LEFT;
    case DIR_LEFT_UP:
      return DIR_RIGHT_DOWN;
    case DIR_RIGHT_UP:
      return DIR_LEFT_DOWN;
    case DIR_LEFT_DOWN:
      return DIR_RIGHT_UP;
    case DIR_RIGHT_DOWN:
      return DIR_LEFT_UP;
    case DIR_LEFT_UP_KNIGHT:
      return DIR_RIGHT_DOWN_KNIGHT;
    case DIR_RIGHT_UP_KNIGHT:
      return DIR_LEFT_DOWN_KNIGHT;
    case DIR_LEFT_DOWN_KNIGHT:
      return DIR_RIGHT_UP_KNIGHT;
    default:
      return DIR_LEFT_UP_KNIGHT;
  }
}

bool isKnightDirection(int direction) {
  return direction >= DIR_LEFT_UP_KNIGHT;
}

namespace {

// 先手の駒の移動可能方向。後手は方向を反転して参照する。
// tsshogi の movableDirectionMap と同じ内容。
struct MoveTypeTable {
  MoveType value[PIECE_TYPE_COUNT][DIRECTION_COUNT];

  constexpr MoveTypeTable() : value{} {
    set(PAWN, DIR_UP, MOVE_TYPE_SHORT);
    set(LANCE, DIR_UP, MOVE_TYPE_LONG);
    set(KNIGHT, DIR_LEFT_UP_KNIGHT, MOVE_TYPE_SHORT);
    set(KNIGHT, DIR_RIGHT_UP_KNIGHT, MOVE_TYPE_SHORT);
    for (int dir : {DIR_LEFT_UP, DIR_UP, DIR_RIGHT_UP, DIR_LEFT_DOWN, DIR_RIGHT_DOWN}) {
      set(SILVER, dir, MOVE_TYPE_SHORT);
    }
    for (PieceType type : {GOLD, PROM_PAWN, PROM_LANCE, PROM_KNIGHT, PROM_SILVER}) {
      for (int dir : {DIR_LEFT_UP, DIR_UP, DIR_RIGHT_UP, DIR_LEFT, DIR_RIGHT, DIR_DOWN}) {
        set(type, dir, MOVE_TYPE_SHORT);
      }
    }
    for (int dir : {DIR_LEFT_UP, DIR_RIGHT_UP, DIR_LEFT_DOWN, DIR_RIGHT_DOWN}) {
      set(BISHOP, dir, MOVE_TYPE_LONG);
      set(HORSE, dir, MOVE_TYPE_LONG);
      set(DRAGON, dir, MOVE_TYPE_SHORT);
    }
    for (int dir : {DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT}) {
      set(ROOK, dir, MOVE_TYPE_LONG);
      set(DRAGON, dir, MOVE_TYPE_LONG);
      set(HORSE, dir, MOVE_TYPE_SHORT);
    }
    for (int dir = DIR_UP; dir <= DIR_RIGHT_DOWN; dir++) {
      set(KING, dir, MOVE_TYPE_SHORT);
    }
  }

  constexpr void set(PieceType type, int direction, MoveType moveType) {
    value[type][direction] = moveType;
  }
};

constexpr MoveTypeTable MOVE_TYPE_TABLE;

// 行き所のない駒かどうか。tsshogi の invalidRankMap と同じ。
bool isInvalidRank(Color color, PieceType type, int rank) {
  if (color == BLACK) {
    switch (type) {
      case PAWN:
      case LANCE:
        return rank == 1;
      case KNIGHT:
        return rank <= 2;
      default:
        return false;
    }
  }
  switch (type) {
    case PAWN:
    case LANCE:
      return rank == 9;
    case KNIGHT:
      return rank >= 8;
    default:
      return false;
  }
}

Square neighborOf(Square square, const Delta& delta) {
  const int file = fileOf(square) + delta.file;
  const int rank = rankOf(square) + delta.rank;
  return isValidFileRank(file, rank) ? squareOf(file, rank) : SQ_NONE;
}

char pieceTypeToSFENChar(PieceType type) {
  switch (unpromotedPieceType(type)) {
    case PAWN:
      return 'P';
    case LANCE:
      return 'L';
    case KNIGHT:
      return 'N';
    case SILVER:
      return 'S';
    case GOLD:
      return 'G';
    case BISHOP:
      return 'B';
    case ROOK:
      return 'R';
    case KING:
      return 'K';
    default:
      return '?';
  }
}

PieceType sfenCharToPieceType(char c) {
  switch (c) {
    case 'P':
    case 'p':
      return PAWN;
    case 'L':
    case 'l':
      return LANCE;
    case 'N':
    case 'n':
      return KNIGHT;
    case 'S':
    case 's':
      return SILVER;
    case 'G':
    case 'g':
      return GOLD;
    case 'B':
    case 'b':
      return BISHOP;
    case 'R':
    case 'r':
      return ROOK;
    case 'K':
    case 'k':
      return KING;
    default:
      return NO_PIECE_TYPE;
  }
}

}  // namespace

MoveType resolveMoveType(Piece piece, int direction) {
  if (isEmpty(piece)) {
    return MOVE_TYPE_NONE;
  }
  // 後手の駒は方向を反転して先手用のテーブルを引く。
  const int dir = colorOf(piece) == BLACK ? direction : reverseDirection(direction);
  return MOVE_TYPE_TABLE.value[typeOf(piece)][dir];
}

std::string moveToUSI(const Move& move) {
  std::string text;
  if (move.isDrop()) {
    text += pieceTypeToSFENChar(move.pieceType);
    text += '*';
  } else {
    text += static_cast<char>('0' + fileOf(move.from));
    text += static_cast<char>('a' + rankOf(move.from) - 1);
  }
  text += static_cast<char>('0' + fileOf(move.to));
  text += static_cast<char>('a' + rankOf(move.to) - 1);
  if (move.promote) {
    text += '+';
  }
  return text;
}

Position::Position() {
  zobrist::initialize();
  setSFEN(STARTPOS_SFEN);
}

void Position::resetHashKey() {
  hashKey_ = 0;
  for (Square square = 0; square < SQUARE_COUNT; square++) {
    hashKey_ ^= zobrist::PIECE[board_[square]][square];
  }
  for (int color = 0; color < 2; color++) {
    for (int type = 0; type < PIECE_TYPE_COUNT; type++) {
      hashKey_ ^= zobrist::HAND[color][type][hands_[color][type]];
    }
  }
  if (color_ == WHITE) {
    hashKey_ ^= zobrist::SIDE;
  }
}

void Position::setPiece(Square square, Piece piece) {
  // 置く前の駒を打ち消してから新しい駒を足す。空マスの値は 0 なので何もしないのと同じ。
  hashKey_ ^= zobrist::PIECE[board_[square]][square];
  board_[square] = piece;
  hashKey_ ^= zobrist::PIECE[piece][square];
}

void Position::addHand(Color color, PieceType type, int delta) {
  int& count = hands_[color][type];
  hashKey_ ^= zobrist::HAND[color][type][count];
  count += delta;
  hashKey_ ^= zobrist::HAND[color][type][count];
}

bool Position::setSFEN(const std::string& sfen) {
  std::istringstream stream(sfen);
  std::string boardText;
  std::string colorText;
  std::string handText;
  if (!(stream >> boardText >> colorText >> handText)) {
    return false;
  }

  board_.fill(NO_PIECE);
  for (auto& hand : hands_) {
    hand.fill(0);
  }

  int file = 9;
  int rank = 1;
  bool promote = false;
  for (const char c : boardText) {
    if (c == '/') {
      file = 9;
      rank++;
      promote = false;
      continue;
    }
    if (c == '+') {
      promote = true;
      continue;
    }
    if (c >= '1' && c <= '9') {
      file -= c - '0';
      promote = false;
      continue;
    }
    const PieceType type = sfenCharToPieceType(c);
    if (type == NO_PIECE_TYPE || !isValidFileRank(file, rank)) {
      return false;
    }
    const Color color = (c >= 'A' && c <= 'Z') ? BLACK : WHITE;
    board_[squareOf(file, rank)] = makePiece(color, promote ? promotedPieceType(type) : type);
    file--;
    promote = false;
  }

  if (colorText == "b") {
    color_ = BLACK;
  } else if (colorText == "w") {
    color_ = WHITE;
  } else {
    return false;
  }

  if (handText != "-") {
    int count = 0;
    for (const char c : handText) {
      if (c >= '0' && c <= '9') {
        count = count * 10 + (c - '0');
        continue;
      }
      const PieceType type = sfenCharToPieceType(c);
      if (type == NO_PIECE_TYPE) {
        return false;
      }
      const Color color = (c >= 'A' && c <= 'Z') ? BLACK : WHITE;
      hands_[color][type] += count == 0 ? 1 : count;
      count = 0;
    }
  }
  resetHashKey();
  return true;
}

std::string Position::sfen(int ply) const {
  std::string text;
  for (int rank = 1; rank <= RANK_COUNT; rank++) {
    int empty = 0;
    for (int file = 9; file >= 1; file--) {
      const Piece piece = board_[squareOf(file, rank)];
      if (isEmpty(piece)) {
        empty++;
        continue;
      }
      if (empty > 0) {
        text += static_cast<char>('0' + empty);
        empty = 0;
      }
      const PieceType type = typeOf(piece);
      if (isPromoted(type)) {
        text += '+';
      }
      const char c = pieceTypeToSFENChar(type);
      text += colorOf(piece) == BLACK ? c : static_cast<char>(c - 'A' + 'a');
    }
    if (empty > 0) {
      text += static_cast<char>('0' + empty);
    }
    if (rank < RANK_COUNT) {
      text += '/';
    }
  }

  text += color_ == BLACK ? " b " : " w ";

  std::string handText;
  for (const Color color : {BLACK, WHITE}) {
    // SFEN の持ち駒は飛車から歩の順に並べる。
    for (const PieceType type : {ROOK, BISHOP, GOLD, SILVER, KNIGHT, LANCE, PAWN}) {
      const int count = hands_[color][type];
      if (count == 0) {
        continue;
      }
      if (count > 1) {
        handText += std::to_string(count);
      }
      const char c = pieceTypeToSFENChar(type);
      handText += color == BLACK ? c : static_cast<char>(c - 'A' + 'a');
    }
  }
  text += handText.empty() ? "-" : handText;
  text += ' ';
  text += std::to_string(ply);
  return text;
}

std::string Position::key() const {
  // tsshogi の Position#sfen は手数を 1 に固定した文字列を返す。千日手判定のキーもこれに合わせる。
  return sfen(1);
}

Square Position::findKing(Color color) const {
  const Piece king = makePiece(color, KING);
  for (Square square = 0; square < SQUARE_COUNT; square++) {
    if (board_[square] == king) {
      return square;
    }
  }
  return SQ_NONE;
}

bool Position::pawnExists(Color color, int file) const {
  const Piece pawn = makePiece(color, PAWN);
  for (int rank = 1; rank <= RANK_COUNT; rank++) {
    if (board_[squareOf(file, rank)] == pawn) {
      return true;
    }
  }
  return false;
}

bool Position::hasPower(Square target, Color color, Square filled, Square ignore) const {
  for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
    const Delta& delta = DIRECTION_DELTAS[direction];
    const int reverse = reverseDirection(direction);
    int step = 0;
    for (Square square = neighborOf(target, delta); square != SQ_NONE;
         square = neighborOf(square, delta)) {
      step++;
      if (filled != SQ_NONE && square == filled) {
        break;
      }
      if (ignore != SQ_NONE && square == ignore) {
        if (isKnightDirection(direction)) {
          break;
        }
        continue;
      }
      const Piece piece = board_[square];
      if (!isEmpty(piece)) {
        if (colorOf(piece) == color) {
          const MoveType moveType = resolveMoveType(piece, reverse);
          if (moveType == MOVE_TYPE_LONG || (moveType == MOVE_TYPE_SHORT && step == 1)) {
            return true;
          }
        }
        break;
      }
      // 桂馬の方向は 1 マス目以外に意味が無い。
      if (isKnightDirection(direction)) {
        break;
      }
    }
  }
  return false;
}

bool Position::isChecked(Color kingColor, Square filled, Square ignore) const {
  const Square square = findKing(kingColor);
  if (square == SQ_NONE) {
    return false;
  }
  return hasPower(square, opposite(kingColor), filled, ignore);
}

bool Position::isMovable(Square from, Square to) const {
  const Piece piece = board_[from];
  if (isEmpty(piece)) {
    return false;
  }
  const int dFile = fileOf(to) - fileOf(from);
  const int dRank = rankOf(to) - rankOf(from);
  if (dFile == 0 && dRank == 0) {
    return false;
  }

  int direction = -1;
  int distance = 0;
  if ((dFile == 1 || dFile == -1) && (dRank == 2 || dRank == -2)) {
    distance = 1;
    if (dFile == 1) {
      direction = dRank == -2 ? DIR_LEFT_UP_KNIGHT : DIR_LEFT_DOWN_KNIGHT;
    } else {
      direction = dRank == -2 ? DIR_RIGHT_UP_KNIGHT : DIR_RIGHT_DOWN_KNIGHT;
    }
  } else {
    if (dFile != 0 && dRank != 0 && std::abs(dFile) != std::abs(dRank)) {
      return false;
    }
    distance = std::abs(dFile != 0 ? dFile : dRank);
    const int uFile = dFile == 0 ? 0 : dFile / std::abs(dFile);
    const int uRank = dRank == 0 ? 0 : dRank / std::abs(dRank);
    for (int i = DIR_UP; i <= DIR_RIGHT_DOWN; i++) {
      if (DIRECTION_DELTAS[i].file == uFile && DIRECTION_DELTAS[i].rank == uRank) {
        direction = i;
        break;
      }
    }
  }
  if (direction < 0) {
    return false;
  }

  switch (resolveMoveType(piece, direction)) {
    case MOVE_TYPE_SHORT:
      return distance == 1;
    case MOVE_TYPE_LONG: {
      const Delta& delta = DIRECTION_DELTAS[direction];
      for (Square square = neighborOf(from, delta); square != SQ_NONE;
           square = neighborOf(square, delta)) {
        if (square == to) {
          return true;
        }
        if (!isEmpty(board_[square])) {
          return false;
        }
      }
      return false;
    }
    default:
      return false;
  }
}

std::vector<Square> Position::listAttackers(Square to) const {
  std::vector<Square> squares;
  for (Square from = 0; from < SQUARE_COUNT; from++) {
    if (isEmpty(board_[from])) {
      continue;
    }
    if (isMovable(from, to)) {
      squares.push_back(from);
    }
  }
  return squares;
}

bool Position::isPawnDropMate(const Move& move) const {
  if (!move.isDrop() || move.pieceType != PAWN) {
    return false;
  }
  const Square kingSquare =
      neighborOf(move.to, DIRECTION_DELTAS[move.color == BLACK ? DIR_UP : DIR_DOWN]);
  if (kingSquare == SQ_NONE) {
    return false;
  }
  const Piece king = board_[kingSquare];
  if (isEmpty(king) || typeOf(king) != KING || colorOf(king) == move.color) {
    return false;
  }

  // 玉が逃げられるなら詰みではない。
  for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
    if (resolveMoveType(king, direction) == MOVE_TYPE_NONE) {
      continue;
    }
    const Square to = neighborOf(kingSquare, DIRECTION_DELTAS[direction]);
    if (to == SQ_NONE) {
      continue;
    }
    const Piece piece = board_[to];
    if (!isEmpty(piece) && colorOf(piece) == colorOf(king)) {
      continue;
    }
    if (!hasPower(to, move.color, move.to, SQ_NONE)) {
      return false;
    }
  }

  // 玉以外の駒で歩を取れるなら詰みではない。
  const Color kingColor = colorOf(king);
  for (Square from = 0; from < SQUARE_COUNT; from++) {
    const Piece piece = board_[from];
    if (isEmpty(piece) || colorOf(piece) != kingColor || from == kingSquare) {
      continue;
    }
    if (!isMovable(from, move.to)) {
      continue;
    }
    if (!isChecked(kingColor, move.to, from)) {
      return false;
    }
  }
  return true;
}

bool Position::isValidMove(const Move& move) const {
  if (!move.isDrop()) {
    const Piece target = board_[move.from];
    if (isEmpty(target) || colorOf(target) != color_ || typeOf(target) != move.pieceType) {
      return false;
    }
    if (!isMovable(move.from, move.to)) {
      return false;
    }
    const Piece captured = board_[move.to];
    if (!isEmpty(captured) && colorOf(captured) == color_) {
      return false;
    }
    if (isEmpty(captured) != (move.capturedPieceType == NO_PIECE_TYPE)) {
      return false;
    }
    if (!isEmpty(captured) && typeOf(captured) != move.capturedPieceType) {
      return false;
    }
    if (move.promote) {
      if (!isPromotable(typeOf(target))) {
        return false;
      }
      if (!isPromotableRank(color_, rankOf(move.from)) &&
          !isPromotableRank(color_, rankOf(move.to))) {
        return false;
      }
    } else if (isInvalidRank(color_, typeOf(target), rankOf(move.to))) {
      return false;
    }
    if (move.pieceType != KING) {
      if (isChecked(color_, move.to, move.from)) {
        return false;
      }
    } else if (hasPower(move.to, opposite(color_), SQ_NONE, move.from)) {
      return false;
    }
    return true;
  }

  if (move.promote || move.color != color_) {
    return false;
  }
  if (hands_[color_][move.pieceType] == 0) {
    return false;
  }
  if (!isEmpty(board_[move.to])) {
    return false;
  }
  if (isInvalidRank(color_, move.pieceType, rankOf(move.to))) {
    return false;
  }
  if (move.pieceType == PAWN && pawnExists(color_, fileOf(move.to))) {
    return false;
  }
  if (isChecked(color_, move.to, SQ_NONE)) {
    return false;
  }
  if (isPawnDropMate(move)) {
    return false;
  }
  return true;
}

bool Position::doMove(const Move& move) {
  if (!isValidMove(move)) {
    return false;
  }
  if (!move.isDrop()) {
    const Piece target = board_[move.from];
    const Piece captured = board_[move.to];
    setPiece(move.from, NO_PIECE);
    setPiece(move.to, move.promote ? makePiece(color_, promotedPieceType(typeOf(target))) : target);
    if (!isEmpty(captured) && typeOf(captured) != KING) {
      addHand(color_, unpromotedPieceType(typeOf(captured)), 1);
    }
  } else {
    addHand(color_, move.pieceType, -1);
    setPiece(move.to, makePiece(color_, move.pieceType));
  }
  color_ = opposite(color_);
  hashKey_ ^= zobrist::SIDE;
  return true;
}

void Position::undoMove(const Move& move) {
  color_ = opposite(color_);
  hashKey_ ^= zobrist::SIDE;
  if (!move.isDrop()) {
    setPiece(move.from, makePiece(color_, move.pieceType));
    if (move.capturedPieceType != NO_PIECE_TYPE) {
      setPiece(move.to, makePiece(opposite(color_), move.capturedPieceType));
      if (move.capturedPieceType != KING) {
        addHand(color_, unpromotedPieceType(move.capturedPieceType), -1);
      }
    } else {
      setPiece(move.to, NO_PIECE);
    }
  } else {
    setPiece(move.to, NO_PIECE);
    addHand(color_, move.pieceType, 1);
  }
}

bool Position::parseUSIMove(const std::string& text, Move* move) const {
  if (text.size() < 4) {
    return false;
  }
  Move result;
  result.color = color_;
  if (text[1] == '*') {
    const PieceType type = sfenCharToPieceType(text[0]);
    if (type == NO_PIECE_TYPE) {
      return false;
    }
    result.from = SQ_NONE;
    result.pieceType = type;
  } else {
    const int fromFile = text[0] - '0';
    const int fromRank = text[1] - 'a' + 1;
    if (!isValidFileRank(fromFile, fromRank)) {
      return false;
    }
    result.from = squareOf(fromFile, fromRank);
    const Piece piece = board_[result.from];
    if (isEmpty(piece)) {
      return false;
    }
    result.pieceType = typeOf(piece);
  }
  const int toFile = text[2] - '0';
  const int toRank = text[3] - 'a' + 1;
  if (!isValidFileRank(toFile, toRank)) {
    return false;
  }
  result.to = squareOf(toFile, toRank);
  result.promote = text.size() > 4 && text[4] == '+';
  if (!result.isDrop()) {
    const Piece captured = board_[result.to];
    result.capturedPieceType = isEmpty(captured) ? NO_PIECE_TYPE : typeOf(captured);
  }
  *move = result;
  return true;
}

bool Position::inCheck(Color color) const {
  return isChecked(color, SQ_NONE, SQ_NONE);
}

std::vector<Move> Position::listMoves() const {
  return generateMoves(false);
}

std::vector<Move> Position::listCaptures() const {
  return generateMoves(true);
}

std::vector<Move> Position::generateMoves(bool capturesOnly) const {
  std::vector<Move> moves;

  // 盤上の駒を動かす手
  const auto addMove = [&](Square from, Square to, PieceType pieceType) {
    const Piece captured = board_[to];
    if (!isEmpty(captured) && colorOf(captured) == color_) {
      return;
    }
    if (capturesOnly && isEmpty(captured)) {
      return;
    }
    Move move;
    move.from = from;
    move.to = to;
    move.pieceType = pieceType;
    move.capturedPieceType = isEmpty(captured) ? NO_PIECE_TYPE : typeOf(captured);
    move.color = color_;
    move.promote = false;
    if (isPromotable(pieceType) &&
        (isPromotableRank(color_, rankOf(from)) || isPromotableRank(color_, rankOf(to)))) {
      Move promoted = move;
      promoted.promote = true;
      moves.push_back(promoted);
      // 桂馬と銀以外は成れるなら成る。香車も成らない方が良い場合はあるがレアケースなので考えない。
      if (pieceType != KNIGHT && pieceType != SILVER) {
        return;
      }
    }
    moves.push_back(move);
  };

  for (Square from = 0; from < SQUARE_COUNT; from++) {
    const Piece piece = board_[from];
    if (isEmpty(piece) || colorOf(piece) != color_) {
      continue;
    }
    for (int direction = 0; direction < DIRECTION_COUNT; direction++) {
      const MoveType moveType = resolveMoveType(piece, direction);
      const Delta& delta = DIRECTION_DELTAS[direction];
      if (moveType == MOVE_TYPE_SHORT) {
        const Square to = neighborOf(from, delta);
        if (to != SQ_NONE) {
          addMove(from, to, typeOf(piece));
        }
      } else if (moveType == MOVE_TYPE_LONG) {
        for (Square to = neighborOf(from, delta); to != SQ_NONE; to = neighborOf(to, delta)) {
          addMove(from, to, typeOf(piece));
          if (!isEmpty(board_[to])) {
            break;
          }
        }
      }
    }
  }

  // 持ち駒を打つ手 (駒を取る手にはならないので静止探索では生成しない)
  for (int i = 0; !capturesOnly && i < HAND_PIECE_TYPE_COUNT; i++) {
    const PieceType pieceType = HAND_PIECE_TYPES[i];
    if (hands_[color_][pieceType] == 0) {
      continue;
    }
    for (Square to = 0; to < SQUARE_COUNT; to++) {
      if (!isEmpty(board_[to])) {
        continue;
      }
      Move move;
      move.from = SQ_NONE;
      move.to = to;
      move.pieceType = pieceType;
      move.capturedPieceType = NO_PIECE_TYPE;
      move.color = color_;
      move.promote = false;
      moves.push_back(move);
    }
  }

  return moves;
}

}  // namespace shogi
