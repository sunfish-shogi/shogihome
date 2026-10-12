<template>
  <dialog ref="dialog" class="piece-toss">
    <div class="area">
      <div
        v-for="(piece, index) of pieces"
        :key="index"
        class="piece"
        :style="{
          left: `${piece.x}%`,
          top: `${piece.y}%`,
          transform: `translate(-50%, -50%) rotate(${piece.tilt}deg)`,
        }"
      >
        <div
          class="flipper"
          :style="{
            transform: `rotateY(${spinning ? finalAngle(index) : 0}deg)`,
            transitionDuration: `${piece.duration}ms`,
          }"
        >
          <div class="face front" :style="{ backgroundImage: `url(${frontImage})` }" />
          <div class="face back" :style="{ backgroundImage: `url(${backImage})` }" />
        </div>
      </div>
    </div>
    <div class="result" :class="{ visible: resultVisible }">
      {{ result === Color.BLACK ? t.sente : t.gote }}
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { getPieceImageAssetName } from "@/common/assets/pieces";
import { getPieceImageURLTemplate } from "@/common/settings/app";
import { pieceTossResult } from "@/renderer/helpers/pieceToss";
import { useAppSettings } from "@/renderer/store/settings";
import { Color, PieceType } from "tsshogi";
import { computed, onBeforeUnmount, onMounted, PropType, ref } from "vue";

// 歩の配置。1 枚を中央に、4 枚をその周りに散らす。
// 規則的に見えないように位置と傾きをずらしているが、毎回同じ配置で構わないので固定値にする。
// x, y は円の中での歩の中心 (%)、tilt は傾き (度)。
// turns は回転数、duration は回転にかける時間 (ミリ秒) で、歩ごとに少しずつ変えて揃わないようにする。
const pieces = [
  { x: 50, y: 52, tilt: 8, turns: 6, duration: 2000 },
  { x: 27, y: 31, tilt: -27, turns: 5, duration: 1800 },
  { x: 71, y: 26, tilt: 41, turns: 7, duration: 2200 },
  { x: 76, y: 66, tilt: 163, turns: 6, duration: 1900 },
  { x: 31, y: 75, tilt: -118, turns: 5, duration: 2100 },
];

// 回転が止まってから結果を表示するまでの時間と、結果を表示してから終了するまでの時間。
const stillDuration = 1000;
const resultDuration = 1000;

const props = defineProps({
  // 各歩が表 (歩の面) を向くかどうか。
  faces: {
    type: Array as PropType<boolean[]>,
    required: true,
  },
});

const emit = defineEmits<{
  done: [];
}>();

const appSettings = useAppSettings();
const dialog = ref<HTMLDialogElement>();
const spinning = ref(false);
const resultVisible = ref(false);
const timers: ReturnType<typeof setTimeout>[] = [];
let frame = 0;

const pieceImage = (type: PieceType) =>
  getPieceImageURLTemplate(appSettings).replaceAll(
    "${piece}",
    getPieceImageAssetName(Color.BLACK, type),
  );
const frontImage = computed(() => pieceImage(PieceType.PAWN));
const backImage = computed(() => pieceImage(PieceType.PROM_PAWN));
const result = computed(() => pieceTossResult(props.faces));

// 回転を終えたときの角度。裏 (と) の場合は半回転を加える。
const finalAngle = (index: number) => pieces[index].turns * 360 + (props.faces[index] ? 0 : 180);

onMounted(() => {
  const element = dialog.value!;
  // 演出の途中で閉じることはできない。結果が決まっているので、そのまま対局を始める。
  element.addEventListener("cancel", (event) => event.preventDefault());
  element.showModal();
  // 初期状態を描画してから回転させないとトランジションが効かないため、2 フレーム待つ。
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      spinning.value = true;
      const spinDuration = Math.max(...pieces.map((piece) => piece.duration));
      timers.push(
        setTimeout(() => {
          resultVisible.value = true;
        }, spinDuration + stillDuration),
        setTimeout(() => emit("done"), spinDuration + stillDuration + resultDuration),
      );
    });
  });
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  timers.forEach(clearTimeout);
});
</script>

<style scoped>
dialog.piece-toss {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  margin: 0;
  padding: 0;
  border: none;
  background-color: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
dialog.piece-toss::backdrop {
  background-color: rgba(0, 0, 0, 0.5);
}
.area {
  position: relative;
  width: min(80vw, 60vh, 320px);
  height: min(80vw, 60vh, 320px);
  border-radius: 50%;
  background-color: var(--dialog-bg-color);
  border: 2px solid var(--dialog-border-color);
  box-sizing: border-box;
  overflow: hidden;
}
.piece {
  position: absolute;
  width: 22%;
  height: 22%;
  perspective: 600px;
}
.flipper {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.2, 0.6, 0.3, 1);
}
.face {
  position: absolute;
  inset: 0;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.face.back {
  transform: rotateY(180deg);
}
.result {
  min-width: 120px;
  padding: 8px 24px;
  border-radius: 10px;
  font-size: 32px;
  font-weight: bold;
  text-align: center;
  color: var(--info-dialog-color);
  background-color: var(--info-dialog-bg-color);
  opacity: 0;
  transition: opacity 0.3s;
}
.result.visible {
  opacity: 1;
}
</style>
