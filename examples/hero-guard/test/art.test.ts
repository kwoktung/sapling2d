import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { atlas, Sprite2D } from 'sapling2d'
import { chromaKey, parseHex } from '../scripts/art/key'

/** 合成测试图：品红背景、背景上一块更暗的品红阴影、一个深色描边的绿色圆（角色），圆里有一小块被围住的纯品红（弓和弓弦围住的空隙）。 */
function synthetic(w = 80, h = 80) {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      let c = [255, 0, 255] // 背景
      if (y > 60 && y < 70 && x > 20 && x < 60) c = [150, 20, 150] // 阴影：色相相同、更暗
      const d = Math.hypot(x - 40, y - 35)
      if (d < 22) c = [20, 20, 20] // 描边
      if (d < 19) c = [60, 200, 80] // 角色
      if (Math.hypot(x - 40, y - 35) < 5) c = [255, 0, 255] // 被围住的背景色
      if (Math.abs(d - 22) < 0.5) c = [138, 10, 138] // 抗锯齿：一半描边一半背景
      data.set([c[0]!, c[1]!, c[2]!, 255], o)
    }
  }
  return { data, width: w, height: h }
}

const alphaAt = (img: { data: Uint8Array | Buffer; width: number }, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]!

describe('chromaKey', () => {
  it('去掉背景和背景上的阴影、被围住的背景色；角色不动；裁掉透明边', () => {
    const out = chromaKey(synthetic(), '#FF00FF')
    // 裁边：圆的范围 40 ± 22 加 2 像素，阴影被抠掉了所以不算进来
    expect([out.width, out.height]).toEqual([49, 49])
    const ox = 40 - 24 // 裁剪后的坐标偏移
    const oy = 35 - 24
    expect(alphaAt(out, 40 - ox, 35 - 12 - oy)).toBe(255) // 角色身上
    expect(alphaAt(out, 40 - ox, 35 - oy)).toBe(0) // 被围住的背景色
    const g = out.data[((35 - 12 - oy) * out.width + (40 - ox)) * 4 + 1]
    expect(g).toBe(200) // 角色颜色不变
  })

  it('抗锯齿边缘：半透明，去掉背景色的溢色', () => {
    const out = chromaKey(synthetic(), '#FF00FF')
    // 找一个半透明的像素：颜色里不应该还有明显的品红
    let found = false
    for (let i = 0; i < out.width * out.height; i++) {
      const a = out.data[i * 4 + 3]!
      if (a > 0 && a < 255) {
        found = true
        const [r, g, b] = [out.data[i * 4]!, out.data[i * 4 + 1]!, out.data[i * 4 + 2]!]
        expect(Math.min(r, b) - g).toBeLessThan(40)
      }
    }
    expect(found).toBe(true)
  })

  it('背景色选错（整张图都被当成背景）或太灰时报错', () => {
    const plain = { data: new Uint8Array(4 * 4 * 4).fill(255).map((v, i) => (i % 4 === 1 ? 0 : v)), width: 4, height: 4 }
    expect(() => chromaKey(plain, '#FF00FF')).toThrow(/fully transparent/)
    expect(() => chromaKey(plain, '#808080')).toThrow(/too gray/)
    expect(() => parseHex('magenta')).toThrow(/bad color/)
  })
})

describe('打包出的图集', () => {
  it('引擎的 atlas() 能读；身体的锚点在脚底（精灵底边在节点原点）、高度是显示尺寸的 2 倍；武器带握持点', () => {
    const data = JSON.parse(readFileSync(new URL('../public/assets/heroes.json', import.meta.url), 'utf8'))
    const a = atlas('heroes.png', data)
    for (const hero of ['archer', 'mage', 'knight']) {
      const body = a.get(`${hero}_body`)
      expect(body.pivot!.equals({ x: 0.5, y: 1 } as never)).toBe(true)
      const s = new Sprite2D({ texture: body })
      expect([s.rect!.bottom, s.rect!.height]).toEqual([0, 280])
    }
    // 握持点：剑在剑柄、法杖偏下；弓在正中间（引擎把正中心当作没有锚点）
    expect([a.get('knight_weapon').pivot!.y, a.get('mage_weapon').pivot!.y, a.get('archer_weapon').pivot]).toEqual([0.86, 0.62, null])
  })
})
