<template>
  <DialogFrame @cancel="cancel">
    <div class="title">{{ t.compareEngineSettings }}</div>
    <div class="form-group">
      <div class="select-area row">
        <div class="engine-column">
          <PlayerSelector
            v-model:player-uri="leftEngineURI"
            :engines="usiEngines"
            :enable-edit-button="false"
          />
        </div>
        <div class="engine-column">
          <PlayerSelector
            v-model:player-uri="rightEngineURI"
            :engines="usiEngines"
            :enable-edit-button="false"
          />
        </div>
      </div>
      <div class="option-area">
        <div v-if="leftEngineURI === '' || rightEngineURI === ''">
          {{ t.pleaseSelectEngines }}
        </div>
        <div v-else-if="diff.length === 0">{{ t.noDifference }}</div>
        <div v-for="option of diff" :key="option.name" class="option">
          <div>
            <span>{{ option.displayName }}</span>
            <span v-if="option.displayName"> (</span>
            <span>{{ option.name }}</span>
            <span v-if="option.displayName">)</span>
          </div>
          <div class="row">
            <div class="engine-column">
              <input
                v-if="option.leftValue !== undefined"
                class="option-value"
                readonly
                :value="option.leftValue"
              />
            </div>
            <div class="engine-column">
              <input
                v-if="option.rightValue !== undefined"
                class="option-value"
                readonly
                :value="option.rightValue"
              />
            </div>
          </div>
          <div v-if="!option.mergeable">{{ t.thisItemCannotBeMerged }}</div>
          <div v-else class="row">
            <div class="engine-column">
              <button @click="mergeToLeft(option.name)">
                <Icon :icon="IconType.BACK" />
                {{ t.mergeToLeft }}
              </button>
            </div>
            <div class="engine-column">
              <button @click="mergeToRight(option.name)">
                {{ t.mergeToRight }}
                <Icon :icon="IconType.NEXT" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="ok()">
        {{ t.ok }}
      </button>
      <button data-hotkey="Escape" @click="cancel()">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, PropType, reactive, ref } from "vue";
import PlayerSelector from "./PlayerSelector.vue";
import {
  compareUSIEngineOptions,
  getUSIEngineOptionCurrentValue,
  ImmutableUSIEngines,
} from "@/common/settings/usi";
import { t, usiOptionNameMap } from "@/common/i18n";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import DialogFrame from "./DialogFrame.vue";

const props = defineProps({
  engines: {
    type: Object as PropType<ImmutableUSIEngines>,
    required: true,
  },
});

const emit = defineEmits<{
  ok: [engines: ImmutableUSIEngines];
  cancel: [];
}>();

const appSettings = useAppSettings();
const usiEngines = reactive(props.engines.getClone());
const leftEngineURI = ref("");
const rightEngineURI = ref("");

const merge = (name: string, srcURI: string, dstURI: string) => {
  const src = usiEngines.getEngine(srcURI);
  const dst = usiEngines.getEngine(dstURI);
  if (src && dst && src?.options[name].type !== "button" && dst?.options[name].type !== "button") {
    dst.options[name].value = getUSIEngineOptionCurrentValue(src.options[name]);
  }
};

const mergeToLeft = (name: string) => {
  merge(name, rightEngineURI.value, leftEngineURI.value);
};

const mergeToRight = (name: string) => {
  merge(name, leftEngineURI.value, rightEngineURI.value);
};

const diff = computed(() => {
  const left = usiEngines.getEngine(leftEngineURI.value);
  const right = usiEngines.getEngine(rightEngineURI.value);
  if (!left || !right) {
    return [];
  }
  const translate = appSettings.translateEngineOptionName;
  return compareUSIEngineOptions(left, right).map((option) => {
    return {
      ...option,
      displayName: translate ? usiOptionNameMap[option.name] : "",
    };
  });
});

const ok = () => {
  emit("ok", usiEngines);
};
const cancel = () => {
  emit("cancel");
};
</script>

<style scoped>
.form-group {
  width: 600px;
  max-width: 100%;
}
.select-area {
  width: 100%;
}
.option-area {
  width: 100%;
  height: calc(100vh - 250px);
  overflow: auto;
}
.engine-column {
  margin: 0 5px;
  width: calc(50% - 10px);
}
.option {
  padding: 5px 0;
  border-bottom: 1px solid var(--text-separator-color);
}
.option > *:not(:last-child) {
  margin-bottom: 5px;
}
.option-value {
  width: 100%;
}
</style>
