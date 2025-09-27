<template>
  <div class="root full" :class="appSettings.thema">
    <div class="main full column">
      <div class="header column">
        <select :value="store.currentProfileURI" @change="selectProfile">
          <option :value="uri.ES_STANDARD_LAYOUT_PROFILE">{{ t.standard }}</option>
          <option
            v-for="(profile, index) of store.customLayoutProfiles"
            :key="index"
            :value="profile.uri"
          >
            {{ profile.name }}
          </option>
        </select>
        <div class="row wrap buttons">
          <button class="thin" @click="addNewProfile">{{ t.addCustomLayoutProfile }}</button>
          <button v-if="customProfile" class="thin" @click="duplicateProfile">
            {{ t.duplicateCurrentProfile }}
          </button>
          <button v-if="customProfile" class="thin" @click="removeProfile">
            {{ t.removeCurrentProfile }}
          </button>
          <button v-if="customProfile" class="thin" @click="exportProfile">
            {{ t.exportProfileToClipboard }}
          </button>
          <button class="thin" @click="importProfile">
            {{ t.importProfileFromClipboard }}
          </button>
        </div>
      </div>
      <div v-if="customProfile" class="custom-profile column grow scroll">
        <div class="column">
          <input
            class="profile-name"
            :value="customProfile.name"
            @input="(e) => updateCustomProfileProp('name', inputEventToString(e))"
          />
          <div class="uri row">
            <span>URI:</span>
            <span>{{ customProfile.uri }}</span>
            <button @click="copyProfileURI">
              <Icon :icon="IconType.COPY" />
            </button>
          </div>
          <div class="row">
            <button @click="createDesktopShortcut">{{ t.createDesktopShortcut }}</button>
          </div>
        </div>
        <div class="row">
          <span class="key">{{ t.dialogPosition }}:</span>
          <HorizontalSelector
            :value="customProfile.dialogPosition || DialogPosition.CENTER"
            :items="[
              { label: t.alignLeft, value: DialogPosition.LEFT },
              { label: t.alignCenter, value: DialogPosition.CENTER },
              { label: t.alignRight, value: DialogPosition.RIGHT },
            ]"
            @update:value="(value) => updateCustomProfileProp('dialogPosition', value)"
          />
        </div>
        <div class="row">
          <ToggleButton
            class="color-toggle"
            :value="!!customProfile.backgroundColor"
            :label="t.backgroundColor"
            @update:value="
              (value) => updateCustomProfileProp('backgroundColor', value ? '#000000' : undefined)
            "
          />
          <input
            v-if="customProfile.backgroundColor"
            class="color-selector"
            type="color"
            :value="customProfile.backgroundColor"
            @input="(e) => updateCustomProfileProp('backgroundColor', inputEventToString(e))"
          />
          <ToggleButton
            class="backdrop-toggle"
            :value="!!customProfile.dialogBackdrop"
            :label="t.dialogBackdrop"
            @update:value="(value) => updateCustomProfileProp('dialogBackdrop', value)"
          />
        </div>
        <div class="row">
          <select ref="newComponentType" size="1">
            <option value="Board">{{ t.board }}</option>
            <option value="Record">{{ t.record }}</option>
            <option value="Book">{{ t.book }}</option>
            <option value="Chart">{{ t.chart }}</option>
            <option value="Analytics">{{ t.analytics }}</option>
            <option value="Comment">{{ t.comments }}</option>
            <option value="RecordInfo">{{ t.recordProperties }}</option>
            <option value="ControlGroup1">{{ t.controlGroup }}1</option>
            <option value="ControlGroup2">{{ t.controlGroup }}2</option>
            <option value="SimpleBoard">{{ t.bookStyleDiagram }}</option>
          </select>
          <button class="thin" @click="insertCustomProfileComponent">{{ t.insert }}</button>
        </div>
        <div v-for="(component, index) of customProfile.components" :key="index" class="component">
          <div class="name">
            <span v-if="component.type === 'Board'">{{ t.board }}</span>
            <span v-if="component.type === 'Record'">{{ t.record }}</span>
            <span v-if="component.type === 'Book'">{{ t.book }}</span>
            <span v-if="component.type === 'Chart'">{{ t.chart }}</span>
            <span v-if="component.type === 'Analytics'">{{ t.analytics }}</span>
            <span v-if="component.type === 'Comment'">{{ t.comments }}</span>
            <span v-if="component.type === 'RecordInfo'">{{ t.recordProperties }}</span>
            <span v-if="component.type === 'ControlGroup1'">{{ t.controlGroup }}1</span>
            <span v-if="component.type === 'ControlGroup2'">{{ t.controlGroup }}2</span>
            <span v-if="component.type === 'SimpleBoard'">{{ t.bookStyleDiagram }}</span>
          </div>
          <div>
            <span class="property">
              <span class="key">{{ t.left }}:</span>
              <input
                class="value"
                type="number"
                :value="component.left"
                @input="(e) => updateCustomProfileComponent(index, 'left', inputEventToNumber(e))"
              />
            </span>
            <span class="property">
              <span class="key">{{ t.top }}:</span>
              <input
                class="value"
                type="number"
                :value="component.top"
                @input="(e) => updateCustomProfileComponent(index, 'top', inputEventToNumber(e))"
              />
            </span>
            <span class="property">
              <span class="key">{{ t.width }}:</span>
              <input
                class="value"
                type="number"
                :value="component.width"
                @input="(e) => updateCustomProfileComponent(index, 'width', inputEventToNumber(e))"
              />
            </span>
            <span class="property">
              <span class="key">{{ t.height }}:</span>
              <input
                class="value"
                type="number"
                :value="component.height"
                @input="(e) => updateCustomProfileComponent(index, 'height', inputEventToNumber(e))"
              />
            </span>
          </div>
          <div v-if="component.type === 'Board'">
            <span class="property">
              <ToggleButton
                :value="!!component.rightControlBox"
                :label="t.rightControlBox"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'rightControlBox', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.leftControlBox"
                :label="t.leftControlBox"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'leftControlBox', value)
                "
              />
            </span>
            <span>
              <HorizontalSelector
                :value="component.layoutType || BoardLayoutType.STANDARD"
                :items="[
                  { label: t.standard, value: BoardLayoutType.STANDARD },
                  { label: t.compact, value: BoardLayoutType.COMPACT },
                  { label: t.portrait, value: BoardLayoutType.PORTRAIT },
                ]"
                @update:value="(value) => updateCustomProfileComponent(index, 'layoutType', value)"
              />
            </span>
          </div>
          <div v-if="component.type === 'Record'">
            <span class="property">
              <ToggleButton
                :value="!!component.showCommentColumn"
                :label="t.comments"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showCommentColumn', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showElapsedTimeColumn"
                :label="t.elapsedTime"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showElapsedTimeColumn', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.topControlBox"
                :label="t.topControlBox"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'topControlBox', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.branches"
                :label="t.branches"
                @update:value="(value) => updateCustomProfileComponent(index, 'branches', value)"
              />
            </span>
          </div>
          <div v-if="component.type === 'Chart'">
            <span class="property">
              <HorizontalSelector
                :value="component.chartType"
                :items="[
                  { label: t.rawScore, value: EvaluationChartType.RAW },
                  { label: t.estimatedWinRate, value: EvaluationChartType.WIN_RATE },
                ]"
                @update:value="(value) => updateCustomProfileComponent(index, 'chartType', value)"
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showLegend"
                :label="t.legends"
                @update:value="(value) => updateCustomProfileComponent(index, 'showLegend', value)"
              />
            </span>
          </div>
          <div v-if="component.type === 'Analytics'">
            <span class="property">
              <ToggleButton
                :value="!!component.historyMode"
                :label="t.historyMode"
                @update:value="(value) => updateCustomProfileComponent(index, 'historyMode', value)"
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showHeader"
                :label="t.headers"
                @update:value="(value) => updateCustomProfileComponent(index, 'showHeader', value)"
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showTimeColumn"
                :label="t.elapsedTime"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showTimeColumn', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showMultiPvColumn"
                :label="t.rank"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showMultiPvColumn', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showDepthColumn"
                :label="t.depth"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showDepthColumn', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showNodesColumn"
                :label="t.nodes"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showNodesColumn', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showScoreColumn"
                :label="t.score"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showScoreColumn', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showPlayButton"
                :label="t.playButton"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showPlayButton', value)
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.showSuggestionsCount"
                :label="t.suggestionsCount"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showSuggestionsCount', value)
                "
              />
            </span>
          </div>
          <div v-if="component.type === 'Comment'">
            <span class="property">
              <ToggleButton
                :value="!!component.showBookmark"
                :label="t.bookmark"
                @update:value="
                  (value) => updateCustomProfileComponent(index, 'showBookmark', value)
                "
              />
            </span>
          </div>
          <div v-if="component.type === 'SimpleBoard'">
            <span class="property">
              <span class="key">{{ t.weight }}:</span>
              <HorizontalSelector
                :value="component.fontWeight || '400'"
                :items="[
                  { label: t.thin, value: PositionImageFontWeight.W400 },
                  { label: t.bold, value: PositionImageFontWeight.W400X },
                  { label: t.extraBold, value: PositionImageFontWeight.W700X },
                ]"
                @update:value="(value) => updateCustomProfileComponent(index, 'fontWeight', value)"
              />
            </span>
            <span class="property">
              <span class="key">{{ t.size }}:</span>
              <input
                class="value"
                type="number"
                min="0"
                max="200"
                :value="component.fontScale || 100"
                @input="
                  (e) => updateCustomProfileComponent(index, 'fontScale', inputEventToNumber(e))
                "
              />
              <span>%</span>
            </span>
            <span class="property">
              <span class="key">{{ t.vertical }}:</span>
              <input
                class="value"
                type="number"
                min="-100"
                max="100"
                :value="component.characterY || 0"
                @input="
                  (e) => updateCustomProfileComponent(index, 'characterY', inputEventToNumber(e))
                "
              />
            </span>
            <span class="property">
              <ToggleButton
                :value="!!component.bookmark"
                :label="t.bookmark"
                @update:value="(value) => updateCustomProfileComponent(index, 'bookmark', value)"
              />
            </span>
          </div>
          <div>
            <button
              v-if="index !== 0"
              class="thin"
              @click="() => moveCustomProfileComponentUp(index)"
            >
              ↑ {{ t.bringForward }}
            </button>
            <button
              v-if="index !== customProfile.components.length - 1"
              class="thin"
              @click="() => moveCustomProfileComponentDown(index)"
            >
              ↓ {{ t.sendBackward }}
            </button>
            <button class="thin" @click="() => removeCustomProfileComponent(index)">
              {{ t.remove }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <InfoMessage v-if="messageStore.hasMessage" />
    <ErrorMessage v-if="errorStore.hasError" />
    <ConfirmDialog v-if="confirmation.message" />
  </div>
</template>

<script setup lang="ts">
import * as uri from "@/common/uri";
import { useStore } from "@/renderer/layout/store";
import { useAppSettings } from "@/renderer/store/settings";
import { computed, ref } from "vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { inputEventToString, inputEventToNumber } from "@/renderer/helpers/form";
import {
  BoardLayoutType,
  deserializeLayoutProfile,
  EvaluationChartType,
  serializeLayoutProfile,
  DialogPosition,
  PositionImageFontWeight,
} from "@/common/settings/layout";
import { t } from "@/common/i18n";
import { useMessageStore } from "@/renderer/store/message";
import { useErrorStore } from "@/renderer/store/error";
import { useConfirmationStore } from "@/renderer/store/confirm";
import InfoMessage from "@/renderer/view/dialog/InfoMessage.vue";
import ErrorMessage from "@/renderer/view/dialog/ErrorMessage.vue";
import ConfirmDialog from "@/renderer/view/dialog/ConfirmDialog.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons.js";
import api from "@/renderer/ipc/api";

const appSettings = useAppSettings();
const messageStore = useMessageStore();
const errorStore = useErrorStore();
const confirmation = useConfirmationStore();
const store = useStore();
const newComponentType = ref();

const customProfile = computed(() =>
  store.customLayoutProfiles.find((profile) => profile.uri === store.currentProfileURI),
);

const selectProfile = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  store.selectProfile(target.value);
};

