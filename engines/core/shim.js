// specs/wasm-engine-abi.md 版 1 のインターフェースを Emscripten の Module に生やす。
// em++ の --pre-js に渡して使う。Module は生成関数に渡された引数そのもので、
// Emscripten が print を読み取るより前にこのコードが評価される。
//
// C 側は usi_command / usi_poll の 2 つをエクスポートするだけでよく、
// YaneuraOu と同じ postMessage / addMessageListener の形はここで組み立てる。
//
// 単一スレッドのエンジンは探索を分割実行しなければ stop を受け取れないが、
// **その駆動はこのシムの中で完結させる。** 呼び出し側から見えるインターフェースは
// YaneuraOu の wasm ビルドと同じで、poll に相当するものは無い。
//
// 探索を専用のスレッドで走らせるエンジン (ShogiHome の basic はこちら) では
// usi_poll に進めるものが無く、常に 0 を返す。その場合タイマーは 1 回で止まる。
// 探索スレッドからの出力は Emscripten が fd_write をメインスレッドへ代理実行するため、
// ここで登録したリスナーに届く。

// 先頭が function 宣言なので、直前の行との自動セミコロン挿入を気にしなくてよい。
function installShogiHomeShim() {
  // 探索を進めるために usi_poll を呼ぶ間隔 (ミリ秒)。
  const POLL_INTERVAL_MS = 10;

  const listeners = [];
  let terminated = false;
  let timer = undefined;

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

  const stopPolling = () => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  // usi_poll が「まだ呼ばれる必要がある」と答える間だけ回す。
  // 思考していないときや stop / ponderhit 待ちのときは 0 が返り、タイマーは止まる。
  // 止まっている間に届いたコマンドは postMessage が再び回し始める。
  const startPolling = () => {
    if (timer !== undefined || terminated) {
      return;
    }
    timer = setInterval(() => {
      if (terminated || !Module["ccall"]("usi_poll", "number", [], [])) {
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  };

  Module["postMessage"] = (command) => {
    if (terminated) {
      return;
    }
    Module["ccall"]("usi_command", null, ["string"], [String(command)]);
    // go や ponderhit で思考が始まったかもしれないので駆動を試みる。
    // 進めるものが無ければ最初の 1 回で止まる。
    startPolling();
  };

  Module["terminate"] = () => {
    if (terminated) {
      return;
    }
    terminated = true;
    stopPolling();
    // 終了後の出力は仕様で禁じているので、先にリスナーを外してから quit を送る。
    listeners.length = 0;
    Module["ccall"]("usi_command", null, ["string"], ["quit"]);
  };
}

installShogiHomeShim();
