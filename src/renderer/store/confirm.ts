import { LogLevel } from "@/common/log.js";
import api from "@/renderer/ipc/api.js";
import { reactive, UnwrapNestedRefs } from "vue";

export type Confirmation = {
  message: string;
  onOk: () => void;
  onCancel?: () => void;
};

class ConfirmationStore {
  private _confirmation?: Confirmation;

  get message(): string | undefined {
    return this._confirmation?.message;
  }

  /**
   * 確認ダイアログを表示します。既に表示されているものは消えます。
   * @param _confirmation 確認ダイアログの情報とハンドラーを指定します。
   */
  show(confirmation: Confirmation): void {
    if (this._confirmation) {
      api.log(
        LogLevel.WARN,
        "ConfirmationStore#show: 確認ダイアログを多重に表示しようとしました。" +
          ` currentMessage=${this._confirmation.message}` +
          ` newMessage=${confirmation.message}`,
      );
      if (this._confirmation.onCancel) {
        this._confirmation.onCancel();
      }
    }
    this._confirmation = confirmation;
  }

  ok(): void {
    if (!this._confirmation) {
      return;
    }
    const confirmation = this._confirmation;
    this._confirmation = undefined;
    confirmation.onOk();
  }

  cancel(): void {
    if (!this._confirmation) {
      return;
    }
    const confirmation = this._confirmation;
    this._confirmation = undefined;
    if (confirmation.onCancel) {
      confirmation.onCancel();
    }
  }
}

export function createConfirmationStore(): UnwrapNestedRefs<ConfirmationStore> {
  return reactive(new ConfirmationStore());
}

let store: UnwrapNestedRefs<ConfirmationStore>;

export function useConfirmationStore(): UnwrapNestedRefs<ConfirmationStore> {
  if (!store) {
    store = createConfirmationStore();
  }
  return store;
}