const addNewProfile = () => {
  store.addCustomProfile();
};

const duplicateProfile = () => {
  store.duplicateCustomProfile(store.currentProfileURI);
};

const removeProfile = () => {
  if (store.currentProfileURI.startsWith(uri.ES_CUSTOM_LAYOUT_PROFILE_PREFIX)) {
    confirmation.show({
      message: t.areYouSureWantToRemoveCurrentProfile,
      onOk: () => {
        store.removeCustomProfile(store.currentProfileURI);
      },
    });
  }
};

const getCurrentProfile = () => {
  return store.customLayoutProfiles.find((profile) => profile.uri === store.currentProfileURI);
};

const exportProfile = () => {
  const profile = getCurrentProfile();
  if (profile) {
    const data = serializeLayoutProfile(profile);
    navigator.clipboard.writeText(data);
    messageStore.enqueue({ text: t.profileExportedToClipboard });
  }
};

const importProfile = async () => {
  try {
    const data = await navigator.clipboard.readText();
    const profile = deserializeLayoutProfile(data);
    store.addCustomProfile(profile);
    messageStore.enqueue({ text: t.profileImported });
  } catch (e) {
    errorStore.add(new Error(`${t.failedToImportProfile}: ${e}`));
  }
};

const copyProfileURI = () => {
  const profile = getCurrentProfile();
  if (!profile) {
    return;
  }
  navigator.clipboard.writeText(profile.uri);
};

