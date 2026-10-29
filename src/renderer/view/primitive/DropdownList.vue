<template>
  <div ref="root" class="root" data-no-dialog-drag>
    <div class="main row" @click="show = !show">
      <div class="current item" :class="{ 'with-banner': current?.banners?.length }">
        <div v-if="current?.banners?.length" class="banner">
          <img
            v-for="banner of current.banners"
            :key="banner"
            :src="banner"
            alt=""
            draggable="false"
          />
          <span class="banner-fill">
            <span :style="bannerFillStyle(current.banners)" />
          </span>
        </div>
        <span class="label">{{ current?.label }}</span>
        <span v-if="current?.badge" class="badge">{{ current.badge }}</span>
      </div>
      <div class="arrow">
        <Icon :icon="IconType.ARROW_DROP" />
      </div>
    </div>
    <div v-show="show" class="dropdown">
      <div class="row tags">
        <div
          v-for="tag of tags"
          :key="tag.name"
          class="tag"
          :style="tag.style"
          @click="
            () => (tagStates.has(tag.name) ? tagStates.delete(tag.name) : tagStates.add(tag.name))
          "
        >
          {{ tag.name }}
        </div>
      </div>
      <ul>
        <li
          v-for="item of filteredItems"
          :key="item.value"
          class="item"
          :class="{ 'with-banner': item.banners?.length }"
          @click="onSelect(item.value)"
        >
          <div v-if="item.banners?.length" class="banner">
            <img
              v-for="banner of item.banners"
              :key="banner"
              :src="banner"
              alt=""
              draggable="false"
            />
            <span class="banner-fill">
              <span :style="bannerFillStyle(item.banners)" />
            </span>
          </div>
          <span class="label">{{ item.label }}</span>
          <span v-if="item.badge" class="badge">{{ item.badge }}</span>
        </li>
      </ul>
      <div v-if="!filteredItems.length" class="not-found">Not Found</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconType } from "@/renderer/assets/icons";
import Icon from "./Icon.vue";
import { computed, onBeforeUnmount, onMounted, PropType, reactive, ref, watch } from "vue";

const props = defineProps({
  value: {
    type: String,
    required: true,
  },
  tags: {
    type: Array as PropType<{ name: string; color: string }[]>,
    required: true,
  },
  items: {
    type: Array as PropType<
      {
        label: string;
        value: string;
        tags?: string[];
        // 名前の横に小さく添える目印。短い文字列を想定し、省略せず常に全文を表示する。
        badge?: string;
        // 項目の背景に表示するバナー画像の URL。複数ある場合は左から順に横に並べる。
        banners?: string[];
      }[]
    >,
    required: true,
  },
  defaultTags: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
});
const emit = defineEmits<{
  "update:value": [value: string];
}>();

const root = ref<HTMLElement | null>();
const show = ref(false);
const tagStates = reactive(new Set<string>());

const current = computed(() => props.items.find((item) => item.value === props.value));

const tags = computed(() => {
  return props.tags.map((tag) => {
    const selected = tagStates.has(tag.name);
    const backgroundColor = selected ? tag.color : "#eee";
    return {
      name: tag.name,
      style: {
        color: selected ? "white" : "black",
        backgroundColor,
        borderColor: backgroundColor,
      },
    };
  });
});

const filteredItems = computed(() => {
  const wants = props.tags.filter((tags) => tagStates.has(tags.name)).map((tag) => tag.name);
  if (wants.length === 0) {
    return props.items;
  }
  return props.items.filter((item) => {
    const tags = new Set(item.tags || []);
    for (const tag of wants) {
      if (!tags.has(tag)) {
        return false;
      }
    }
    return true;
  });
});

const handleClickOutside = (event: Event) => {
  if (!root.value?.contains(event.target as Node)) {
    show.value = false;
  }
};

// 右側の空間は最後 (右端) の画像から塗る。
const bannerFillStyle = (banners: string[]) => ({
  borderImageSource: `url(${JSON.stringify(banners[banners.length - 1])})`,
});

