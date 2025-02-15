<template>
  <div style="display: inline-block">
    <div class="container">
      <div class="toggle" :style="toggleStyle">
        <input :id="id" v-model="model" type="checkbox" />
        <div class="box" :style="boxStyle"><span v-if="value">✔</span></div>
      </div>
      <div>
        <label :for="id" :style="labelStyle">{{ label }}</label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { issueDOMID } from "@/renderer/helpers/unique";

const model = defineModel<boolean>("value", { required: true });

const props = defineProps({
  label: {
    type: String,
    default: "",
  },
  height: {
    type: Number,
    default: 20,
  },
});

const id = issueDOMID();
const toggleStyle = computed(() => ({
  height: `${props.height}px`,
  width: `${props.height}px`,
}));
const boxStyle = computed(() => ({
  fontSize: `${props.height * 0.7}px`,
}));
const labelStyle = computed(() => ({
  fontSize: `${props.height * 0.7}px`,
  lineHeight: `${props.height}px`,
}));
</script>

<style scoped>
div.container {
  display: flex;
  flex-direction: row;
  align-items: center;
}
div.toggle {
  position: relative;
}
input {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  opacity: 0;
}
input ~ .box {
  pointer-events: none;
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 1px solid var(--input-border-color);
  border-radius: 20%;
  color: var(--text-color);
  background-color: var(--text-bg-color);
}
label {
  margin-left: 5px;
  cursor: pointer;
  white-space: nowrap;
}
</style>
