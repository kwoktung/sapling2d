import { music, sfx, type AudioServer, type AudioStream } from 'sapling2d'

/**
 * 音效：每个音效的音量和最多同时播几个（`maxVoices`：命中、死亡这类一帧可能触发几十次的要限制）。
 * 文件在 `public/assets/audio/`，来源和授权见那里的 CREDITS.md。路径逐个写成字面量：`sapling2d/vite` 插件才能检查文件在不在。
 */
const SOUNDS = {
  shoot: { stream: sfx('audio/shoot.mp3'), volume: 0.35, max: 3 },
  arrow_hit: { stream: sfx('audio/arrow_hit.mp3'), volume: 0.4, max: 4 },
  fireball: { stream: sfx('audio/fireball.mp3'), volume: 0.35, max: 2 },
  explode: { stream: sfx('audio/explode.mp3'), volume: 0.5, max: 3 },
  freeze: { stream: sfx('audio/freeze.mp3'), volume: 0.5, max: 3 },
  lightning: { stream: sfx('audio/lightning.mp3'), volume: 0.4, max: 2 },
  slash: { stream: sfx('audio/slash.mp3'), volume: 0.5, max: 2 },
  knockback: { stream: sfx('audio/knockback.mp3'), volume: 0.45, max: 2 },
  die: { stream: sfx('audio/die.mp3'), volume: 0.4, max: 4 },
  leak: { stream: sfx('audio/leak.mp3'), volume: 0.6, max: 2 },
  level_up: { stream: sfx('audio/level_up.mp3'), volume: 0.7, max: 1 },
  pick: { stream: sfx('audio/pick.mp3'), volume: 0.6, max: 1 },
  button: { stream: sfx('audio/button.mp3'), volume: 0.7, max: 1 },
  ult_archer: { stream: sfx('audio/ult_archer.mp3'), volume: 0.7, max: 1 },
  ult_mage: { stream: sfx('audio/ult_mage.mp3'), volume: 0.6, max: 1 },
  meteor: { stream: sfx('audio/meteor.mp3'), volume: 0.9, max: 1 },
  ult_knight: { stream: sfx('audio/ult_knight.mp3'), volume: 0.7, max: 1 },
  hero_hit: { stream: sfx('audio/hero_hit.mp3'), volume: 0.5, max: 2 },
  hero_die: { stream: sfx('audio/hero_die.mp3'), volume: 0.8, max: 1 },
  boss: { stream: sfx('audio/boss.mp3'), volume: 0.8, max: 1 },
  win: { stream: sfx('audio/win.mp3'), volume: 0.8, max: 1 },
  lose: { stream: sfx('audio/lose.mp3'), volume: 0.8, max: 1 },
} satisfies Record<string, { stream: AudioStream; volume: number; max: number }>

export type SoundName = keyof typeof SOUNDS

/** 背景音乐（循环）。 */
export const BGM = music('audio/bgm.mp3')
export const BGM_VOLUME = 0.35

/** 场景的 `static assets` 里要带上的音频（音效预解码；音乐流式，声明了也不会预加载）。 */
export const SOUND_ASSETS = Object.fromEntries([...Object.entries(SOUNDS).map(([k, s]) => [`sfx_${k}`, s.stream]), ['bgm', BGM]]) as Record<string, AudioStream>

/** 播一个音效（按上面的音量和并发上限）。 */
export function playSound(audio: AudioServer, name: SoundName): void {
  const s = SOUNDS[name]
  audio.play(s.stream, { volume: s.volume, maxVoices: s.max })
}
