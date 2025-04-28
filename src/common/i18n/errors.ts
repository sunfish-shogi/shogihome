import {
  InvalidBoardError,
  InvalidDestinationError,
  InvalidHandPieceError,
  InvalidLineError,
  InvalidMoveError,
  InvalidMoveNumberError,
  InvalidPieceNameError,
  InvalidTurnError,
  InvalidUSIError,
  PieceNotExistsError,
} from "tsshogi";
import { t } from "./translation_table.js";

export function localizeError(err: Error): Error {
  if (err instanceof InvalidPieceNameError) {
    return new Error(`${t.invalidPieceName}: ${err.data}`);
  } else if (err instanceof InvalidTurnError) {
    return new Error(`${t.invalidTurn}: ${err.data}`);
  } else if (err instanceof InvalidMoveError) {
    return new Error(`${t.invalidMove}: ${err.data}`);
  } else if (err instanceof InvalidMoveNumberError) {
    return new Error(`${t.invalidMoveNumber}: ${err.data}`);
  } else if (err instanceof InvalidDestinationError) {
    return new Error(`${t.invalidDestination}: ${err.data}`);
  } else if (err instanceof PieceNotExistsError) {
    return new Error(`${t.pieceNotExists}: ${err.data}`);
  } else if (err instanceof InvalidLineError) {
    return new Error(`${t.invalidLine}: ${err.data}`);
  } else if (err instanceof InvalidBoardError) {
    return new Error(`${t.invalidBoard}: ${err.data}`);
  } else if (err instanceof InvalidHandPieceError) {
    return new Error(`${t.invalidHandPiece}: ${err.data}`);
  } else if (err instanceof InvalidUSIError) {
    return new Error(`${t.invalidUSI}: ${err.data}`);
  }
  return err;
}
