<template>
  <div>
    <div class="column">
      <div class="row">
        <HorizontalSelector
          v-model:value="mode"
          :height="24"
          :items="[
            {
              value: CommandType.SEND,
              label:
                store.target === PromptTarget.CSA
                  ? `\u25B6 ${t.csaServer}`
                  : `\u25B6 ${t.usiEngine}`,
            },
            { value: CommandType.RECEIVE, label: `\u25C0 ${t.shogiHome}` },
          ]"
        />
        <input
          class="grow"
          type="text"
          :placeholder="t.typeCommandHereAndPressEnter"
          list="command-candidates"
          @keydown="
            (event) => {
              if (event.key !== 'Enter') {
                return;
              }
              const input = event.target as HTMLInputElement;
              onEnter(input);
            }
          "
        />
        <datalist id="command-candidates">
          <option v-for="candidate of candidatesPreset" :key="candidate" :value="candidate" />
          <option v-for="candidate of candidates" :key="candidate" :value="candidate" />
        </datalist>
      </div>
      <div class="row settings">
        <ToggleButton v-model:value="allowBlankLine" :label="t.allowBlankLine" />
        <ToggleButton v-model:value="trim" :label="t.removeSpaceFromBothEnds" />
        <ToggleButton v-model:value="collapse" :label="t.collapseSequentialSpaces" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CommandType } from "@/common/advanced/command";
import { PromptTarget } from "@/common/advanced/prompt";
import { useStore } from "@/renderer/prompt/store";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { computed, ref } from "vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { t } from "@/common/i18n";

const store = useStore();
const mode = ref<CommandType>(CommandType.SEND);
const allowBlankLine = ref(false);
const trim = ref(true);
const collapse = ref(true);

function onEnter(input: HTMLInputElement) {
  let value = input.value;
  if (trim.value) {
    value = value.trim();
  }
  if (collapse.value) {
    value = value.replace(/\s+/g, " ");
  }
  if (!allowBlankLine.value && value === "") {
    return;
  }
  store.invokeCommand(mode.value, value);
  input.value = "";
}

const candidates = computed(() => {
  const m: { [command: string]: null } = {};
  let n = 0;
  for (let i = store.history.commands.length - 1; i >= 0; i--) {
    const entry = store.history.commands[i];
    if (entry.type !== mode.value) {
      continue;
    }
    if (m[entry.command] === null) {
      continue;
    }
    m[entry.command] = null;
    n++;
    if (n >= 64) {
      break;
    }
  }
  return Object.keys(m);
});

const candidatesPreset = computed(() => {
  switch (store.target) {
    case PromptTarget.CSA:
      switch (mode.value) {
        case CommandType.SEND:
          return [
            "LOGIN ",
            "LOGOUT",
            "AGREE",
            "REJECT",
            "%TORYO",
            "%KACHI",
            "%CHUDAN",
            "%%WHO",
            "%%CHAT ",
            "%%GAME ",
            "%%CHALLENGE ",
            "%%LIST",
            "%%SHOW ",
            "%%MONITORON ",
            "%%MONITOROFF ",
            "%%MONITOR2ON ",
            "%%MONITOR2OFF ",
            "%%RATING",
            "%%SETBUOY ",
            "%%DELETEBUOY ",
            "%%GETBUOYCOUNT ",
            "%%FORK ",
          ];
        case CommandType.RECEIVE:
          return [
            "LOGIN:",
            "LOGIN:incorrect",
            "LOGOUT:completed",
            "BEGIN Game_Summary",
            "Protocol_Version:1.2",
            "Protocol_Mode:Server",
            "Format:Shogi 1.0",
            "Declaration:Jishogi 1.1",
            "Game_ID:",
            "Name+:",
            "Name-:",
            "Your_Turn:+",
            "Your_Turn:-",
            "Rematch_On_Draw:YES",
            "Rematch_On_Draw:NO",
            "To_Move:+",
            "To_Move:-",
            "Max_Moves:",
            "BEGIN Time",
            "Time_Unit:1sec",
            "Total_Time:",
            "Byoyomi:",
            "Delay:",
            "Increment:",
            "Least_Time_Per_Move:",
            "END Time",
            "BEGIN Position",
            "P1-KY-KE-GI-KI-OU-KI-GI-KE-KY",
            "P2 * -HI *  *  *  *  * -KA * ",
            "P3-FU-FU-FU-FU-FU-FU-FU-FU-FU",
            "P4 *  *  *  *  *  *  *  *  * ",
            "P5 *  *  *  *  *  *  *  *  * ",
            "P6 *  *  *  *  *  *  *  *  * ",
            "P7+FU+FU+FU+FU+FU+FU+FU+FU+FU",
            "P8 * +KA *  *  *  *  * +HI * ",
            "P9+KY+KE+GI+KI+OU+KI+GI+KE+KY",
            "P+",
            "P-",
            "END Position",
            "END Game_Summary",
            "START",
            "REJECT:",
            "%TORYO,T",
            "%KACHI,T",
            "#SENNICHITE",
            "#DRAW",
            "#OUTE_SENNICHITE",
            "#ILLEGAL_MOVE",
            "#TIME_UP",
            "#RESIGN",
            "#JISHOGI",
            "#MAX_MOVES",
            "#CENSORED",
            "#CHUDAN",
            "#ILLEGAL_ACTION",
            "#WIN",
            "#LOSE",
          ];
      }
      break;
    case PromptTarget.USI:
      switch (mode.value) {
        case CommandType.SEND:
          return [
            "usi",
            "isready",
            "setoption name ",
            "usinewgame",
            "position sfen ",
            "position startpos moves ",
            "go btime ",
            "go ponder btime ",
            "go infinite",
            "go mate ",
            "go mate infinite",
            "stop",
            "ponderhit",
            "quit",
            "gameover win",
            "gameover lose",
            "gameover draw",
          ];
        case CommandType.RECEIVE:
          return [
            "id name ",
            "id author ",
            "usiok",
            "readyok",
            "bestmove ",
            "bestmove resign",
            "bestmove win",
            "info depth ",
            "info time ",
            "info nodes ",
            "info pv ",
            "info multipv ",
            "info score cp ",
            "info score mate ",
            "info currmove ",
            "info hashfull ",
            "info nps ",
            "info string ",
            "option name ",
            "option name USI_Hash type spin",
            "option name USI_Hash type spin default ",
            "option name USI_Ponder type check",
            "option name USI_Ponder type check default ",
            "checkmate ",
            "checkmate notimplemented",
            "checkmate timeout",
            "checkmate nomate",
          ];
      }
      break;
  }
  return [];
});
</script>

<style scoped>
input {
  font-size: 18px;
  height: 24px;
  margin-left: 4px;
}
.settings > *:not(:first-child) {
  margin-left: 20px;
}
</style>
