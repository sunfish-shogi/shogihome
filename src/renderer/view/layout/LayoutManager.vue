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
          <button @click="addNewProfile">{{ t.addCustomLayoutProfile }}</button>
          <button v-if="customProfile" @click="duplicateProfile">
            {{ t.duplicateCurrentProfile }}
          </button>
          <button v-if="customProfile" @click="removeProfile">
            {{ t.removeCurrentProfile }}
          </button>
          <button v-if="customProfile" @click="exportProfile">
            {{ t.exportProfileToClipboard }}
          </button>
          <button @click="importProfile">
            {{ t.importProfileFromClipboard }}
          </button>
        </div>
      </div>
      <hr />
      <div v-if="customProfile" class="custom-profile column grow">
        <div class="row">
          <input
            class="profile-name"
            :value="customProfile.name"
            @input="(e) => updateCustomProfileProp('name', inputEventToString(e))"
          />
          <button @click="createDesktopShortcut">{{ t.createDesktopShortcut }}</button>
          <ToggleButton
            v-model:value="draggingMode"
            class="dragging-mode-toggle"
            :label="t.editLayoutWithDragAndDrop"
          />
        </div>
        <div v-if="!draggingMode" class="column profile-options">
          <div class="row align-center">
            <span class="key">{{ t.dialogPosition }}:</span>
            <HorizontalSelector
              :value="customProfile.dialogPosition || DialogPosition.CENTER"
              :items="[
                { label: t.alignLeft, value: DialogPosition.LEFT },
                { label: t.alignCenter, value: DialogPosition.CENTER },
                { label: t.alignRight, value: DialogPosition.RIGHT },
              ]"
              :height="24"
              @update:value="(value) => updateCustomProfileProp('dialogPosition', value)"
            />
          </div>
          <div v-if="!draggingMode" class="row profile-toggles">
            <ToggleButton
              :value="!!customProfile.backgroundColor"
              :label="t.backgroundColor"
              :height="18"
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
              :value="!!customProfile.dialogBackdrop"
              :label="t.dialogBackdrop"
              :height="18"
              @update:value="(value) => updateCustomProfileProp('dialogBackdrop', value)"
            />
            <ToggleButton
              :value="!!customProfile.stretch"
              :label="t.stretchCustomLayout"
              :height="18"
              @update:value="(value) => updateCustomProfileProp('stretch', value)"
            />
          </div>
        </div>
        <div class="component-editor column grow">
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
              <option value="ElapsedTimeChart">{{ t.elapsedTimeChart }}</option>
            </select>
            <button @click="insertCustomProfileComponent">{{ t.insert }}</button>
          </div>
          <div v-if="draggingMode" class="grow">
            <DragEditor
              :components="customProfile.components"
              @update-component="onDragEditorUpdate"
            />
          </div>
          <div v-else class="components column grow scroll">
            <div
              v-for="(component, index) of customProfile.components"
              :key="index"
              class="component"
            >
              <div class="component-header row">
                <span class="name">{{ componentTypeName(component.type) }}</span>
                <div class="row buttons">
                  <button v-if="index !== 0" @click="() => moveCustomProfileComponentUp(index)">
                    ↑ {{ t.bringForward }}
                  </button>
                  <button
                    v-if="index !== customProfile.components.length - 1"
                    @click="() => moveCustomProfileComponentDown(index)"
                  >
                    ↓ {{ t.sendBackward }}
                  </button>
                  <button @click="() => removeCustomProfileComponent(index)">
                    {{ t.remove }}
                  </button>
                </div>
              </div>
              <div>
                <span class="property">
                  <span class="key">{{ t.left }}:</span>
                  <input
                    class="value"
                    type="number"
                    :value="component.left"
                    @input="
                      (e) => updateCustomProfileComponent(index, 'left', inputEventToNumber(e))
                    "
                  />
                </span>
                <span class="property">
                  <span class="key">{{ t.top }}:</span>
                  <input
                    class="value"
                    type="number"
                    :value="component.top"
                    @input="
                      (e) => updateCustomProfileComponent(index, 'top', inputEventToNumber(e))
                    "
                  />
                </span>
                <span class="property">
                  <span class="key">{{ t.width }}:</span>
                  <input
                    class="value"
                    type="number"
                    :value="component.width"
                    @input="
                      (e) => updateCustomProfileComponent(index, 'width', inputEventToNumber(e))
                    "
                  />
                </span>
                <span class="property">
                  <span class="key">{{ t.height }}:</span>
                  <input
                    class="value"
                    type="number"
                    :value="component.height"
                    @input="
                      (e) => updateCustomProfileComponent(index, 'height', inputEventToNumber(e))
                    "
                  />
                </span>
              </div>
              <div v-if="component.type === 'Board'">
                <span class="property">
                  <ToggleButton
                    :value="!!component.rightControlBox"
                    :label="t.rightControlBox"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'rightControlBox', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.leftControlBox"
                    :label="t.leftControlBox"
                    :height="18"
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
                      { label: t.portraitSquare, value: BoardLayoutType.PORTRAIT_SQUARE },
                    ]"
                    :height="24"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'layoutType', value)
                    "
                  />
                </span>
              </div>
              <div v-if="component.type === 'Record'">
                <span class="property">
                  <ToggleButton
                    :value="!!component.showCommentColumn"
                    :label="t.comments"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showCommentColumn', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showElapsedTimeColumn"
                    :label="t.elapsedTime"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showElapsedTimeColumn', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.topControlBox"
                    :label="t.topControlBox"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'topControlBox', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.branches"
                    :label="t.branches"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'branches', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showBranchTree"
                    :label="t.tree"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showBranchTree', value)
                    "
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
                    :height="24"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'chartType', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showLegend"
                    :label="t.legends"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showLegend', value)
                    "
                  />
                </span>
              </div>
              <div v-if="component.type === 'Analytics'">
                <span class="property">
                  <ToggleButton
                    :value="!!component.historyMode"
                    :label="t.historyMode"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'historyMode', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showHeader"
                    :label="t.headers"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showHeader', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showTimeColumn"
                    :label="t.elapsedTime"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showTimeColumn', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showMultiPvColumn"
                    :label="t.rank"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showMultiPvColumn', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showDepthColumn"
                    :label="t.depth"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showDepthColumn', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showNodesColumn"
                    :label="t.nodes"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showNodesColumn', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showScoreColumn"
                    :label="t.score"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showScoreColumn', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showPlayButton"
                    :label="t.playButton"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showPlayButton', value)
                    "
                  />
                </span>
                <span class="property">
                  <ToggleButton
                    :value="!!component.showSuggestionsCount"
                    :label="t.suggestionsCount"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showSuggestionsCount', value)
                    "
                  />
                </span>
              </div>
              <div v-if="component.type === 'ElapsedTimeChart'">
                <span class="property">
                  <ToggleButton
                    :value="!!component.showLegend"
                    :label="t.legends"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'showLegend', value)
                    "
                  />
                </span>
              </div>
              <div v-if="component.type === 'Comment'">
                <span class="property">
                  <ToggleButton
                    :value="!!component.showBookmark"
                    :label="t.bookmark"
                    :height="18"
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
                    :height="24"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'fontWeight', value)
                    "
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
                  <ToggleButton
                    :value="!!component.bookmark"
                    :label="t.bookmark"
                    :height="18"
                    @update:value="
                      (value) => updateCustomProfileComponent(index, 'bookmark', value)
                    "
                  />
                </span>
              </div>
            </div>
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
  UIComponent,
} from "@/common/settings/layout";
import { t } from "@/common/i18n";
import { useMessageStore } from "@/renderer/store/message";
import { useErrorStore } from "@/renderer/store/error";
import { useConfirmationStore } from "@/renderer/store/confirm";
import InfoMessage from "@/renderer/view/dialog/InfoMessage.vue";
import ErrorMessage from "@/renderer/view/dialog/ErrorMessage.vue";
import ConfirmDialog from "@/renderer/view/dialog/ConfirmDialog.vue";
import api from "@/renderer/ipc/api";
import DragEditor from "@/renderer/view/layout/DragEditor.vue";

