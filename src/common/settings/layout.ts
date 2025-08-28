import * as uri from "@/common/uri.js";
import { t } from "@/common/i18n/index.js";

type UIComponentCommon = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export enum BoardLayoutType {
  STANDARD = "standard",
  COMPACT = "compact",
  PORTRAIT = "portrait",
}

export enum PositionImageFontWeight {
  W400 = "400",
  W400X = "400+",
  W700X = "700+",
}

type Board = {
  type: "Board";
  rightControlBox?: boolean;
  leftControlBox?: boolean;
  layoutType?: BoardLayoutType;
};

type Record = {
  type: "Record";
  showCommentColumn?: boolean;
  showElapsedTimeColumn?: boolean;
  topControlBox?: boolean;
  branches?: boolean;
};

type Book = {
  type: "Book";
};

export enum EvaluationChartType {
  RAW = "raw",
  WIN_RATE = "winRate",
}

type Chart = {
  type: "Chart";
  chartType: EvaluationChartType;
  showLegend?: boolean;
};

type Analytics = {
  type: "Analytics";
  historyMode?: boolean;
  showHeader?: boolean;
  showTimeColumn?: boolean;
  showMultiPvColumn?: boolean;
  showDepthColumn?: boolean;
  showNodesColumn?: boolean;
  showScoreColumn?: boolean;
  showPlayButton?: boolean;
  showSuggestionsCount?: boolean;
};

type Comment = {
  type: "Comment";
  showBookmark?: boolean;
};

type RecordInfo = {
  type: "RecordInfo";
};

type ControlGroup1 = {
  type: "ControlGroup1";
};

type ControlGroup2 = {
  type: "ControlGroup2";
};

type SimpleBoard = {
  type: "SimpleBoard";
  fontWeight?: PositionImageFontWeight;
  fontScale?: number;
  characterY?: number;
  bookmark?: boolean;
};

export type UIComponent = UIComponentCommon &
  (
    | Board
    | Record
    | Book
    | Chart
    | Analytics
    | Comment
    | RecordInfo
    | ControlGroup1
    | ControlGroup2
    | SimpleBoard
  );

export enum DialogPosition {
  LEFT = "left",
  CENTER = "center",
  RIGHT = "right",
}

export type LayoutProfile = {
  uri: string;
  name: string;
  backgroundColor?: string;
  dialogPosition?: DialogPosition;
  dialogBackdrop?: boolean;
  components: UIComponent[];
};

export type LayoutProfileList = {
  profiles: LayoutProfile[];
};

export function emptyLayoutProfileList(): LayoutProfileList {
  return { profiles: [] };
}

export function appendCustomLayoutProfile(
  list: LayoutProfileList,
  profile?: LayoutProfile,
): string {
  profile = profile || {
    uri: uri.issueCustomLayoutProfileURI(),
    name: t.newCustomProfile,
    dialogBackdrop: true,
    components: [
      {
        type: "Record",
        left: 10,
        top: 298,
        width: 150,
        height: 211,
      },
      {
        type: "Analytics",
        left: 628,
        top: 10,
        width: 400,
        height: 64,
        showMultiPvColumn: true,
        showScoreColumn: true,
      },
      {
        type: "Chart",
        left: 628,
        top: 83,
        width: 400,
        height: 140,
        chartType: EvaluationChartType.WIN_RATE,
      },
      {
        type: "Board",
        left: 10,
        top: 10,
        width: 800,
        height: 500,
      },
      {
        type: "Comment",
        left: 790,
        top: 230,
        width: 240,
        height: 280,
      },
      {
        type: "ControlGroup1",
        left: 1040,
        top: 10,
        width: 150,
        height: 180,
      },
      {
        type: "ControlGroup2",
        left: 1040,
        top: 200,
        width: 150,
        height: 180,
      },
    ],
  };
  list.profiles.push(profile);
  return profile.uri;
}

export function duplicateCustomLayoutProfile(
  list: LayoutProfileList,
  profileURI: string,
): string | null {
  const profile = list.profiles.find((profile) => profile.uri === profileURI);
  if (!profile) {
    return null;
  }
  const newProfileURI = uri.issueCustomLayoutProfileURI();
  list.profiles.push({
    ...JSON.parse(JSON.stringify(profile)),
    uri: newProfileURI,
    name: `${profile.name} (Copy)`,
  });
  return newProfileURI;
}

export function removeCustomLayoutProfile(list: LayoutProfileList, uri: string) {
  list.profiles = list.profiles.filter((profile) => profile.uri !== uri);
}

export function serializeLayoutProfile(layoutProfile: LayoutProfile): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(layoutProfile).filter(([key]) => key !== "uri")),
  );
}

export function deserializeLayoutProfile(data: string): LayoutProfile {
  const layoutProfile = JSON.parse(data) as LayoutProfile;
  layoutProfile.uri = uri.issueCustomLayoutProfileURI();
  if (!Array.isArray(layoutProfile.components)) {
    throw new Error("Invalid layout profile data");
  }
  return layoutProfile;
}
