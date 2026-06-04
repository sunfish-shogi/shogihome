<template>
  <div class="notification-overlay">
    <TransitionGroup name="notification" tag="div" class="notification-stack">
      <div
        v-for="entry in store.entries"
        :key="entry.id"
        class="notification-item"
        @click="store.dismiss(entry.id)"
      >
        <Icon :icon="IconType.INFO" class="icon" />
        <span class="message">{{ entry.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useNotificationStore } from "@/renderer/store/notification";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";

const store = useNotificationStore();
</script>

<style scoped>
.notification-overlay {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  pointer-events: none;
}

.notification-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.notification-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-width: 280px;
  max-width: 500px;
  padding: 10px 16px;
  border-radius: 8px;
  border: 2px solid var(--info-dialog-border-color);
  color: var(--info-dialog-color);
  background-color: var(--info-dialog-bg-color);
  box-shadow: 0 4px 12px var(--shadow-color);
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
}

.notification-item:hover {
  filter: brightness(1.1);
}

.notification-item .icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}

.notification-item .message {
  font-size: 0.95rem;
  line-height: 1.4;
  word-break: break-word;
}

.notification-enter-active,
.notification-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.notification-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.notification-move {
  transition: transform 0.25s ease;
}
</style>
