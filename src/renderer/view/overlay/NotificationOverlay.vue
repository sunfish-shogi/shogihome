<template>
  <div class="notification-overlay">
    <TransitionGroup name="notification" tag="div" class="notification-stack">
      <div v-for="entry in store.entries" :key="entry.id" class="notification-item">
        <Icon :icon="IconType.INFO" class="icon" />
        <button
          v-if="entry.url"
          class="message message-link"
          @click="api.openWebBrowser(entry.url!)"
        >
          {{ entry.message }}
        </button>
        <span v-else class="message">{{ entry.message }}</span>
        <button class="close-button" @click="store.dismiss(entry.id)">
          <Icon :icon="IconType.CLOSE" class="close-icon" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useNotificationStore } from "@/renderer/store/notification";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import api from "@/renderer/ipc/api";

const store = useNotificationStore();
</script>

<style scoped>
.notification-overlay {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999999;
  pointer-events: none;
  max-width: calc(100vw - 32px);
  width: max-content;
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
  min-width: min(280px, 100%);
  max-width: 100%;
  padding: 10px 10px 10px 16px;
  border-radius: 8px;
  border: 2px solid var(--info-dialog-border-color);
  color: var(--info-dialog-color);
  background-color: var(--info-dialog-bg-color);
  box-shadow: 0 4px 12px var(--shadow-color);
  pointer-events: auto;
  user-select: none;
}

.notification-item .icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}

.notification-item .message {
  flex: 1;
  font-size: 0.95rem;
  line-height: 1.4;
  word-break: break-word;
}

.message-link {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.message-link:hover {
  filter: brightness(1.15);
}

.close-button {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--info-dialog-color);
  cursor: pointer;
  opacity: 0.7;
}

.close-button:hover {
  opacity: 1;
  filter: brightness(1.2);
}

.close-button .close-icon {
  width: 18px;
  height: 18px;
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
