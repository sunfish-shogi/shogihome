import { RecordMetadataKey } from "tsshogi";
import { t } from "./translation_table.js";

export function getRecordMetadataName(key: RecordMetadataKey): string {
  switch (key) {
    case RecordMetadataKey.BLACK_NAME:
      return t.sente;
    case RecordMetadataKey.WHITE_NAME:
      return t.gote;
    case RecordMetadataKey.SHITATE_NAME:
      return t.shitate;
    case RecordMetadataKey.UWATE_NAME:
      return t.uwate;
    case RecordMetadataKey.START_DATETIME:
      return t.startDateTime;
    case RecordMetadataKey.END_DATETIME:
      return t.endDateTime;
    case RecordMetadataKey.DATE:
      return t.gameDate;
    case RecordMetadataKey.TOURNAMENT:
      return t.tournament;
    case RecordMetadataKey.STRATEGY:
      return t.strategy;
    case RecordMetadataKey.TITLE:
      return t.gameTitle;
    case RecordMetadataKey.TIME_LIMIT:
      return t.timeLimit;
    case RecordMetadataKey.BLACK_TIME_LIMIT:
      return t.blackTimeLimit;
    case RecordMetadataKey.WHITE_TIME_LIMIT:
      return t.whiteTimeLimit;
    case RecordMetadataKey.BYOYOMI:
      return t.byoyomi;
    case RecordMetadataKey.TIME_SPENT:
      return t.elapsedTime;
    case RecordMetadataKey.MAX_MOVES:
      return t.maxMoves;
    case RecordMetadataKey.JISHOGI:
      return t.jishogi;
    case RecordMetadataKey.PLACE:
      return t.place;
    case RecordMetadataKey.POSTED_ON:
      return t.postedOn;
    case RecordMetadataKey.NOTE:
      return t.note;
    case RecordMetadataKey.BLACK_SHORT_NAME:
      return t.senteShortName;
    case RecordMetadataKey.WHITE_SHORT_NAME:
      return t.goteShortName;
    case RecordMetadataKey.SCOREKEEPER:
      return t.scorekeeper;
    case RecordMetadataKey.OPUS_NO:
      return t.opusNo;
    case RecordMetadataKey.OPUS_NAME:
      return t.opusName;
    case RecordMetadataKey.AUTHOR:
      return t.author;
    case RecordMetadataKey.PUBLISHED_BY:
      return t.publishedBy;
    case RecordMetadataKey.PUBLISHED_AT:
      return t.publishedOn;
    case RecordMetadataKey.SOURCE:
      return t.source;
    case RecordMetadataKey.LENGTH:
      return t.numberOfMoves;
    case RecordMetadataKey.INTEGRITY:
      return t.integrity;
    case RecordMetadataKey.CATEGORY:
      return t.recordCategory;
    case RecordMetadataKey.AWARD:
      return t.award;
  }
}
