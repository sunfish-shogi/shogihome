<template>
  <div class="root">
    <div class="bar" :style="{ width: `${Math.min((value / max) * 100, 100)}%` }"></div>
    <span>
      {{
        `${value.toFixed(0)}${unit} / ${max.toFixed(0)}${unit} (${((value / max) * 100).toFixed(1)}%)`
      }}
    </span>
  </div>
</template>

<script lang="ts" setup>
defineProps({
  value: { type: Number, required: true },
  max: { type: Number, required: true },
  unit: { type: String, default: "" },
});
</script>

<style scoped>
.root {
  position: relative;
  height: 18px;
  background-color: var(--text-bg-color);
}
.root .bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background-color: var(--text-bg-color-selected);
  z-index: 0;
}
.root span {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
  line-height: 18px;
  color: var(--text-color);
  font-size: 10px;
  font-weight: bold;
}
</style>
