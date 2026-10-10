# 02 — 真机性能：同屏 60 只怪 + 12 个英雄 + 飘字

**What to build:** 在 iPhone 上用发布构建跑原型的压力测试，记录 `frameStats`。重点看飘字（Label 每次换数字都要重新栅格化）在 iOS 小游戏上的代价，决定 BitmapText 要不要进引擎。

**Blocked by:** 01

**Status:** ready-for-human

需要手机和测试 AppID（见 memory 里的真机流程）：

```sh
cd examples/towerdefense
pnpm log-server &
WX_APPID=<test appid> SAPLING_RELEASE=1 VITE_STRESS=60 SAPLING_LOG_URL=http://<LAN IP>:7777/log pnpm build:wechat
# 开发者工具打开 dist-wechat/，预览二维码扫码；日志里每 5 秒一条 [perf]
```

- [ ] 记录 `VITE_STRESS=60` 时的 fps、逻辑、渲染（平均和峰值）
- [ ] 把英雄攻速调高到每秒约 50 个飘字、每个数字都不同，再记录一次（对比 Label 的栅格化代价）
- [ ] 结论写进 spec 的验证清单（BitmapText 一行）

参考：桌面 Chrome 6 倍降速时，逻辑 0.52 ms / 渲染 3.67 ms；每秒 50 个不同的数字只让渲染多 0.3 ms。

## Comments
