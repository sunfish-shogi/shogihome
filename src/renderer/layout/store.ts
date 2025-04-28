import {
  duplicateCustomLayoutProfile,
  appendCustomLayoutProfile,
  emptyLayoutProfileList,
  LayoutProfile,
  removeCustomLayoutProfile,
} from "@/common/settings/layout.js";
import { UnwrapNestedRefs, reactive } from "vue";
import api from "@/renderer/ipc/api.js";
import * as uri from "@/common/uri.js";

export class Store {
  private _reactive: UnwrapNestedRefs<Store>;
  private _currentProfileURI = uri.ES_STANDARD_LAYOUT_PROFILE;
  private _customProfileList = emptyLayoutProfileList();

  constructor() {
    this._reactive = reactive(this);
  }

  get reactive(): UnwrapNestedRefs<Store> {
    return this._reactive;
  }

  get currentProfileURI() {
    return this._currentProfileURI;
  }

  get customLayoutProfiles() {
    return this._customProfileList.profiles;
  }

  selectProfile(profileURI: string) {
    this._currentProfileURI = profileURI;
    api.updateLayoutProfileList(this._currentProfileURI, this._customProfileList);
  }

  addCustomProfile(profile?: LayoutProfile) {
    const uri = appendCustomLayoutProfile(this._customProfileList, profile);
    this._currentProfileURI = uri;
    api.updateLayoutProfileList(this._currentProfileURI, this._customProfileList);
  }

  duplicateCustomProfile(profileURI: string) {
    const uri = duplicateCustomLayoutProfile(this._customProfileList, profileURI);
    if (!uri) {
      return;
    }
    this._currentProfileURI = uri;
    api.updateLayoutProfileList(this._currentProfileURI, this._customProfileList);
  }

  removeCustomProfile(profileURI: string) {
    removeCustomLayoutProfile(this._customProfileList, profileURI);
    this._currentProfileURI = uri.ES_STANDARD_LAYOUT_PROFILE;
    api.updateLayoutProfileList(this._currentProfileURI, this._customProfileList);
  }

  updateCustomProfile(profileURI: string, profile: LayoutProfile) {
    for (let i = 0; i < this._customProfileList.profiles.length; i++) {
      if (this._customProfileList.profiles[i].uri === profileURI) {
        this._customProfileList.profiles[i] = profile;
        this._currentProfileURI = profileURI;
        break;
      }
    }
    api.updateLayoutProfileList(this._currentProfileURI, this._customProfileList);
  }

  async setup(): Promise<void> {
    [this._currentProfileURI, this._customProfileList] = await api.loadLayoutProfileList();
  }
}

export function createStore(): UnwrapNestedRefs<Store> {
  return new Store().reactive;
}

let store: UnwrapNestedRefs<Store>;

export function useStore(): UnwrapNestedRefs<Store> {
  if (!store) {
    store = createStore();
  }
  return store;
}
