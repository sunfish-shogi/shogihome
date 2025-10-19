<template>
  <DialogFrame @cancel="cancel">
    <div class="title">{{ t.engineManagement }}</div>
    <div class="form-group">
      <div class="row engine-filter">
        <input v-model.trim="filter" class="filter-words" :placeholder="t.filterByEngineName" />
        <div class="row filter-tags">
          <div
            v-for="tag in tags"
            :key="tag.name"
            class="filter-tag"
            :style="tag.style"
            @click="onClickTag(tag.name)"
          >
            {{ tag.name }}
          </div>
        </div>
      </div>
      <div ref="list" class="column engine-list">
        <div v-if="usiEngines.engineList.length === 0" class="engine">
          {{ t.noEngineRegistered }}
        </div>
        <div
          v-for="engine in engines"
          v-show="engine.visible"
          :key="engine.uri"
          class="row engine"
          :value="engine.uri"
        >
          <div class="column">
            <div class="engine-name" :class="{ highlight: engine.uri === lastAdded }">
              {{ engine.name }}
            </div>
            <div class="row tags">
              <div
                v-for="tag of engine.tags"
                :key="tag.name"
                class="tag"
                :style="{ backgroundColor: tag.color }"
              >
                {{ tag.name }} <span @click="removeTag(engine.uri, tag.name)">&#x2715;</span>
              </div>
              <div class="tag add" @click="showAddTagDialog(engine.uri)">&plus;</div>
            </div>
          </div>
          <div class="column space-evenly">
            <div class="row space-evenly">
              <button @click="openOptions(engine.uri)">{{ t.config }}</button>
              <button @click="duplicate(engine.uri)">{{ t.duplicate }}</button>
              <button @click="remove(engine.uri)">{{ t.remove }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="menu row">
      <button class="wide" @click="add()">{{ t.add }}</button>
      <button class="wide" @click="openMerge()">{{ t.compareAndMerge }}</button>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="saveAndClose()">
        {{ t.saveAndClose }}
      </button>
      <button data-hotkey="Escape" @click="cancel()">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
  <USIEngineOptionsDialog
    v-if="optionDialog"
    :latest="optionDialog"
    @ok="optionOk"
    @cancel="optionCancel"
  />
  <USIEngineMergeDialog
    v-if="mergeDialog"
    :engines="usiEngines"
    @ok="mergeOk"
    @cancel="mergeCancel"
  />
  <AddEngineTagDialog
    v-if="addTagDialog"
    :tags="tagCandidates"
    @add="addTag"
    @cancel="addTagDialog = false"
  />
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { filter as filterString } from "@/common/helpers/string";
import api from "@/renderer/ipc/api";
import { duplicateEngine, USIEngine, USIEngines, ImmutableUSIEngines } from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { ref, onMounted, computed, onBeforeUnmount, reactive } from "vue";
import USIEngineOptionsDialog from "@/renderer/view/dialog/USIEngineOptionsDialog.vue";
import { useAppSettings } from "@/renderer/store/settings";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import USIEngineMergeDialog from "./USIEngineMergeDialog.vue";
import DialogFrame from "./DialogFrame.vue";
import AddEngineTagDialog from "./AddEngineTagDialog.vue";

const store = useStore();
const busyState = useBusyState();
const list = ref();
const optionDialog = ref(null as USIEngine | null);
const mergeDialog = ref(false);
const usiEngines = ref(new USIEngines());
const filter = ref("");
const lastAdded = ref("");
const addTagDialog = ref(false);
const addTagTarget = ref("");
const tagCandidates = ref([] as string[]);
const selectedTags = reactive(new Set<string>([]));
let observer: MutationObserver | null = null;
let scrollTo = "";

busyState.retain();

const onUpdated = () => {
  if (scrollTo) {
    const element = list.value?.querySelector(`[value="${scrollTo}"]`);
    element?.scrollIntoView({ behavior: "auto", block: "nearest" });
    scrollTo = "";
  }
};

onMounted(async () => {
  try {
    observer = new MutationObserver(() => onUpdated());
    observer.observe(list.value, {
      childList: true,
      subtree: true,
    });
    usiEngines.value = await api.loadUSIEngines();
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
});

const engines = computed(() => {
  const filterWords = filter.value.split(/ +/).filter((s) => s);
  const filterTags = [...selectedTags.values()].filter((tag) =>
    tags.value.some((t) => t.name === tag),
  );
  return usiEngines.value.engineList.map((engine) => {
    const tags = engine.tags?.map((tag) => {
      return {
        name: tag,
        color: usiEngines.value.getTagColor(tag),
      };
    });
    const wordMatch =
      !filterWords.length ||
      filterString(engine.name, filterWords) ||
      filterString(engine.defaultName, filterWords);
    const tagMatch = !filterTags.length || filterTags.every((tag) => engine.tags?.includes(tag));
    return {
      uri: engine.uri,
      name: engine.name,
      tags,
      visible: wordMatch && tagMatch,
    };
  });
});

const tags = computed(() => {
  return usiEngines.value.tagList.map((tag) => {
    const selected = selectedTags.has(tag.name);
    const backgroundColor = selected ? tag.color : "#eee";
    return {
      name: tag.name,
      style: {
        color: selected ? "white" : "black",
        backgroundColor,
        borderColor: backgroundColor,
      },
    };
  });
});

function onClickTag(tag: string) {
  if (selectedTags.has(tag)) {
    selectedTags.delete(tag);
  } else {
    selectedTags.add(tag);
  }
}

const add = async () => {
  try {
    busyState.retain();
    const path = await api.showSelectUSIEngineDialog();
    if (!path) {
      return;
    }
    const appSettings = useAppSettings();
    const timeoutSeconds = appSettings.engineTimeoutSeconds;
    const [engine] = await api.getUSIEngineInfo(path, timeoutSeconds);
    usiEngines.value.addEngine(engine);
    lastAdded.value = scrollTo = engine.uri;
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const remove = (uri: string) => {
  usiEngines.value.removeEngine(uri);
};

const showAddTagDialog = (uri: string) => {
  addTagDialog.value = true;
  addTagTarget.value = uri;
  const targetEngine = usiEngines.value.getEngine(uri) as USIEngine;
  const tagSet = new Set<string>();
  for (const engine of usiEngines.value.engineList) {
    if (engine.uri !== uri && engine.tags) {
      for (const tag of engine.tags) {
        if (!targetEngine.tags?.includes(tag)) {
          tagSet.add(tag);
        }
      }
    }
  }
  tagCandidates.value = Array.from(tagSet);
};

const addTag = (tag: string) => {
  addTagDialog.value = false;
  usiEngines.value.addTag(addTagTarget.value, tag);
};

const removeTag = (uri: string, tag: string) => {
  usiEngines.value.removeTag(uri, tag);
};

const openOptions = (uri: string) => {
  optionDialog.value = usiEngines.value.getEngine(uri) as USIEngine;
};

const openMerge = () => {
  mergeDialog.value = true;
};

const duplicate = (uri: string) => {
  const src = usiEngines.value.getEngine(uri) as USIEngine;
  const engine = duplicateEngine(src);
  usiEngines.value.addEngine(engine);
  lastAdded.value = scrollTo = engine.uri;
};

const saveAndClose = async () => {
  try {
    busyState.retain();
    await api.saveUSIEngines(usiEngines.value as USIEngines);
    store.destroyModalDialog();
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const cancel = () => {
  store.closeModalDialog();
};

const optionOk = (engine: USIEngine) => {
  usiEngines.value.updateEngine(engine);
  optionDialog.value = null;
};

const optionCancel = () => {
  optionDialog.value = null;
};

const mergeOk = (engines: ImmutableUSIEngines) => {
  usiEngines.value = engines.getClone();
  mergeDialog.value = false;
};

const mergeCancel = () => {
  mergeDialog.value = false;
};
</script>

<style scoped>
.engine-list {
  width: 740px;
  height: calc(100vh - 280px);
  max-height: 600px;
  overflow: auto;
}
.engine-filter {
  margin: 0px 5px 5px 5px;
  text-align: left;
  align-items: center;
}
.filter-words {
  width: 200px;
}
.filter-tags {
  width: 540px;
  flex-wrap: wrap;
}
.filter-tag {
  font-size: 0.9em;
  margin: 2px 2px 2px 2px;
  padding: 0px 5px 0px 5px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 0.5em;
  box-shadow: 1px 1px 3px 0 var(--control-shadow-color);
  user-select: none;
}
.menu > *:not(:first-child) {
  margin-left: 5px;
}
.engine {
  margin: 0px 5px 0px 5px;
  padding: 5px;
  border-bottom: 1px solid gray;
}
.highlight {
  font-weight: bold;
}
.engine-name {
  text-align: left;
  width: 450px;
  margin-top: 5px;
  margin-right: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tags {
  width: 450px;
  flex-wrap: wrap;
}
.tag {
  font-size: 0.8em;
  line-height: 1.5;
  margin: 2px 5px 2px 0px;
  padding: 0px 8px 0px 8px;
  border-radius: 8px;
  color: white;
  user-select: none;
}
.tag.add {
  color: var(--pushed-selector-color);
  background-color: var(--pushed-selector-bg-color);
}
.tag .icon {
  width: 16px;
}
</style>
