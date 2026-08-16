// specs/wasm-engine-abi.md 版 2 のインターフェースを Emscripten の Module に生やす。
// em++ の --pre-js に渡して使う。Module は生成関数に渡された引数そのもので、
// Emscripten が print を読み取るより前にこのコードが評価される。
//
// C 側は usi_command / usi_poll の 2 つをエクスポートするだけでよく、
// YaneuraOu と同じ postMessage / addMessageListener の形はここで組み立てる。

// 先頭が function 宣言なので、直前の行との自動セミコロン挿入を気にしなくてよい。
function installShogiHomeShim() {
  const listeners = [];
  let terminated = false;

  // エンジンの標準出力を行単位でリスナーへ流す。
  // printErr は呼び出し側 (Worker) が受け取れるよう触らない。
  Module["print"] = (line) => {
    // リスナーの登録解除が走っても走査中の配列に影響しないよう複製する。
    for (const listener of listeners.slice()) {
      listener(line);
    }
  };

  Module["addMessageListener"] = (listener) => {
    listeners.push(listener);
  };

  Module["removeMessageListener"] = (listener) => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };

  Module["postMessage"] = (command) => {
    if (!terminated) {
      Module["ccall"]("usi_command", null, ["string"], [String(command)]);
    }
  };

  // 単一スレッドなので、探索は poll() ごとに少しずつ進める。
  Module["poll"] = () => {
    if (!terminated) {
      Module["ccall"]("usi_poll", null, [], []);
    }
  };

  Module["terminate"] = () => {
    if (terminated) {
      return;
    }
    terminated = true;
    // 終了後の出力は仕様で禁じているので、先にリスナーを外してから quit を送る。
    listeners.length = 0;
    Module["ccall"]("usi_command", null, ["string"], ["quit"]);
  };
}

installShogiHomeShim();
