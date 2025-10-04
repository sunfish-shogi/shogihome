<template>
  <div>
    <div class="container">
      <button class="thin select" @click="select">{{ t.select }}</button>
      <img v-if="url" ref="preview" class="preview" :src="fileURLToCustomSchemeURL(url)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, toRef } from "vue";
import { t } from "@/common/i18n";
import api from "@/renderer/ipc/api";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { fileURLToCustomSchemeURL } from "@/common/url";

const props = defineProps({
  defaultUrl: {
    type: String,
    default: "",
  },
});

const emit = defineEmits<{
  select: [url: string];
}>();

const busyState = useBusyState();
const url = ref(toRef(() => props.defaultUrl).value);

onMounted(() => {
  url.value = props.defaultUrl;
});

const select = async () => {
  busyState.retain();
  try {
    const newURL = await api.showSelectImageDialog(url.value);
    if (newURL) {
      url.value = newURL;
      emit("select", newURL);
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
}
button.select {
  display: inline-block;
  margin: 0;
  width: 100%;
}
.preview {
  display: inline-block;
  max-width: 100%;
  height: auto;
}
</style>