const createDesktopShortcut = async () => {
  const profile = getCurrentProfile();
  if (!profile) {
    return;
  }
  try {
    await api.createDesktopShortcutForLayoutProfile(profile.uri, profile.name);
    messageStore.enqueue({ text: t.desktopShortcutCreated });
  } catch (e) {
    errorStore.add(e);
  }
};

const updateCustomProfileProp = (key: string, value: unknown) => {
  const profile = getCurrentProfile();
  if (!profile) {
    return;
  }
  store.updateCustomProfile(store.currentProfileURI, { ...profile, [key]: value });
};

const updateCustomProfileComponent = (index: number, key: string, value: unknown) => {
  const profile = getCurrentProfile();
  if (!profile) {
    return;
  }
  store.updateCustomProfile(store.currentProfileURI, {
    ...profile,
    components: profile.components.map((component, i) => {
      if (i !== index) {
        return component;
      }
      return { ...component, [key]: value };
    }),
  });
};

const moveCustomProfileComponentUp = (index: number) => {
  const profile = getCurrentProfile();
  if (!profile || index <= 0) {
    return;
  }
  const components = [...profile.components];
  const temp = components[index - 1];
  components[index - 1] = components[index];
  components[index] = temp;
  store.updateCustomProfile(store.currentProfileURI, { ...profile, components });
};

