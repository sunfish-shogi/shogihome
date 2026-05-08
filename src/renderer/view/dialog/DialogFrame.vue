<template>
  <dialog ref="dialog">
    <div
      ref="frame"
      class="frame"
      :class="{ limited }"
      :style="frameStyle"
      @mousedown="onMouseDown"
    >
      <slot />
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

const dialog = ref<HTMLDialogElement>();
const frame = ref<HTMLElement>();

defineProps<{
  limited?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
}>();

const translate = reactive({ x: 0, y: 0 });
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let translateStartX = 0;
let translateStartY = 0;
let naturalRect = new DOMRect();
let dragCursorStyle: HTMLStyleElement | null = null;

const frameStyle = computed(() =>
  translate.x !== 0 || translate.y !== 0
    ? { transform: `translate(${translate.x}px, ${translate.y}px)` }
    : undefined,
);

function isInScrollableArea(target: EventTarget | null): boolean {
  const container = frame.value;
  if (!container) {
    return false;
  }
  let el = target as Element | null;
  while (el && el !== container) {
    const style = window.getComputedStyle(el);
    const overflow = style.overflow + style.overflowX + style.overflowY;
    if (
      /auto|scroll/.test(overflow) &&
      (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function isInteractiveElement(target: EventTarget | null): boolean {
  const container = frame.value;
  if (!container) {
    return false;
  }
  let el = target as Element | null;
  while (el && el !== container) {
    if (el instanceof Element && el.matches("button, input, select, textarea, a")) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function onMouseDown(event: MouseEvent): void {
  if (event.button !== 0) {
    return;
  }
  if (isInteractiveElement(event.target)) {
    return;
  }
  if (isInScrollableArea(event.target)) {
    return;
  }

  const currentRect = frame.value!.getBoundingClientRect();
  naturalRect = new DOMRect(
    currentRect.left - translate.x,
    currentRect.top - translate.y,
    currentRect.width,
    currentRect.height,
  );

  isDragging = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  translateStartX = translate.x;
  translateStartY = translate.y;

  dragCursorStyle = document.createElement("style");
  dragCursorStyle.textContent = "* { cursor: grabbing !important; user-select: none !important; }";
  document.head.appendChild(dragCursorStyle);

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

function onMouseMove(event: MouseEvent): void {
  if (!isDragging) {
    return;
  }

  let newX = translateStartX + (event.clientX - dragStartX);
  let newY = translateStartY + (event.clientY - dragStartY);

  const newLeft = naturalRect.left + newX;
  const newRight = naturalRect.right + newX;
  const newTop = naturalRect.top + newY;
  const newBottom = naturalRect.bottom + newY;

  if (newLeft < 0) {
    newX -= newLeft;
  } else if (newRight > window.innerWidth) {
    newX -= newRight - window.innerWidth;
  }
  if (newTop < 0) {
    newY -= newTop;
  } else if (newBottom > window.innerHeight) {
    newY -= newBottom - window.innerHeight;
  }

  translate.x = newX;
  translate.y = newY;
}

function onMouseUp(): void {
  isDragging = false;
  dragCursorStyle?.remove();
  dragCursorStyle = null;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
}

onMounted(() => {
  showModalDialog(dialog.value!, () => emit("cancel"));
  installHotKeyForDialog(dialog.value!);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value!);
  onMouseUp();
});
</script>

<style scoped>
dialog {
  width: calc(100vw - 3px - 2em);
  height: calc(100vh - 3px - 2em);
  border: none;
  box-shadow: none;
  background-color: transparent;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  scrollbar-gutter: stable;
}

.dialog-position-center dialog {
  align-items: center;
}
.dialog-position-left dialog {
  align-items: flex-start;
}
.dialog-position-right dialog {
  align-items: flex-end;
}

.frame {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background-color: var(--dialog-bg-color);
  border: 1px solid var(--dialog-border-color);
  border-radius: 10px 10px 10px 10px;
  padding: 15px;
}

.frame.limited {
  max-width: 100%;
  max-height: 100%;
}
</style>
