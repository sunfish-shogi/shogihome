import { toMarkdown } from "@/common/message";

describe("message", () => {
  it("toMarkdown", () => {
    expect(toMarkdown({ text: "Hello world!" })).toBe("Hello world!");
    expect(
      toMarkdown({
        text: "Hello world!",
        attachments: [{ type: "list", items: [{ text: "Item 1" }, { text: "Item 2" }] }],
      }),
    ).toBe("Hello world!\n\n- Item 1\n- Item 2");
    expect(
      toMarkdown({
        text: "Hello world!",
        attachments: [{ type: "link", text: "My Link", url: "https://example.com" }],
      }),
    ).toBe("Hello world!\n\n[My Link](https://example.com)");
  });
});