const appSettings = useAppSettings();
const messageStore = useMessageStore();
const errorStore = useErrorStore();
const confirmation = useConfirmationStore();
const store = useStore();
const newComponentType = ref();
const draggingMode = ref(false);

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

const onDragEditorUpdate = (
  index: number,
  left: number,
  top: number,
  width: number,
  height: number,
) => {
  const profile = getCurrentProfile();
  if (!profile) {
    return;
  }
  store.updateCustomProfile(store.currentProfileURI, {
    ...profile,
    components: profile.components.map((component, i) =>
      i !== index ? component : { ...component, left, top, width, height },
    ),
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
    case "ElapsedTimeChart":
      components.unshift({
        type,
        left: 0,
        top: 0,
        width: 600,
        height: 200,
      });
      break;
  }
  store.updateCustomProfile(store.currentProfileURI, { ...profile, components });
};

const componentTypeName = (type: UIComponent["type"]) => {
  return {
    Board: t.board,
    Record: t.record,
    Book: t.book,
    Chart: t.chart,
    Analytics: t.analytics,
    Comment: t.comments,
    RecordInfo: t.recordProperties,
    ControlGroup1: `${t.controlGroup}1`,
    ControlGroup2: `${t.controlGroup}2`,
    SimpleBoard: t.bookStyleDiagram,
    ElapsedTimeChart: t.elapsedTimeChart,
  }[type];
};
</script>

<style scoped>
button {
  margin: 0px 2px 0px 0px;
  padding: 1px 10px;
}
.root {
  color: var(--dialog-color);
  background-color: var(--dialog-bg-color);
  height: 100%;
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
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
  min-height: 0;
}
.custom-profile > *:not(:last-child) {
  margin-bottom: 15px;
}
.profile-name {
  width: 200px;
}
.dragging-mode-toggle {
  margin-left: 10px;
}
.component-editor {
  min-height: 0;
}
.components {
  border: 1px dashed var(--dialog-border-color);
  padding: 10px;
}
.component {
  border: 1px solid var(--dialog-border-color);
  padding: 10px;
  margin-top: 2px;
}
.component > * {
  text-align: left;
}
.component > *:not(:last-child) {
  margin-bottom: 5px;
}
.component-header > .name {
  font-weight: bold;
}
.component-header > .buttons {
  margin-left: auto;
}
.property:not(:last-child) {
  display: inline-block;
  margin-right: 20px;
}
.key {
  font-size: 0.8em;
  display: inline-block;
  text-align: center;
  min-width: 40px;
  margin-right: 5px;
}
.value {
  font-size: 0.9em;
  display: inline-block;
  width: 50px;
}
.profile-options > *:not(:last-child) {
  margin-bottom: 5px;
}
.profile-toggles > * {
  display: inline-block;
  margin-right: 20px;
}
.color-selector {
  height: 18px;
}
hr {
  width: 100%;
  border: none;
  border-top: 1px dashed var(--dialog-border-color);
  margin: 15px 0;
}
</style>
