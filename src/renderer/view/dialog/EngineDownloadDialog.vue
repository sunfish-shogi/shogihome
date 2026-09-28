<template>
  <DialogFrame @cancel="close">
    <div class="title">{{ t.engineDownload }}</div>

    <!-- ダウンロード前のライセンスの確認 -->
    <div v-if="confirmation" class="form-group">
      <div class="package-name">{{ confirmation.pkg.name }} ({{ confirmation.pkg.version }})</div>
      <div class="notice-line">
        {{ t.downloadSize }}: {{ formatBytes(getEnginePackageSize(confirmation.pkg.files)) }}
      </div>
      <div class="column licenses">
        <div v-for="(license, i) of confirmation.licenses" :key="i" class="license">
          <div class="row license-header">
            <span>{{ license.subject }} ({{ license.spdx }})</span>
            <a v-if="license.source" class="source" @click="api.openWebBrowser(license.source)">
              {{ t.sourceCodeURL }}
            </a>
          </div>
          <pre class="license-text">{{ license.text }}</pre>
        </div>
      </div>
      <div class="main-buttons">
        <button @click="startInstall(confirmation.pkg)">{{ t.agreeAndDownload }}</button>
        <button data-hotkey="Escape" @click="confirmation = null">{{ t.cancel }}</button>
      </div>
    </div>

    <div v-else>
      <div>
        <HorizontalSelector
          v-model:value="activeTab"
          :items="[
            { value: 'available', label: t.availableEngines },
            { value: 'installed', label: t.installedEngines },
          ]"
        />
      </div>
      <div class="form-group package-list">
        <!-- 入手可能 -->
        <template v-if="activeTab === 'available'">
          <div v-if="index && index.engines.length === 0" class="package">
            {{ t.noDownloadableEngine }}
          </div>
          <div v-for="row of availableRows" :key="row.pkg.id" class="row package">
            <div class="column package-info">
              <div class="package-name">{{ row.pkg.name }}</div>
              <div class="package-detail">
                {{ row.pkg.author }}
                / {{ row.pkg.licenses.join(", ") }} /
                {{ formatBytes(getEnginePackageSize(row.pkg.files)) }}
              </div>
              <div v-if="row.pkg.description" class="package-detail">
                {{ row.pkg.description }}
              </div>
              <div class="package-status">
                <template v-if="installing[row.pkg.id]">
                  <progress :value="progressRatio(row.pkg.id)" max="1" />
                  {{ progressText(row.pkg.id) }}
                </template>
                <template v-else>{{ row.status }}</template>
              </div>
            </div>
            <div class="column space-evenly">
              <button
                v-if="installing[row.pkg.id]"
                class="package-action"
                @click="cancelInstall(row.pkg.id)"
              >
                {{ t.cancel }}
              </button>
              <button
                v-else
                class="package-action"
                :disabled="isInstalling"
                @click="confirmInstall(row.pkg)"
              >
                {{ row.action }}
              </button>
            </div>
          </div>
        </template>

        <!-- インストール済み -->
        <template v-else>
          <div v-if="installed.length === 0" class="package">{{ t.noInstalledEngine }}</div>
          <div v-for="pkg of installed" :key="pkg.enginePath" class="row package">
            <div class="column package-info">
              <div class="package-name">{{ pkg.name }} ({{ pkg.version }})</div>
              <div class="package-detail">
                {{ pkg.author }}
                / {{ formatBytes(getEnginePackageSize(pkg.files)) }}
              </div>
              <div class="package-status">
                {{ pkg.broken ? t.needsRepair : isUsed(pkg) ? t.inUse : t.unused }}
              </div>
            </div>
            <div class="column space-evenly">
              <button
                class="package-action"
                :disabled="isInstalling || isUsed(pkg)"
                @click="confirmUninstall(pkg)"
              >
                {{ t.uninstall }}
              </button>
            </div>
          </div>
        </template>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Escape" :disabled="isInstalling" @click="close">
          {{ t.close }}
        </button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import api from "@/renderer/ipc/api";
import { ImmutableUSIEngines, USIEngine, USIEngines } from "@/common/settings/usi";
import {
  EngineIndex,
  EnginePackage,
  EnginePackageLicense,
  getEnginePackageSize,
  InstalledEnginePackageInfo,
  isEnginePackageInstallCanceled,
} from "@/common/wasm-engine/package";
import { useAppSettings } from "@/renderer/store/settings";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { useConfirmationStore } from "@/renderer/store/confirm";
import { useMessageStore } from "@/renderer/store/message";
import { useEnginePackageStore } from "@/renderer/store/engine_package";
import { planEngineListChange } from "@/renderer/helpers/enginePackage";
import { computed, onMounted, reactive, ref } from "vue";
import DialogFrame from "./DialogFrame.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";

const props = defineProps<{
  // エンジン管理画面で編集中の一覧。保存前の変更を含む。
  engines: ImmutableUSIEngines;
}>();

const emit = defineEmits<{
  // 新しく一覧へ追加するエンジン。
  installed: [engines: USIEngine[]];
  // 更新で置き換わったパッケージ。これを参照する項目の path を新しい版へ向ける。
  // 新しい版から取得したエンジンの定義も渡す。
  updated: [oldEnginePaths: string[], newEngine: USIEngine];
  close: [];
}>();

