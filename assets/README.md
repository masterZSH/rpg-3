# 外部素材放置说明

默认 `src/game/assets.ts` 里 `USE_EXTERNAL_ASSETS = false`，游戏用代码生成的占位像素图运行，
不依赖任何下载。想换成真正的 CC0 素材时按下表放置文件，然后把开关改成 `true`。

## 目录约定

```
public/assets/
├── tilesets/
│   └── overworld.png     # 世界图集：8 张 16x16 横向排列
└── sprites/
    ├── hero_down.png     # 12x16
    ├── hero_up.png
    ├── hero_left.png
    ├── hero_right.png
    ├── npc.png           # 12x16
    ├── enemy_slime.png   # 12x12 左右
    ├── enemy_bat.png
    ├── enemy_caster.png
    ├── enemy_boss.png    # 24x24
    ├── arrow.png
    ├── coin.png
    └── potion.png
```

## 瓦片顺序（overworld.png 必须按这个顺序横排）

| 索引 | 含义 | 阻挡 |
| ---- | ---- | ---- |
| 0 | 草地 | 否 |
| 1 | 道路 | 否 |
| 2 | 石板 | 否 |
| 3 | 墙体 | 是 |
| 4 | 水面 | 是 |
| 5 | 树木 | 是 |
| 6 | 门 | 否 |
| 7 | 虚空 | 是 |

顺序和素材不一致时，改 `src/game/tiles.ts` 里的 `Legend` 映射即可，地图数据不用动。

## 推荐素材源（均为 CC0 / 免费商用）

- Kenney — Tiny Dungeon / Tiny Town / Roguelike RPG Pack
  https://kenney.nl/assets
- OpenGameArt 上的 16x16 LPC 风格瓦片

放好文件后刷新即可。单个文件缺失不会白屏，会自动回退到占位图。
