/**
 * TileMap 渲染压测（微信小游戏真机，横屏）。依次跑全部画法（稀疏地图、满地图），每档 8 秒（前 2 秒预热）。
 * 每档结束 console.log 一行结果；稀疏地图的每档截一张图（看接缝），全部结束后打印汇总并截图。
 * 需要构建时设置 SAPLING_LOG_URL，结果才能回到电脑上。
 */
import { DOMAdapter } from 'pixi.js'
import { snapshot, WechatPlatform } from 'sapling2d/wechat'
import { WechatAdapter } from '@engine/src/platform/wechat/adapter'
import { createBench, fmt, HEADER, MODES, type Row } from './bench'

async function main() {
  DOMAdapter.set(WechatAdapter)
  const platform = new WechatPlatform()
  const bench = await createBench({
    canvas: platform.canvas,
    now: () => platform.now(),
    requestFrame: (cb) => platform.requestFrame(() => cb()),
    screen: () => {
      const s = platform.getScreenInfo()
      return { width: s.width, height: s.height, dpr: s.pixelRatio }
    },
    loadImage: async (path) => (await platform.loadImage(path)).resource,
    webglVersion: 1, // 小游戏只走 WebGL1（见 spikes/wechat/REPORT.md）
  })
  const info = wx.getSystemInfoSync() as unknown as Record<string, unknown>
  const screen = platform.getScreenInfo()
  const device = `${info.brand} ${info.model} · ${info.system} · SDK ${info.SDKVersion} · ${screen.width}x${screen.height}@${screen.pixelRatio}`
  console.log(`[tilemap] start ${device} benchmarkLevel=${info.benchmarkLevel}`)

  const results: Row[] = []
  const runs = [false, true].flatMap((fill) => [false, true].flatMap((camGroup) => MODES.map((mode) => ({ mode, fill, camGroup, extrude: false, durationMs: 8000 }))))
  runs.push({ mode: 'mesh', fill: false, camGroup: true, extrude: true, durationMs: 8000 })
  for (const run of runs) {
    let shot = false
    const row = await bench.run(run, (r) => {
      bench.hud([HEADER, fmt(r), ...results.map(fmt)].join('\n'))
      // 稀疏地图跑到一半时截图，看图块接缝
      if (!run.fill && !shot) {
        shot = true
        snapshot(`tilemap-${run.mode}${run.extrude ? '-extrude' : ''}`)
      }
    })
    results.push(row)
    console.log(`[tilemap] ${fmt(row)}`)
  }
  const table = [HEADER, ...results.map(fmt)].join('\n')
  bench.hud(`${device}\n${table}\n\ndone`)
  console.log(`[tilemap] done ${device}\n${table}`)
  snapshot('tilemap-done')
}

main().catch((err: unknown) => console.error('[tilemap] failed', err))
