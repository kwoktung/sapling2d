// #region example
import { Label, Scene, v } from 'sapling2d'

declare module 'sapling2d' {
  interface StorageRegistry {
    best: number
  }
}

export class Play extends Scene {
  score = 0

  finish() {
    const best = Math.max(this.score, this.tree.storage.get('best', 0)) // 同步读写，JSON，自动加前缀
    this.tree.storage.set('best', best)
    // 参数类型由 Result 的构造函数决定；资源加载完后在微任务里替换场景，不打断当前帧
    void this.tree.changeScene(Result, { score: this.score, best })
  }
}

export class Result extends Scene {
  constructor(readonly params: { score: number; best: number }) {
    super()
  }

  override ready() {
    this.add(new Label({ text: `得分 ${this.params.score} · 最高 ${this.params.best}`, align: 'center', position: v(375, 600) }))
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('scene change and storage', async () => {
  // #region test
  const g = await createTestGame({ main: Play, storage: { best: 30 } }) // 预置存档
  ;(g.scene as Play).score = 42
  ;(g.scene as Play).finish()
  await new Promise((r) => setTimeout(r, 0)) // 等场景替换完成（或 await changeScene 的返回值）
  expect(g.tree.currentScene).toBeInstanceOf(Result)
  expect(g.tree.storage.get('best', 0)).toBe(42)
  // #endregion
  expect(g.dump()).toContain('得分 42 · 最高 42')
})
