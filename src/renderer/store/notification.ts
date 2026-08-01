import { reactive, UnwrapNestedRefs } from "vue";

export type NotificationEntry = {
  id: number;
  message: string;
  url?: string;
  onClick?: () => void;
};

let nextId = 1;

export class NotificationStore {
  private _entries: NotificationEntry[] = [];

  get entries(): NotificationEntry[] {
    return this._entries;
  }

  add(message: string, url?: string): void {
    this._entries.push({ id: nextId++, message, url });
  }

  /**
   * クリックすると任意の処理を実行する通知を表示します。
   * @param message 表示するメッセージを指定します。
   * @param onClick メッセージがクリックされたときに実行する処理を指定します。
   */
  addAction(message: string, onClick: () => void): void {
    this._entries.push({ id: nextId++, message, onClick });
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
