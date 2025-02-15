<template>
  <div style="display: inline-block">
    <div class="container">
      <div class="toggle" :style="toggleStyle">
        <input :id="id" v-model="model" type="checkbox" />
        <div class="slider" :style="sliderStyle"></div>
        <div class="knob" :style="knobStyle"></div>
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
  width: `${props.height * 2}px`,
}));
const sliderStyle = computed(() => ({
  borderRadius: `${props.height * 0.5}px`,
}));
const knobStyle = computed(() => ({
  height: `${props.height}px`,
  width: `${props.height}px`,
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
input ~ .slider {
  pointer-events: none;
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background-color: var(--toggle-inactive-color);
  box-shadow: 1px 1px 3px 0 var(--control-shadow-color);
}
input ~ .knob {
  pointer-events: none;
  position: absolute;
  border-radius: 100%;
  left: 0;
  top: 0;
  background: var(--toggle-knob-color);
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.4);
  transition: 0.2s;
}
input:checked ~ .slider {
  background-color: var(--toggle-active-color);
}
input:checked ~ .knob {
  left: 50%;
}
input:focus ~ .slider {
  border: 1px solid white;
}
label {
  margin-left: 5px;
  cursor: pointer;
  white-space: nowrap;
}
</style>
