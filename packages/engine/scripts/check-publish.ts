// 发布前检查（prepublishOnly 的第一步）：必须用 pnpm 发布。
// package.json 的 exports 指向 src/（仓库内的示例直接用源码），publishConfig.exports 指向 dist/；
// 只有 pnpm 发布时会用 publishConfig 替换 exports，npm 不会——用 npm 发出去的包 exports 指向不存在的 src/，装上就找不到模块（0.2.1 就是这样坏的）。
// npm 和 pnpm 运行生命周期脚本时都会设置 npm_config_user_agent（"pnpm/10.30.1 npm/? node/…" 或 "npm/10.9.0 node/…"）。
const agent = process.env.npm_config_user_agent ?? ''
if (!agent.startsWith('pnpm/')) {
  console.error(
    `\n✗ sapling2d must be published with pnpm (got: ${agent || 'unknown'}).\n` +
      '  npm ignores publishConfig.exports, so the package would point at src/ files it does not contain.\n' +
      '  Run: pnpm publish   (in packages/engine)\n',
  )
  process.exit(1)
}
