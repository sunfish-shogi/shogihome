export type RecordShortcutKeys = {
  Back: string;
  Forward: string;
  Begin: string;
  End: string;
};

export function getRecordShortcutKeys(type: "vertical" | "horizontal"): RecordShortcutKeys {
  if (type === "vertical") {
    return {
      Back: "ArrowUp",
      Forward: "ArrowDown",
      Begin: "ArrowLeft",
      End: "ArrowRight",
    };
  } else {
    return {
      Back: "ArrowLeft",
      Forward: "ArrowRight",
      Begin: "ArrowUp",
      End: "ArrowDown",
    };
  }
}
