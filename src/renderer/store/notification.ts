import { reactive, UnwrapNestedRefs } from "vue";

export type NotificationEntry = {
  id: number;
  message: string;
};

let nextId = 1;

export class NotificationStore {
  private _entries: NotificationEntry[] = [];

  get entries(): NotificationEntry[] {
    return this._entries;
  }

  add(message: string): void {
    this._entries.push({ id: nextId++, message });
  }

  dismiss(id: number): void {
    const index = this._entries.findIndex((e) => e.id === id);
    if (index !== -1) {
      this._entries.splice(index, 1);
    }
  }
}

export function createNotificationStore(): UnwrapNestedRefs<NotificationStore> {
  return reactive(new NotificationStore());
}

let store: UnwrapNestedRefs<NotificationStore>;

export function useNotificationStore(): UnwrapNestedRefs<NotificationStore> {
  if (!store) {
    store = createNotificationStore();
  }
  return store;
}
