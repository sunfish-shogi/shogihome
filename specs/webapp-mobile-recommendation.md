# Web アプリのモバイル向け画面の推奨

Web 版を PC 向けの画面 (`mobile` クエリなし) で開いたときに、
スマートフォンやタブレットである可能性が高ければ、モバイル向けの画面
(`?mobile`) へ切り替えるかを確認する。Electron 版には適用されない。

実装は `src/renderer/webapp/mobile.ts`。

## 端末の判定

次のいずれかに当てはまる場合に、スマートフォンやタブレットである可能性が高いとみなす。

1. `navigator.userAgentData.mobile` が `true` (User-Agent Client Hints)
2. User-Agent 文字列に `Android`, `iPhone`, `iPad`, `iPod`, `Mobile` のいずれかを含む
3. iPadOS (`navigator.platform` が `MacIntel` かつ `navigator.maxTouchPoints > 1`)。
   iPadOS の Safari は Mac と同じ User-Agent を返すため個別に判定する。
4. 主なポインターが `coarse` で、精密なポインター (`any-pointer: fine`) と
   ホバー可能なポインター (`any-hover: hover`) をいずれも持たない

タッチパネル付きの PC は 4 に当てはまらないため対象外とする。

## 振る舞い

1. 画面のマウント後に判定する。言語指定クエリの確認
   ([webapp-language-query.md](webapp-language-query.md)) を表示している場合は、
   今回は確認せず、確認済みとしても記録しない。
2. 確認ダイアログは「はい」「いいえ」で表示する。
3. 「はい」を選ぶと、現在の URL に `mobile` クエリを付けたページへ遷移する。
   他のクエリ (`usen` など) は残す。
4. 「はい」「いいえ」のどちらを選んでも、確認済みであることを localStorage に記録し、
   以降は確認しない。

## localStorage

| キー                              | 値          |
| --------------------------------- | ----------- |
| `webapp.mobileModeRecommendation` | `confirmed` |

値の有無のみで判定する。
