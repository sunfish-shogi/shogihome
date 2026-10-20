<template>
  <DialogFrame @cancel="emit('cancel')">
    <div class="title">{{ t.engineDownload }}</div>
    <div class="form-group">
      <div class="package-name">{{ pkg.name }} ({{ pkg.version }})</div>
      <div class="notice-line">{{ t.downloadSize }}: {{ formatBytes(packageSize) }}</div>
      <div class="column licenses">
        <div v-for="(license, i) of licenses" :key="i" class="license">
          <div class="row license-header">
            <span>{{ license.subject }} ({{ license.spdx }})</span>
            <a v-if="license.source" class="source" @click="api.openWebBrowser(license.source)">
              {{ t.sourceCodeURL }}
            </a>
          </div>
          <pre class="license-text">{{ license.text }}</pre>
        </div>
      </div>
    </div>
    <div class="main-buttons">
      <button @click="emit('agree')">{{ t.agreeAndDownload }}</button>
      <button data-hotkey="Escape" @click="emit('cancel')">{{ t.cancel }}</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import api from "@/renderer/ipc/api";
import {
  EnginePackage,
  EnginePackageLicense,
  getEnginePackageSize,
} from "@/common/wasm-engine/package";
import { formatBytes } from "@/renderer/helpers/enginePackage";
import { computed } from "vue";
import DialogFrame from "./DialogFrame.vue";

const props = defineProps<{
  pkg: EnginePackage;
  licenses: EnginePackageLicense[];
}>();

const emit = defineEmits<{
  agree: [];
  cancel: [];
}>();

const packageSize = computed(() => getEnginePackageSize(props.pkg.files));
</script>

<style scoped>
.package-name {
  font-weight: bold;
  text-align: left;
}
.notice-line {
  text-align: left;
}
.licenses {
  width: 640px;
  height: calc(100vh - 360px);
  max-height: 400px;
  overflow: auto;
  margin-top: 5px;
}
.license-header {
  justify-content: space-between;
  margin-top: 5px;
}
.source {
  cursor: pointer;
  text-decoration: underline;
}
.license-text {
  text-align: left;
  font-size: 0.8em;
  white-space: pre-wrap;
  user-select: text;
}
</style>
