export { Node, type NodeOptions, type DumpNode, type ProcessMode } from './core/Node'
export { Node2D, type Node2DOptions } from './core/Node2D'
export { Scene, type SceneClass, type SceneConstructor } from './core/Scene'
export { SceneTree, type SceneTreeOptions, type DumpOptions, type NodeClass } from './core/SceneTree'
export { Vector2, v } from './math/Vector2'
export { Rect2, rect } from './math/Rect2'
export { Viewport, MAX_RENDER_RESOLUTION, type StretchAspect, type DesignResolution, type ScreenInfo } from './core/Viewport'
export { RandomNumberGenerator } from './math/RandomNumberGenerator'
export type { Platform } from './platform/Platform'
export { HeadlessPlatform } from './platform/HeadlessPlatform'
export { Signal, type SignalResult } from './core/Signal'
export { Tween, type TweenProps, type TweenableKey } from './core/Tween'
export { Ease, type EaseFn } from './math/ease'
export { Timer, SceneTreeTimer, type TimerOptions } from './nodes/Timer'
export { Input, key, pointerPress, type InputBinding, type RawInputEvent } from './core/Input'
export type { ActionName } from './core/actions'
export type { PointerEvent2D, CircleHitArea } from './core/pointer'
export { Transform2D } from './math/Transform2D'
export type { GroupName, GroupNodeType } from './core/groups'

/**
 * 组名注册表。用声明合并给组名加类型（见 GroupName）：
 *
 * ```ts
 * declare module 'sapling2d' {
 *   interface GroupRegistry { fruits: Fruit }
 * }
 * ```
 */
export interface GroupRegistry {}
export { Sprite2D, type Sprite2DOptions } from './nodes/Sprite2D'
export { AnimatedSprite2D, type AnimatedSprite2DOptions, type SpriteAnimation } from './nodes/AnimatedSprite2D'
export { TileMapLayer, type TileMapLayerOptions } from './nodes/TileMapLayer'
export { CharacterBody2D, type CharacterBody2DOptions, type SlideCollision } from './nodes/CharacterBody2D'
export { Camera2D, type Camera2DOptions } from './nodes/Camera2D'
export { CanvasLayer, type CanvasLayerOptions } from './nodes/CanvasLayer'
export { TouchScreenButton, type TouchScreenButtonOptions } from './nodes/TouchScreenButton'
export { TileSet, tileset, type TileSetOptions, type TileOptions, type TileData, type TileCollision } from './core/tileset'
export { TiledMap, tiledMap, type TiledObject, type TiledObjectLayer } from './core/tiled'
export { CollisionObject2D, type CollisionObject2DOptions } from './nodes/physics/CollisionObject2D'
export { PhysicsBody2D, StaticBody2D, type PhysicsBody2DOptions } from './nodes/physics/PhysicsBody2D'
export { Area2D, type Area2DOptions } from './nodes/physics/Area2D'
export { RigidBody2D, type RigidBody2DOptions } from './nodes/physics/RigidBody2D'
export { CollisionShape2D, type CollisionShape2DOptions } from './nodes/physics/CollisionShape2D'
export { CircleShape2D, RectangleShape2D, ConvexPolygonShape2D, circle, rectangle, polygon, MAX_POLYGON_VERTICES, type Shape2D } from './physics/shapes'
export { PhysicsWorld, type PhysicsSettings } from './physics/PhysicsWorld'
export { HitTester, type Hittable } from './physics/HitTester'
export { Label, type LabelOptions, type LabelStroke, type HorizontalAlignment, type VerticalAlignment } from './nodes/Label'
export { Texture, tex, SpriteSheet, sheet, Atlas, atlas, type AssetMap, type AtlasData, type AtlasFrameData } from './core/assets'
export { AudioStream, sfx, music } from './audio/AudioStream'
export { Storage } from './storage/Storage'
export { MemoryStorageBackend, type StorageBackend } from './storage/backend'
export { AudioServer, Voice, type AudioBus, type PlayOptions } from './audio/AudioServer'
export type { AudioBackend, SoundHandle } from './audio/backend'
export type { PlayedSound } from './audio/HeadlessAudio'
export { AudioStreamPlayer, type AudioStreamPlayerOptions } from './nodes/AudioStreamPlayer'
export { Game, type GameOptions, type Renderer } from './runtime/Game'
export type { LoadedImage } from './platform/Platform'

/**
 * 输入动作注册表。用声明合并给动作名加类型（见 ActionName）：
 *
 * ```ts
 * declare module 'sapling2d' {
 *   interface ActionRegistry { drop: true }
 * }
 * ```
 */
export interface ActionRegistry {}

/**
 * 存储注册表。用声明合并给存储的 key 和值加类型：
 *
 * ```ts
 * declare module 'sapling2d' {
 *   interface StorageRegistry { highScore: number }
 * }
 * ```
 */
export interface StorageRegistry {}
