import { createErrorStore } from "@/renderer/store/error.js";

describe("store/error", () => {
  it("errors", () => {
    const store = createErrorStore();
    expect(store.hasError).toBeFalsy();
    expect(store.errors).toHaveLength(0);
    store.add("first error");
    expect(store.hasError).toBeTruthy();
    expect(store.errors).toHaveLength(1);
    expect(store.errors[0].message).toBe("first error");
    store.add("second error");
    expect(store.hasError).toBeTruthy();
    expect(store.errors).toHaveLength(2);
    expect(store.errors[0].message).toBe("first error");
    expect(store.errors[1].message).toBe("second error");
    store.add(new Error("an error object"));
    store.add(new AggregateError(["error1", "error2"], "aggregate error"));
    expect(store.errors).toHaveLength(5);
    expect(store.errors[0].message).toBe("an error object");
    expect(store.errors[1].message).toBe("error1");
    expect(store.errors[2].message).toBe("error2");
    expect(store.errors[3].message).toBe("first error");
    expect(store.errors[4].message).toBe("second error");
    store.clear();
    expect(store.hasError).toBeFalsy();
    expect(store.errors).toHaveLength(0);
  });
});
