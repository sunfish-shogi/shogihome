import { computed, onBeforeUnmount, reactive, Ref } from "vue";

export function useDraggableDialog(containerRef: Ref<HTMLElement | undefined>) {
  const translate = reactive({ x: 0, y: 0 });
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let translateStartX = 0;
  let translateStartY = 0;
  let naturalRect = new DOMRect();
  let dragCursorStyle: HTMLStyleElement | null = null;

  const dragStyle = computed(() =>
    translate.x !== 0 || translate.y !== 0
      ? { transform: `translate(${translate.x}px, ${translate.y}px)` }
      : undefined,
  );

  function isInScrollableArea(target: EventTarget | null): boolean {
    const container = containerRef.value;
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
    const container = containerRef.value;
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

  function onDragMouseDown(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (isInteractiveElement(event.target)) {
      return;
    }
    if (isInScrollableArea(event.target)) {
      return;
    }

    const container = containerRef.value;
    if (!container) {
      return;
    }

    const currentRect = container.getBoundingClientRect();
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
    dragCursorStyle.textContent =
      "* { cursor: grabbing !important; user-select: none !important; }";
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

    const newRight = naturalRect.right + newX;
    const newBottom = naturalRect.bottom + newY;

    if (newRight > window.innerWidth) {
      newX -= newRight - window.innerWidth;
    }
    if (naturalRect.left + newX < 0) {
      newX = -naturalRect.left;
    }
    if (newBottom > window.innerHeight) {
      newY -= newBottom - window.innerHeight;
    }
    if (naturalRect.top + newY < 0) {
      newY = -naturalRect.top;
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

  function clampTranslate(): void {
    const container = containerRef.value;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    let dx = 0;
    if (rect.right > window.innerWidth) {
      dx -= rect.right - window.innerWidth;
    }
    if (rect.left + dx < 0) {
      dx = -rect.left;
    }
    translate.x += dx;

    let dy = 0;
    if (rect.bottom > window.innerHeight) {
      dy -= rect.bottom - window.innerHeight;
    }
    if (rect.top + dy < 0) {
      dy = -rect.top;
    }
    translate.y += dy;
  }

  window.addEventListener("resize", clampTranslate);

  onBeforeUnmount(() => {
    onMouseUp();
    window.removeEventListener("resize", clampTranslate);
  });

  return { dragStyle, onDragMouseDown };
}
