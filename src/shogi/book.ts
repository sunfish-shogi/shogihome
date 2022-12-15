export class MoveMetadata {
  public ponder: string | null = null;
}

export class MetaMove {
  public move: string;
  public metadata: MoveMetadata;
  constructor(move: string, metadata: MoveMetadata) {
    this.move = move;
    this.metadata = metadata;
  }
}

export class PositionMetadata { }

export class MetaPosition {
  public position: string;
  public moves: MetaMove[];
  public metadata: PositionMetadata;
  constructor(position: string, moves: MetaMove[], metadata: PositionMetadata) {
    this.position = position;
    this.moves = moves;
    this.metadata = metadata;
  }
}

export class BookMetadata { }

export class MetaBook {
  public positions: MetaPosition[];
  public metadata: BookMetadata;
  constructor(positions: MetaPosition[], metadata: BookMetadata) {
    this.positions = positions;
    this.metadata = metadata;
  }
  public static MakeBook(): MetaBook {
    return new MetaBook([], new BookMetadata);
  }
}