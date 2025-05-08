import { RectSize } from "@/common/assets/geometry.js";
import { PieceType } from "tsshogi";

export type Frame = {
  style: { [key: string]: string };
  size: RectSize;
};

export type Turn = {
  style: { [key: string]: string };
};

export type PlayerName = {
  style: { [key: string]: string };
};

export type Clock = {
  style: { [key: string]: string };
};

export type Control = {
  left: {
    style: { [key: string]: string };
  };
  right: {
    style: { [key: string]: string };
  };
};

export type Layout = {
  ratio: number;
  frame: Frame;
  boardStyle: { [key: string]: string };
  blackHandStyle: { [key: string]: string };
  whiteHandStyle: { [key: string]: string };
  turn?: Turn;
  blackPlayerName: PlayerName;
  whitePlayerName: PlayerName;
  blackClock?: Clock;
  whiteClock?: Clock;
  control?: Control;
};

export type BoardBackground = {
  gridColor: string;
  textureImagePath: string | null;
  style: { [key: string]: string };
};

export type BoardLabel = {
  id: string;
  character: string;
  style: { [key: string]: string };
};

export type BoardPiece = {
  id: string;
  imagePath: string;
  style: { [key: string]: string };
};

export type BoardSquare = {
  id: number;
  file: number;
  rank: number;
  style: { [key: string]: string };
  backgroundStyle: { [key: string]: string };
};

export type Promotion = {
  imagePath: string;
  style: { [key: string]: string };
};

export type Board = {
  background: BoardBackground;
  labels: BoardLabel[];
  pieces: BoardPiece[];
  squares: BoardSquare[];
  promote: Promotion | null;
  doNotPromote: Promotion | null;
};

export type HandPiece = {
  id: string;
  imagePath: string;
  style: { [key: string]: string };
};

export type HandNumber = {
  id: string;
  character: string;
  style: { [key: string]: string };
};

export type HandPointer = {
  id: string;
  type: PieceType;
  style: { [key: string]: string };
  backgroundStyle: { [key: string]: string };
};

export type Hand = {
  textureImagePath: string | null;
  touchAreaStyle: { [key: string]: string };
  backgroundStyle: { [key: string]: string };
  pieces: HandPiece[];
  numbers?: HandNumber[];
  pointers: HandPointer[];
};
