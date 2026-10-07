// 局域网日志服务：接收小游戏转发的 console 输出和错误。
// 构建时设置 SAPLING_LOG_URL=http://<电脑的局域网 IP>:7777/log（模拟器可以用 127.0.0.1）
import { startLogServer } from 'sapling2d/vite'

startLogServer({ port: 7777, file: 'logs/wechat.jsonl' })
console.log('log server on :7777 (logs/wechat.jsonl)')
