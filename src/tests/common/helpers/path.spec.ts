import { removeLastSlash } from "@/common/helpers/path";

describe("path", () => {
  it("removeLastSlash", () => {
    expect(removeLastSlash("/path/to/directory/")).toBe("/path/to/directory");
    expect(removeLastSlash("/path/to/directory\\")).toBe("/path/to/directory");
    expect(removeLastSlash("/path/to/directory")).toBe("/path/to/directory");
    expect(removeLastSlash("/")).toBe("/");
    expect(removeLastSlash("\\")).toBe("\\");
    expect(removeLastSlash("C:\\")).toBe("C:\\");
    expect(removeLastSlash("")).toBe("");
  });
});