const onSelect = (value: string) => {
  emit("update:value", value);
  show.value = false;
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
  watch(
    () => props.defaultTags,
    (defaultTags) => {
      tagStates.clear();
      for (const tag of defaultTags) {
        tagStates.add(tag);
      }
    },
    { immediate: true, deep: true },
  );
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<style scoped>
.root {
  position: relative;
  font-size: 0.9em;
}
.root {
  /* バナー画像の有無に関わらず項目の縦幅を揃える。 */
  --item-height: 4em;
}
.main {
  width: 100%;
  height: calc(var(--item-height) + 2px);
  box-sizing: border-box;
  border: 1px solid var(--input-border-color);
}
.main > .current {
  width: 100%;
  min-width: 0;
}
/* アイコンの大きさは項目の縦幅に関わらず一定にし、背景の領域だけを縦に伸ばす。 */
.main > .arrow {
  flex-shrink: 0;
  height: 100%;
  display: flex;
  align-items: center;
  background-color: gray;
}
.main > .arrow > .icon {
  width: auto;
  height: calc(1.6em - 2px);
}
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  background-color: var(--text-bg-color);
  border: 1px solid var(--input-border-color);
  box-shadow: 1px 4px 8px 0 var(--control-shadow-color);
  z-index: 1000;
}
.item {
  line-height: 1.5;
  padding-left: 0.2em;
  color: var(--text-color);
  background-color: var(--text-bg-color);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  user-select: none;
}
.item {
  display: flex;
  align-items: baseline;
}
.item > .label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 幅が足りない場合は名前の側を省略し、badge は常に全文を右寄せで表示する。 */
.item > .badge {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 0.5em;
  padding-right: 0.5em;
  font-size: 0.8em;
  opacity: 0.7;
}
.item {
  height: var(--item-height);
  box-sizing: border-box;
  align-items: center;
}
/*
 * バナー画像は項目の背景として余白なしで表示する。
 * 画像は縦幅に合わせて拡大・縮小し、横幅はアスペクト比に従う。
 * 複数の画像は左から順に隙間なく並べ、項目の幅に収まらない部分は切り落とす。
 * 透過のある画像の背後にはメイン画面の背景色を敷く。
 */
.item > .banner {
  position: absolute;
  inset: 0;
  overflow: hidden;
  display: flex;
  background-color: var(--dialog-bg-color);
}
.item > .banner > img {
  flex-shrink: 0;
  height: 100%;
  width: auto;
}
/*
 * 画像の右側の空間は、画像の右端から一定の幅の帯を左右反転して引き伸ばし、ぼかしたもので塗る。
 * 反転することで画像と接する位置には右端の色が来るため、境目が目立たない。
 * border-image で帯だけを切り出し、要素の幅いっぱいの右ボーダーとして描画する。
 * ぼかすと縁から 3 倍程度の幅が透けるため、内側の要素を上下左右にはみ出させて、
 * 外側の要素で切り落とす。画像の下には重ねない (半透明の画像の色が変わるため)。
 */
.item > .banner > .banner-fill {
  position: relative;
  flex-grow: 1;
  min-width: 0;
  overflow: hidden;
}
.item > .banner > .banner-fill > span {
  position: absolute;
  inset: -45px;
  border-style: solid;
  border-width: 0;
  border-image-slice: 0 10% 0 0;
  border-image-width: 0 100% 0 0;
  border-image-repeat: stretch;
  transform: scaleX(-1);
  filter: blur(14px);
}
/* バナー画像がある場合は余白なしで項目いっぱいに表示し、名前をカラーテーマによらず白文字・黒縁取りで画像の左下に重ねる。 */
.item.with-banner {
  position: relative;
  padding-left: 0;
}
.item.with-banner > .badge {
  position: relative;
  color: white;
  font-weight: bold;
  -webkit-text-stroke: 0.24em dimgray;
  paint-order: stroke fill;
}
/*
 * 名前は絶対配置にせず、項目の中で通常どおり並べて下端に寄せる。
 * badge の手前までの幅に収まらない場合は名前の側を省略する。
 */
.item.with-banner > .label {
  position: relative;
  align-self: flex-end;
  margin-left: 0.5em;
  padding: 0.1em;
  font-size: 0.9em;
  line-height: 1.2;
  color: white;
  font-weight: bold;
  -webkit-text-stroke: 0.2em dimgray;
  paint-order: stroke fill;
}
ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
li:hover {
  background-color: var(--text-bg-color-selected);
}
li:hover > .banner {
  filter: brightness(1.05);
}
.tags {
  width: 100%;
  padding-left: 2px;
  flex-wrap: wrap;
}
.tag {
  font-size: 0.9em;
  margin: 2px 2px 2px 2px;
  padding: 0px 5px 0px 5px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 0.5em;
  box-shadow: 1px 1px 3px 0 var(--control-shadow-color);
  user-select: none;
}
.not-found {
  padding: 0.2em;
  color: var(--text-color);
  background-color: var(--text-bg-color);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  user-select: none;
}
</style>
