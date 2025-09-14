<template>
  <div class="full column">
    <RecordTreeView class="auto" :record="store.record" />
    <button @click="onSwitchToListView">
      <Icon :icon="IconType.NUMBER_LIST" />
      リスト表示
    </button>
  </div>
</template>

<script setup lang="ts">
import RecordTreeView from "@/renderer/view/primitive/RecordTreeView.vue";
import { RecordViewType } from "@/common/settings/app";
import { useAppSettings } from "@/renderer/store/settings";
import { IconType } from "@/renderer/assets/icons";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { useStore } from "@/renderer/store";

const store = useStore();

const onSwitchToListView = () => {
  useAppSettings().updateAppSettings({
    recordViewType: RecordViewType.LIST,
  });
};
</script>

<style scoped>
button {
  margin: 0;
  height: 26px;
  vertical-align: middle;
}
button .icon {
  height: 1.6em;
  line-height: 24px;
}
</style>
