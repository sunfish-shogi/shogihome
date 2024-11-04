<template>
  <div class="full">
    <!-- NOTE: 背景だけを透過させるために背景専用の要素を作る。 -->
    <div class="background" :style="{ opacity }"></div>
    <div class="full"></div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  opacity: {
    type: Number,
    required: false,
    default: 1.0,
  },
});
</script>

<style scoped>
.background {
  position: absolute;
  z-index: -1;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--text-bg-color);
}
</style>
