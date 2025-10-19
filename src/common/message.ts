export type ListItem = {
  text: string;
  children?: string[];
};

export type List = {
  type: "list";
  items: ListItem[];
};

export type Link = {
  type: "link";
  text: string;
  url: string;
};

export type Attachment = List | Link;

export type Message = {
  text: string;
  attachments?: Attachment[];
  withCopyButton?: boolean;
};

export function toMarkdown(message: Message): string {
  const lines = [message.text];
  for (const attachment of message.attachments ?? []) {
    switch (attachment.type) {
      case "list":
        lines.push("");
        for (const item of attachment.items) {
          lines.push(`- ${item.text}`);
          if (item.children) {
            for (const child of item.children) {
              lines.push(`  - ${child}`);
            }
          }
        }
        break;
      case "link":
        lines.push("");
        lines.push(`[${attachment.text}](${attachment.url})`);
        break;
    }
  }
  return lines.join("\n");
}

export function createListItems(object: unknown[] | object): ListItem[] {
  if (object instanceof Array) {
    return object.map((item, index) => {
      if (item instanceof Object || Array.isArray(item)) {
        return {
          text: `${index + 1}`,
          children: createListChildren(item),
        };
      } else {
        return {
          text: `${item}`,
        };
      }
    });
  } else {
    return Object.entries(object).map(([key, value]) => {
      if (value instanceof Object || Array.isArray(value)) {
        return {
          text: key,
          children: createListChildren(value),
        };
      } else {
        return {
          text: `${key}: ${value}`,
        };
      }
    });
  }
}

function createListChildren(object: unknown[] | object): string[] {
  if (object instanceof Array) {
    return object.map((item) => {
      if (item instanceof Object || Array.isArray(item)) {
        return JSON.stringify(item);
      } else {
        return `${item}`;
      }
    });
  } else {
    return Object.entries(object).map(([key, value]) => {
      if (value instanceof Object || Array.isArray(value)) {
        return `${key}: ${JSON.stringify(value)}`;
      } else {
        return `${key}: ${value}`;
      }
    });
  }
}