const moveCustomProfileComponentDown = (index: number) => {
  const profile = getCurrentProfile();
  if (!profile || index >= profile.components.length - 1) {
    return;
  }
  const components = [...profile.components];
  const temp = components[index + 1];
  components[index + 1] = components[index];
  components[index] = temp;
  store.updateCustomProfile(store.currentProfileURI, { ...profile, components });
};

const removeCustomProfileComponent = (index: number) => {
  const profile = getCurrentProfile();
  if (!profile) {
    return;
  }
  store.updateCustomProfile(store.currentProfileURI, {
    ...profile,
    components: profile.components.filter((_, i) => i !== index),
  });
};

const insertCustomProfileComponent = () => {
  const profile = getCurrentProfile();
  if (!profile) {
    return;
  }
  const components = [...profile.components];
  const type = newComponentType.value.value;
  switch (type) {
    case "Board":
      components.unshift({
        type,
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      });
      break;
    case "Record":
      components.unshift({
        type: "Record",
        left: 0,
        top: 0,
        width: 400,
        height: 500,
      });
      break;
    case "Book":
      components.unshift({
        type: "Book",
        left: 0,
        top: 0,
        width: 500,
        height: 250,
      });
      break;
    case "Chart":
      components.unshift({
        type: "Chart",
        left: 0,
        top: 0,
        width: 600,
        height: 300,
        chartType: EvaluationChartType.RAW,
      });
      break;
    case "Analytics":
      components.unshift({
        type: "Analytics",
        left: 0,
        top: 0,
        width: 600,
        height: 300,
      });
      break;
    case "Comment":
      components.unshift({
        type,
        left: 0,
        top: 0,
        width: 250,
        height: 250,
      });
      break;
    case "RecordInfo":
      components.unshift({
        type,
        left: 0,
        top: 0,
        width: 400,
        height: 300,
      });
      break;
    case "ControlGroup1":
    case "ControlGroup2":
      components.unshift({
        type,
        left: 0,
        top: 0,
        width: 150,
        height: 200,
      });
      break;
    case "SimpleBoard":
      components.unshift({
        type,
        left: 0,
        top: 0,
        width: 400,
        height: 300,
      });
      break;
  }
  store.updateCustomProfile(store.currentProfileURI, { ...profile, components });
};
</script>

<style scoped>
button {
  margin: 0px 5px 0px 0px;
}
.root {
  color: var(--dialog-color);
  background-color: var(--dialog-bg-color);
  height: 100%;
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
}
.main > *:not(:last-child) {
  margin-bottom: 10px;
}
.header {
  text-align: left;
}
.header > *:not(:last-child) {
  margin-bottom: 10px;
}
.buttons {
  row-gap: 5px;
}
.buttons > * {
  display: inline-block;
  white-space: nowrap;
}
.custom-profile {
  border: 1px dashed var(--dialog-border-color);
  border-radius: 10px;
  padding: 10px;
}
.custom-profile > *:not(:last-child) {
  margin-bottom: 10px;
}
.profile-name {
  width: 100%;
}
.uri {
  font-size: 0.8em;
}
.uri .icon {
  width: 16px;
}
.uri > *:not(:last-child) {
  margin-right: 5px;
}
.component {
  border: 1px solid var(--dialog-border-color);
  padding: 10px;
}
.component > * {
  text-align: left;
}
.component > .name {
  font-weight: bold;
}
.component > *:not(:last-child) {
  margin-bottom: 5px;
}
.property:not(:last-child) {
  display: inline-block;
  margin-right: 20px;
}
.key {
  display: inline-block;
  text-align: center;
  min-width: 60px;
  margin-right: 5px;
}
.value {
  display: inline-block;
  width: 50px;
}
.color-toggle {
  display: inline-block;
  margin-right: 20px;
}
.color-selector {
  display: inline-block;
  height: 24px;
  margin-right: 20px;
}
.backdrop-toggle {
  display: inline-block;
}
</style>
