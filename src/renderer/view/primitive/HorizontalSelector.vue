<template>
  <div style="display: inline-block">
    <div ref="container" :class="['row', 'wrap', 'container', { tab: tab }]">
      <div v-for="item of items" :key="item.value" class="item">
        <input
          type="radio"
          :name="name"
          :checked="item.value === value"
          :value="item.value"
          :title="item.icon ? item.label : undefined"
          :aria-label="item.label"
          @change="emit('update:value', item.value)"
        />
        <div class="button" :style="buttonStyle(item)">
          <div v-if="item.icon" class="symbol" :style="symbolStyle(item.icon)" />
          <div v-else class="label">{{ item.label }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconType, iconSourceMap } from "@/renderer/assets/icons";
import { issueDOMID } from "@/renderer/helpers/unique";
import { PropType, Ref, ref } from "vue";

type Item = {
  label: string;
  // アイコンを指定した場合はラベルの代わりにアイコンを表示する。
  icon?: IconType;
  value: string;
};

const props = defineProps({
  value: {
    type: String,
    required: true,
  },
  items: {
    type: Array as PropType<Item[]>,
    required: true,
  },
  height: {
    type: Number,
    default: 28,
  },
  tab: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits<{
  "update:value": [value: string];
}>();

const container = ref() as Ref<HTMLDivElement>;
const name = issueDOMID();
const buttonStyle = (item: Item) => {
  const r = `${props.height * 0.25}px`;
  return {
    height: `${props.height}px`,
    minWidth: `${props.height * (item.icon ? 1.6 : 2.5)}px`,
    fontSize: `${props.height * 0.5}px`,
    borderRadius: props.tab ? `${r} ${r} 0 0` : r,
    paddingLeft: r,
    paddingRight: r,
  };
};
const symbolStyle = (icon: IconType) => {
  const size = `${props.height * 0.7}px`;
  const source = `url(${iconSourceMap[icon]})`;
  return {
    width: size,
    height: size,
    "-webkit-mask-image": source,
    "mask-image": source,
  };
};

const setValue = (value: string) => {
  for (const input of container.value.querySelectorAll("input")) {
    if (input.value === value) {
      input.checked = true;
      emit("update:value", value);
      break;
    }
  }
};
const getValue = () => {
  const checked = Array.from(container.value.querySelectorAll("input")).find((input) => {
    if (input.checked) {
      return input.value;
    }
  });
  return checked ? checked.value : props.value;
};
defineExpose({ setValue, getValue });
</script>

<style scoped>
div.container {
  align-items: center;
}
div.item {
  position: relative;
  margin-top: 1px;
  margin-bottom: 1px;
}
div.item:not(:last-child) {
  margin-right: 2px;
}
div.container.tab {
  align-items: flex-end;
  flex-wrap: wrap-reverse;
}
div.container.tab div.item {
  margin-bottom: 0;
}
div.container.tab input:checked ~ .button {
  border-bottom-color: transparent;
}
input {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
}
.button {
  pointer-events: none;
  left: 0;
  top: 0;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  border: 2px solid var(--selector-bg-color);
  color: var(--selector-color);
  background-color: var(--selector-bg-color);
  box-shadow: 1px 1px 3px 0 var(--control-shadow-color);
}
.tab .button {
  box-shadow: 1px 0px 2px 0 var(--control-shadow-color);
}
input:checked ~ .button {
  color: var(--pushed-selector-color);
  border: 2px solid var(--pushed-selector-bg-color);
  background-color: var(--pushed-selector-bg-color);
}
input:focus ~ .button {
  border: 2px solid white;
}
.label {
  pointer-events: none;
  text-align: center;
  width: 100%;
}
/* アイコンは mask で描画してボタンの文字色を継承させる。 */
.symbol {
  pointer-events: none;
  margin-left: auto;
  margin-right: auto;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}
</style>
