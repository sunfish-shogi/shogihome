<template>
  <div ref="root" class="root">
    <div class="main row" @click="show = !show">
      <div class="current item">{{ items.find((item) => item.value === value)?.label }}</div>
      <Icon :icon="IconType.ARROW_DROP" />
    </div>
    <div v-show="show" class="dropdown">
      <div class="row tags">
        <div
          v-for="tag of tags"
          :key="tag.name"
          class="tag"
          :style="tag.style"
          @click="
            () => (tagStates.has(tag.name) ? tagStates.delete(tag.name) : tagStates.add(tag.name))
          "
        >
          {{ tag.name }}
        </div>
      </div>
      <hr v-if="tags.length" />
      <ul>
        <li
          v-for="item of filteredItems"
          :key="item.value"
          class="item"
          @click="onSelect(item.value)"
        >
          {{ item.label }}
        </li>
      </ul>
      <div v-if="!filteredItems.length" class="not-found">Not Found</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconType } from "@/renderer/assets/icons";
import Icon from "./Icon.vue";
import { computed, onBeforeUnmount, onMounted, PropType, reactive, ref, watch } from "vue";

const props = defineProps({
  value: {
    type: String,
    required: true,
  },
  tags: {
    type: Array as PropType<{ name: string; color: string }[]>,
    required: true,
  },
  items: {
    type: Array as PropType<
      {
        label: string;
        value: string;
        tags?: string[];
      }[]
    >,
    required: true,
  },
  defaultTags: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
});
const emit = defineEmits<{
  "update:value": [value: string];
}>();

const root = ref<HTMLElement | null>();
const show = ref(false);
const tagStates = reactive(new Set<string>());

const tags = computed(() => {
  return props.tags.map((tag) => {
    const selected = tagStates.has(tag.name);
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

const filteredItems = computed(() => {
  const wants = props.tags.filter((tags) => tagStates.has(tags.name)).map((tag) => tag.name);
  if (wants.length === 0) {
    return props.items;
  }
  return props.items.filter((item) => {
    const tags = new Set(item.tags || []);
    for (const tag of wants) {
      if (!tags.has(tag)) {
        return false;
      }
    }
    return true;
  });
});

const handleClickOutside = (event: Event) => {
  if (!root.value?.contains(event.target as Node)) {
    show.value = false;
  }
};

const onSelect = (value: string) => {
  emit("update:value", value);
  show.value = false;
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
  watch(
    () => props.defaultTags,
    (defaultTags) => {
      tagStates.clear();
      for (const tag of defaultTags) {
        tagStates.add(tag);
      }
    },
    { immediate: true, deep: true },
  );
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<style scoped>
.root {
  position: relative;
  font-size: 0.9em;
}
.main {
  width: 100%;
  height: 1.6em;
  box-sizing: border-box;
  border: 1px solid var(--input-border-color);
}
.main > .current {
  width: 100%;
}
.main > .icon {
  width: auto;
  height: 100%;
  background-color: gray;
}
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  background-color: var(--text-bg-color);
  border: 1px solid var(--input-border-color);
  box-shadow: 1px 4px 8px 0 var(--control-shadow-color);
  z-index: 1000;
}
.item {
  line-height: 1.5;
  padding-left: 0.2em;
  color: var(--text-color);
  background-color: var(--text-bg-color);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  user-select: none;
}
ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
li:hover {
  background-color: var(--text-bg-color-selected);
}
.tags {
  width: 100%;
  padding-left: 2px;
  flex-wrap: wrap;
}
.tag {
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
hr {
  margin: 0.2em;
}
.not-found {
  padding: 0.2em;
  color: var(--text-color);
  background-color: var(--text-bg-color);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  user-select: none;
}
</style>
