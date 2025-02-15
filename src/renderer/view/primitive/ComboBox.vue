<template>
  <div style="display: inline-block">
    <div class="row wrap">
      <select
        size="1"
        :value="selectValue"
        @change="
          (event) => {
            const value = (event.target as HTMLSelectElement).value;
            emit('update:modelValue', value === '__FREE_TEXT__' ? input.value : value);
          }
        "
      >
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
        <option value="__FREE_TEXT__">{{ freeTextLabel }}</option>
      </select>
      <input v-show="free" ref="input" type="text" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, PropType, Ref, ref } from "vue";

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
  freeTextLabel: {
    type: String,
    default: "自由入力",
  },
});

const emit = defineEmits(["update:modelValue"]);

const selectValue = computed(() =>
  props.options.some((option) => option.value === props.modelValue)
    ? props.modelValue
    : "__FREE_TEXT__",
);
const free = ref(selectValue.value === "__FREE_TEXT__");
const input = ref() as Ref<HTMLInputElement>;
</script>

<style scoped>
select {
  margin-right: 4px;
}
input {
  width: 150px;
}
</style>
