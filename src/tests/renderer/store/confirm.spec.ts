import { createConfirmationStore } from "@/renderer/store/confirm.js";

describe("store/confirm", () => {
  it("showConfirmation", () => {
    const store = createConfirmationStore();
    const confirmation1 = {
      message: "Are you ready?",
      onOk: vi.fn(),
    };
    store.show(confirmation1);
    expect(store.message).toBe("Are you ready?");
    store.ok();
    expect(store.message).toBeUndefined();
    expect(confirmation1.onOk).toBeCalledTimes(1);
    const confirmation2 = {
      message: "Do you really want to delete?",
      onOk: vi.fn(),
    };
    store.show(confirmation2);
    expect(store.message).toBe("Do you really want to delete?");
    store.cancel();
    expect(store.message).toBeUndefined();
    expect(confirmation2.onOk).toBeCalledTimes(0);
  });
});
