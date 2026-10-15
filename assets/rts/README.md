# RTS版の絵（anime-rts.html 用）

いただいたドット絵素材「制作デスク RTS — ドット絵素材 v1」（1920×1080 基準）から、ゲームで使うものだけを入れています。見た目を変えずに軽くするため、PNG を劣化なしの WebP にしています（見えている画素は元の PNG と同じ）。

| ファイル | 元の素材 |
| --- | --- |
| `bg-day.webp` `bg-evening.webp` `bg-night.webp` | `backgrounds/room-*-1920x1080.png` |
| `fg.webp` | `layers/desk-foreground-1920x1080.png` |
| `chars/s1/` 佐伯・`chars/s2/` 川口・`chars/s3/` 真壁（idle・work・report・tired・sleep・phone） | `characters/<名前>/<ポーズ>.png` |
| `phone-desk.webp` `car-keys.webp` | `objects/` |
| `phone-body.webp` | `ui/phone-front-body.png` |

配置（座標・大きさ）は素材の `manifest.json` のとおり。ホワイトボードの表・指示・状態表示・吹き出し・スマホの画面は、ゲームの状態に合わせて HTML の文字で描いています。
