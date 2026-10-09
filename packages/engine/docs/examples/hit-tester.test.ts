// #region example
import { circle, HitTester, rectangle, Scene, Sprite2D, v } from 'sapling2d'

// 碰撞形状在模块里建一次，所有子弹共用（不要每颗子弹 new 一个）
const BULLET_SHAPE = circle(8)
const ENEMY_SHAPE = rectangle(120, 60) // 以节点位置为中心，轴对齐

class Bullet extends Sprite2D {
  readonly hitShape = BULLET_SHAPE
  override process(dt: number) {
    this.y -= 1200 * dt // 用 y -= …，不分配 Vector2
  }
}

class Enemy extends Sprite2D {
  readonly hitShape = ENEMY_SHAPE
  hp = 3
}

export class Battle extends Scene {
  readonly bullets: Bullet[] = []
  readonly enemies: Enemy[] = []
  private readonly _hits = new HitTester()

  override ready() {
    // 互相比较的对象挂在同一个父节点下：HitTester 比较的是局部坐标 x / y
    this.enemies.push(this.add(new Enemy({ position: v(375, 300) })))
    for (let i = 0; i < 5; i++) this.bullets.push(this.add(new Bullet({ position: v(375, 1000 + i * 100) })))
  }

  override process() {
    // 子弹 × 敌机：返回 true 表示这颗子弹用掉了，不再和别的敌机比较
    this._hits.forEachHit(this.bullets, this.enemies, (bullet, enemy) => {
      bullet.queueFree()
      if (--enemy.hp <= 0) enemy.queueFree() // 已 queueFree 的对象自动不再参与判定
      return true
    })
    HitTester.compact(this.bullets) // 原地去掉已失效的对象
    HitTester.compact(this.enemies)
  }
}
// #endregion

import { expect, it } from 'vitest'
import { createTestGame } from 'sapling2d/testing'

it('hit-tester', async () => {
  const g = await createTestGame({ main: Battle })
  g.stepSeconds(1.5)
  expect(g.scene.enemies).toHaveLength(0) // 3 颗子弹打掉了敌机
  expect(g.scene.bullets).toHaveLength(2) // 剩下 2 颗穿过去了
})