const busyState = useBusyState();
const packageStore = useEnginePackageStore();
const activeTab = ref("available");
const index = ref<EngineIndex | null>(null);
const installed = ref<InstalledEnginePackageInfo[]>([]);
// 保存済みの一覧。エンジン管理画面でキャンセルされても参照が残るため、使用中の判定に含める。
const savedEngines = ref<ImmutableUSIEngines>(new USIEngines());
const installing = reactive<{ [id: string]: boolean }>({});
const confirmation = ref<{ pkg: EnginePackage; licenses: EnginePackageLicense[] } | null>(null);

const isInstalling = computed(() => Object.values(installing).some((value) => value));

const reloadInstalled = async () => {
  installed.value = await api.listInstalledEnginePackages();
};

onMounted(async () => {
  busyState.retain();
  try {
    savedEngines.value = await api.loadUSIEngines();
    await reloadInstalled();
    // 一覧はアプリに同梱している (オンラインでは取得しない)。
    index.value = await api.getEngineIndex();
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
});

// 編集中の一覧と保存済みの一覧のどちらかが参照しているかどうか。アンインストールの可否に使う。
// エンジン管理画面がキャンセルされると保存済みの一覧が残るため、両方を見る。
const isUsed = (pkg: InstalledEnginePackageInfo) => {
  return [props.engines, savedEngines.value].some((engines) =>
    engines.engineList.some((engine) => engine.path === pkg.enginePath),
  );
};

const availableRows = computed(() => {
  return (index.value?.engines || []).map((pkg) => {
    const same = installed.value.find((p) => p.id === pkg.id && p.version === pkg.version);
    const others = installed.value.filter((p) => p.id === pkg.id && p.version !== pkg.version);
    if (same) {
      return {
        pkg,
        status: same.broken ? t.needsRepair : t.installedEngines,
        action: t.reinstall,
      };
    }
    if (others.length) {
      return { pkg, status: t.updateAvailable, action: t.update };
    }
    return { pkg, status: t.notInstalled, action: t.install };
  });
});

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const progressRatio = (id: string) => {
  const progress = packageStore.getProgress(id);
  return progress && progress.totalBytes ? progress.receivedBytes / progress.totalBytes : 0;
};

const progressText = (id: string) => {
  const progress = packageStore.getProgress(id);
  if (!progress) {
    return "";
  }
  return `${formatBytes(progress.receivedBytes)} / ${formatBytes(progress.totalBytes)}`;
};

const confirmInstall = async (pkg: EnginePackage) => {
  busyState.retain();
  try {
    const licenses = await api.fetchEnginePackageLicenses(pkg.id);
    confirmation.value = { pkg, licenses };
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const startInstall = async (pkg: EnginePackage) => {
  confirmation.value = null;
  // 同じ id の他の版。更新ではこれを参照している項目を新しい版へ向ける。
  const otherVersionEnginePaths = installed.value
    .filter((p) => p.id === pkg.id && p.version !== pkg.version)
    .map((p) => p.enginePath);
  installing[pkg.id] = true;
  try {
    const timeoutSeconds = useAppSettings().engineTimeoutSeconds;
    const result = await api.installEnginePackage(pkg.id, timeoutSeconds);
    const newEnginePath = result.installed.enginePath;
    // 編集中の一覧だけで判定する (helpers/enginePackage.ts を参照)。
    const change = planEngineListChange(
      props.engines.engineList.map((engine) => engine.path),
      newEnginePath,
      otherVersionEnginePaths,
    );
    switch (change.type) {
      case "update":
        emit("updated", change.oldEnginePaths, result.engines[0]);
        useMessageStore().enqueue({ text: t.enginesUpdatedPleaseSave });
        break;
      case "add":
        emit("installed", result.engines);
        useMessageStore().enqueue({ text: t.enginesAddedPleaseSave });
        break;
      case "none":
        // 同じ版の再インストール (修復) では一覧を変えない。
        break;
    }
  } catch (e) {
    // 利用者のキャンセルによる中断だけは表示しない。キャンセルと同時に別の理由で
    // 失敗した場合は、その理由を表示する。
    if (!isEnginePackageInstallCanceled(e)) {
      useErrorStore().add(e);
    }
  } finally {
    installing[pkg.id] = false;
    packageStore.clearProgress(pkg.id);
    await reloadInstalled().catch((e) => useErrorStore().add(e));
  }
};

const cancelInstall = (id: string) => {
  api.cancelEnginePackageInstall(id).catch((e) => useErrorStore().add(e));
};

const confirmUninstall = (pkg: InstalledEnginePackageInfo) => {
  useConfirmationStore().show({
    message: t.areYouSureWantToUninstallEngine(`${pkg.name} (${pkg.version})`),
    onOk: async () => {
      busyState.retain();
      try {
        await api.uninstallEnginePackage(pkg.id, pkg.version);
        await reloadInstalled();
      } catch (e) {
        useErrorStore().add(e);
      } finally {
        busyState.release();
      }
    },
  });
};

const close = () => {
  if (isInstalling.value) {
    return;
  }
  emit("close");
};
</script>

<style scoped>
.package-list {
  width: 640px;
  height: calc(100vh - 300px);
  max-height: 500px;
  overflow: auto;
}
.package {
  margin: 0px 5px 0px 5px;
  padding: 5px;
  border-bottom: 1px solid gray;
}
.package-info {
  width: 500px;
  text-align: left;
  margin-right: 10px;
}
.package-name {
  font-weight: bold;
  text-align: left;
}
.package-detail {
  font-size: 0.85em;
}
.package-status {
  font-size: 0.85em;
  margin-top: 2px;
}
.package-action {
  min-width: 110px;
  white-space: nowrap;
}
.notice-line {
  text-align: left;
}
.package-status progress {
  width: 200px;
  vertical-align: middle;
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
