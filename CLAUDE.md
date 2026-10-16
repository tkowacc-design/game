# 深夜アニメP

- ゲーム本体は `anime-producer.html` の1ファイル。計算部分（`<script id="engine">`）と画面（その下の `<script>`）は分かれている。
- 画面は「左に一覧 → 選ぶと右に詳細 → 詳細のいちばん下に、それにできること」で統一している。品質の見込みは数字で出さず、制作デスクの「あなたの見立て」のひとことで出す。
- 制作デスクの5日間の試作は `anime-desk5.html`（進行3人・3話・1日3ブロック×5日のテキスト中心の判断ゲーム。PCゲーム）。計算部分は `<script id="engine">`（検証用シミュレーションと同じ結果になることを確かめてある）。テストのルートは `tools/qa/routes-desk5.md`、ランダム操作は `node tools/qa/fuzz.js --page anime-desk5.html --live`（本体用の「右に詳細」の判定を外すため `--live` を付ける）。
- 制作進行の一人称の試作は `anime-night.html`（1晩の原画回収。何をしても時間が進むターン制。PCゲーム）。作りは同じ（計算部分は `<script id="engine">`）。テストのルートは `tools/qa/routes-night.md`、ランダム操作は `node tools/qa/fuzz.js --page anime-night.html --live`。
- RTS版の試作は `anime-rts.html`（制作デスクの一人称・1週＝120秒・進行3人に指示。絵は `assets/rts/`）。**PCゲーム**なので、スマホ（端末）向けの画面は作らない。作りは本体と同じ（計算部分は `<script id="engine">`）。テストのルートは `tools/qa/routes-rts.md`、ランダム操作は `node tools/qa/fuzz.js --page anime-rts.html --live`（時間で書き換わる画面なので `--live` を付ける）。

## 大きな修正のあとのテスト（必ずやる）

画面の作り直し、ゲームの流れ・ルールの変更、複数の画面にまたがる修正をしたら、プッシュする前に次をすべて行う。

1. デバッグ担当（`.claude/agents/debugger.md`、Haiku）を呼び、`tools/qa/routes.md` の**全ルート**を実際のブラウザで試させる（RTS版を直したときは `tools/qa/routes-rts.md`、回収の夜は `tools/qa/routes-night.md`、デスクの5日間は `tools/qa/routes-desk5.md`）。
   - 呼ぶときは `subagent_type: "debugger"`。使えないときは general-purpose に `model: "haiku"` を指定し、`.claude/agents/debugger.md` の本文をそのまま渡す。
2. 並行して、自分でも次を確かめる。
   - `node tools/qa/fuzz.js`（PC幅・スマホ幅。RTS版・回収の夜・デスクの5日間はPC幅だけ）
   - 横スクロールの有無（1440 / 1024 / 768 / 390 / 320 px。RTS版・回収の夜・デスクの5日間は 1920×1080 / 1440×900 / 1280×720 / 1024×768）
   - 文字と背景のコントラスト、タップ領域（スマホ幅で44px以上。RTS版・回収の夜・デスクの5日間はなし）
   - 保存と再開（制作中・ダイアログ表示中の再読み込み）
   - 計算部分を変えたときは、Node で多数の seed を回して破綻がないか
3. 見つかった問題を直し、もう一度テストしてからプッシュする。直さなかったものは理由と一緒に報告する。
4. 画面や操作を足したら、`tools/qa/routes.md`（RTS版は `tools/qa/routes-rts.md`、回収の夜は `tools/qa/routes-night.md`、デスクの5日間は `tools/qa/routes-desk5.md`）にも足す。
