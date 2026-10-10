# 02 — 真机性能：同屏 60 只怪 + 12 个英雄 + 飘字

**What to build:** 在 iPhone 上用发布构建跑原型的压力测试，记录 `frameStats`。重点看飘字（Label 每次换数字都要重新栅格化）在 iOS 小游戏上的代价，决定 BitmapText 要不要进引擎。

**Blocked by:** 01

**Status:** done（2026-10-10）

需要手机和测试 AppID（见 memory 里的真机流程）：

```sh
cd examples/towerdefense
pnpm log-server &
WX_APPID=<test appid> SAPLING_RELEASE=1 VITE_BENCH=1 SAPLING_LOG_URL=http://<LAN IP>:7777/log pnpm build:wechat
cli preview --project "$PWD/dist-wechat" --qr-format image --qr-output qr.png  # 扫码，放着不动约 45 秒；日志里三条 [bench]
```

- [x] 记录正常攻速时的 fps、逻辑、渲染（平均和峰值）
- [x] 把英雄攻速调高到每秒约 50 个飘字、每个数字都不同，再记录一次（对比 Label 的栅格化代价）
- [x] 结论写进 spec 的验证清单（BitmapText 一行）

参考：桌面 Chrome 6 倍降速时，逻辑 0.52 ms / 渲染 3.67 ms；每秒 50 个不同的数字只让渲染多 0.3 ms。

## Comments

**结果（2026-10-10，iPhone 17，微信小游戏发布构建，包 888 KB）：**

改成 `VITE_BENCH=1` 构建（`src/bench.ts`）：放满 12 个英雄、60 只怪（压力测试里怪走到底线后回到起点，数量不变），三个阶段各热身 3 秒、测 10 秒。

| 阶段 | fps | 帧间隔峰值 | 逻辑 平均 / 峰值 | 渲染 平均 / 峰值 | 飘字/秒 |
|---|---|---|---|---|---|
| normal（正常攻速） | 60.0 | 18.4 ms | 0.64 / 1.91 ms | 4.68 / 9.29 ms | 21 |
| fast（攻速 0.15 秒，数字大多相同） | 60.0 | 16.9 ms | 0.75 / 1.40 ms | 5.37 / 6.88 ms | 237 |
| fast-vary（同上，每个数字都不同） | 60.0 | 17.1 ms | 0.77 / 1.25 ms | 5.77 / 8.09 ms | 265 |

- 每秒 265 个都要重新栅格化的 Label，渲染平均只多 0.4 ms，峰值 8 ms，帧率不受影响。**BitmapText 不需要进引擎**（这个规模）。
- 飘字比计划的 50 个/秒多得多：剑士扇形和法师爆炸一次打中好几只怪，每只都飘一个数字。这个强度已经超过正常游戏。
- 整体离 16.7 ms 的帧预算还很远：12 个英雄 × 60 只怪的线性遍历、每帧 60 次 `zIndex` 变化和曲线采样，在无 JIT 的 iOS 上逻辑也不到 1 ms。
