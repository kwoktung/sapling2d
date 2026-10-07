// #region example
import { Node2D, Scene } from 'sapling2d'

class Spinner extends Node2D {
  override process(dt: number) {
    this.rotation += dt
  }
}

export class World extends Scene {
  spinner!: Spinner
  menuSpinner!: Spinner

  override ready() {
    this.spinner = this.add(new Spinner()) // 默认 inherit → pausable
    this.menuSpinner = this.add(new Spinner({ processMode: 'always' })) // 暂停菜单：暂停时照常运行
  }

  togglePause() {
    this.tree.paused = !this.tree.paused // 暂停 pausable 节点、它们的 Tween / Timer、指针事件和物理
  }
}
// 切到后台：tree.focusChanged(false)，默认挂起整个主循环
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('pause', async () => {
  const g = await createTestGame({ main: World })
  g.scene.togglePause()
  g.step(60)
  expect(g.scene.spinner.rotation).toBe(0)
  expect(g.scene.menuSpinner.rotation).toBeCloseTo(1)
})
