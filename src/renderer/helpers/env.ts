export const isIOS = () => {
  const isOldiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isNewiPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isOldiOS || isNewiPadOS;
};
