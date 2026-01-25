<template>
  <DialogFrame>
    <div v-if="store.gameSettings.sprtEnabled" class="title">SPRT</div>
    <div v-else class="title">{{ t.parallelGame }}</div>
    <div class="content form-group scroll">
      <div class="game-results row">
        <div v-if="!store.parallelGameProgress">
          {{ t.processingPleaseWait }}
        </div>
        <div v-if="store.parallelGameProgress">
          <ul>
            <li>
              {{ store.parallelGameProgress.gameResults.player1.name }}
              <ul>
                <li>{{ t.wins }}: {{ store.parallelGameProgress.gameResults.player1.win }}</li>
                <li>
                  {{ t.winsOnBlack }}: {{ store.parallelGameProgress.gameResults.player1.winBlack }}
                </li>
                <li>
                  {{ t.winsOnWhite }}: {{ store.parallelGameProgress.gameResults.player1.winWhite }}
                </li>
              </ul>
            </li>
            <li>
              {{ store.parallelGameProgress.gameResults.player2.name }}
              <ul>
                <li>{{ t.wins }}: {{ store.parallelGameProgress.gameResults.player2.win }}</li>
                <li>
                  {{ t.winsOnBlack }}: {{ store.parallelGameProgress.gameResults.player2.winBlack }}
                </li>
                <li>
                  {{ t.winsOnWhite }}: {{ store.parallelGameProgress.gameResults.player2.winWhite }}
                </li>
              </ul>
            </li>
            <li>{{ t.draws }}: {{ store.parallelGameProgress.gameResults.draw }}</li>
            <li>
              {{ t.validGames }}:
              {{
                store.parallelGameProgress.gameResults.total -
                store.parallelGameProgress.gameResults.invalid
              }}
            </li>
            <li>{{ t.invalidGames }}: {{ store.parallelGameProgress.gameResults.invalid }}</li>
          </ul>
        </div>
        <div v-if="store.parallelGameProgress?.sprtSummary">
          <ul>
            <li>
              Elo0={{ store.parallelGameProgress.sprtSummary.elo0 }} Elo1={{
                store.parallelGameProgress.sprtSummary.elo1
              }}
            </li>
            <li>
              &alpha;={{ store.parallelGameProgress.sprtSummary.alpha }} &beta;={{
                store.parallelGameProgress.sprtSummary.beta
              }}
            </li>
            <li>
              5-nomial: [{{ store.parallelGameProgress.sprtSummary.pentanomial.loseLose }},
              {{ store.parallelGameProgress.sprtSummary.pentanomial.loseDraw }},
              {{ store.parallelGameProgress.sprtSummary.pentanomial.drawDrawOrWinLose }},
              {{ store.parallelGameProgress.sprtSummary.pentanomial.winDraw }},
              {{ store.parallelGameProgress.sprtSummary.pentanomial.winWin }}]
            </li>
            <li>
              LLR: {{ store.parallelGameProgress.sprtSummary.llr.toFixed(5) }} [{{
                store.parallelGameProgress.sprtSummary.lowerBound.toFixed(5)
              }}, {{ store.parallelGameProgress.sprtSummary.upperBound.toFixed(5) }}]
            </li>
          </ul>
        </div>
      </div>
      <table v-if="store.parallelGameProgress" class="worker-list">
        <thead>
          <tr>
            <th>Worker</th>
            <th class="number">Count</th>
            <th>Title</th>
            <th class="player-name">{{ t.sente }}</th>
            <th class="player-name">{{ t.gote }}</th>
            <th class="number">{{ t.elapsed }} [s]</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(worker, index) in store.parallelGameProgress.workerStats" :key="index">
            <td>Worker-{{ index + 1 }}</td>
            <td class="number">{{ worker.gameCount }}</td>
            <td>{{ worker.currentGameTitle }}</td>
            <td class="player-name">{{ worker.currentBlackPlayerName }}</td>
            <td class="player-name">{{ worker.currentWhitePlayerName }}</td>
            <td class="number">
              {{
                worker.currentGameStartTime
                  ? (Math.max(0, now - worker.currentGameStartTime) / 1000).toFixed(1)
                  : ""
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="main-buttons">
      <button @click="store.stopGame()">
        <Icon :icon="IconType.STOP" />
        {{ t.stopGame }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { IconType } from "@/renderer/assets/icons";
import { useStore } from "@/renderer/store";
import DialogFrame from "./DialogFrame.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { t } from "@/common/i18n";

const store = useStore();
const now = ref(Date.now());
let timer: NodeJS.Timeout;

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 250);
});

onBeforeUnmount(() => {
  clearInterval(timer);
});
</script>

<style scoped>
.content {
  max-width: 80vw;
  max-height: 60vh;
}

.content > *:not(:first-child) {
  margin-top: 10px;
}

.game-results > * {
  margin-right: 2em;
}

.game-results ul {
  margin: 0;
  padding-left: 1.2em;
  list-style-type: disc;
  text-align: left;
}

.worker-list {
  border-collapse: collapse;
}

.worker-list th,
.worker-list td {
  height: 18px;
  border: 1px solid var(--text-separator-color);
  padding: 2px;
  text-align: left;
}

.worker-list th.number,
.worker-list td.number {
  text-align: right;
}

.worker-list th.player-name,
.worker-list td.player-name {
  max-width: 250px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
