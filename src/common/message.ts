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
};

export function createListItems(object: unknown[] | object): ListItem[] {
  if (object instanceof Array) {
    return object.map((item, index) => {
      if (item instanceof Object || Array.isArray(item)) {
        return {
          text: `${index}`,
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
