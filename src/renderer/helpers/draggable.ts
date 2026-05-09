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

  onBeforeUnmount(() => {
    onMouseUp();
  });

  return { dragStyle, onDragMouseDown };
}
