import { ImmutableRecordMetadata, RecordMetadataKey } from "tsshogi";

export function getDateStringFromMetadata(metadata: ImmutableRecordMetadata): string | undefined {
  const datetime =
    metadata.getStandardMetadata(RecordMetadataKey.START_DATETIME) ||
    metadata.getStandardMetadata(RecordMetadataKey.DATE);
  if (datetime) {
    return datetime.trim().replaceAll(" ", "_").replaceAll("/", "").replaceAll(":", "");
  }
}

export function getRecordTitleFromMetadata(metadata: ImmutableRecordMetadata): string | undefined {
  return (
    metadata.getStandardMetadata(RecordMetadataKey.TITLE) ||
    metadata.getStandardMetadata(RecordMetadataKey.TOURNAMENT) ||
    metadata.getStandardMetadata(RecordMetadataKey.OPUS_NAME) ||
    metadata.getStandardMetadata(RecordMetadataKey.OPUS_NO) ||
    metadata.getStandardMetadata(RecordMetadataKey.PLACE) ||
    metadata.getStandardMetadata(RecordMetadataKey.POSTED_ON) ||
    metadata.getStandardMetadata(RecordMetadataKey.AUTHOR)
  );
}
