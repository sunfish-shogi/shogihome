<template>
  <div style="display: inline-block">
    <div class="row wrap">
      <select v-model="selected" size="1">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
        <option value="__FREE_TEXT__">{{ t.freeTextUnsafe }}</option>
      </select>
      <input v-show="selected === '__FREE_TEXT__'" v-model="freeInput" type="text" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { PropType, ref, watch } from "vue";

type Option = {
  value: string;
  label: string;
};

const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  options: {
    type: Array as PropType<Option[]>,
    required: true,
  },
});

const emit = defineEmits(["update:modelValue"]);

const selected = ref(
  props.options.some((option) => option.value === props.modelValue)
    ? props.modelValue
    : "__FREE_TEXT__",
);
const freeInput = ref(props.modelValue);

watch(selected, (newValue) => {
  emit("update:modelValue", newValue === "__FREE_TEXT__" ? freeInput.value : newValue);
});

watch(freeInput, (newValue) => {
  if (selected.value === "__FREE_TEXT__") {
    emit("update:modelValue", newValue);
  }
});

watch(
  () => props.modelValue,
  (newValue) => {
    if (
      (selected.value === "__FREE_TEXT__" && newValue === freeInput.value) ||
      newValue === selected.value
    ) {
      return;
    }
    if (props.options.some((option) => option.value === newValue)) {
      selected.value = newValue;
      freeInput.value ||= newValue;
    } else {
      selected.value = "__FREE_TEXT__";
      freeInput.value = newValue;
    }
  },
);
</script>

<style scoped>
select {
  margin-right: 4px;
}
input {
  width: 150px;
}
</style>
