import { mount } from "@vue/test-utils";
import { Record } from "tsshogi";
import RecordView from "@/renderer/view/primitive/RecordView.vue";
import { getRecordShortcutKeys } from "@/renderer/view/primitive/board/shortcut";

function append(record: Record, usi: string, elapsedMs: number): void {
  const move = record.position.createMoveByUSI(usi);
  if (!move || !record.append(move)) {
    throw new Error(`failed to append move: ${usi}`);
  }
  record.current.setElapsedMs(elapsedMs);
}

function buildRecord(): Record {
  const record = new Record();
  append(record, "7g7f", 12000);
  append(record, "3c3d", 5000);
  return record;
}

function mountRecordView(omitTotalElapsedTime: boolean) {
  return mount(RecordView, {
    props: {
      record: buildRecord(),
      showElapsedTime: true,
      shortcutKeys: getRecordShortcutKeys("vertical"),
      omitTotalElapsedTime,
    },
  });
}

describe("RecordView", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("shows elapsed time with total elapsed time", () => {
    const wrapper = mountRecordView(false);
    const times = wrapper.findAll(".move-list .move-time");
    expect(times).toHaveLength(3);
    expect(times[0].text()).toBe("");
    expect(times[1].text()).toBe("0:12 / 00:00:12");
    expect(times[2].text()).toBe("0:05 / 00:00:05");
  });

  it("omits total elapsed time when omitTotalElapsedTime is set", () => {
    const wrapper = mountRecordView(true);
    const times = wrapper.findAll(".move-list .move-time");
    expect(times).toHaveLength(3);
    expect(times[0].text()).toBe("");
    expect(times[1].text()).toBe("0:12");
    expect(times[2].text()).toBe("0:05");
  });
});
