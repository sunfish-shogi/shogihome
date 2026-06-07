<template>
  <div class="consecutive-game-progress">
    <table class="progress-table">
      <thead>
        <tr>
          <th>{{ t.player }}</th>
          <th>{{ t.winsOnBlack }}</th>
          <th>{{ t.winsOnWhite }}</th>
          <th>{{ t.wins }}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="player-name">{{ results.player1.name }}</td>
          <td>{{ results.player1.winBlack }}</td>
          <td>{{ results.player1.winWhite }}</td>
          <td>{{ results.player1.win }}</td>
        </tr>
        <tr>
          <td class="player-name">{{ results.player2.name }}</td>
          <td>{{ results.player2.winBlack }}</td>
          <td>{{ results.player2.winWhite }}</td>
          <td>{{ results.player2.win }}</td>
        </tr>
      </tbody>
    </table>
    <div class="progress-footer">
      <span>{{ t.draws }}: {{ results.draw }}</span>
      <span>
        {{ t.validGames }}: {{ results.total - results.invalid
        }}<template v-if="totalGames >= 2"> / {{ totalGames }}</template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed } from "vue";
import { useStore } from "@/renderer/store";

const store = useStore();

const results = computed(() => store.gameResults);

const totalGames = computed(() => store.gameSettings.repeat);
</script>

<style scoped>
.consecutive-game-progress {
  padding: 4px;
  margin-top: 4px;
  background-color: var(--text-bg-color);
  color: var(--text-color);
}
.progress-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85em;
}
.progress-table th,
.progress-table td {
  border: 1px solid var(--main-bg-color);
  padding: 2px 4px;
  text-align: right;
}
.progress-table th:first-child,
.progress-table td:first-child {
  text-align: left;
}
.progress-table td.player-name {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.progress-footer {
  display: flex;
  gap: 8px;
  font-size: 0.85em;
  padding-top: 2px;
}
</style>
