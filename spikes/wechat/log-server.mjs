// 本地日志接收服务：spike 用 wx.request 把报告和报错发到这里，追加写入 spike-log.jsonl
import { createServer } from 'node:http'
import { appendFileSync } from 'node:fs'

createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    if (req.method === 'POST') appendFileSync('spike-log.jsonl', JSON.stringify({ t: new Date().toISOString(), body }) + '\n')
    res.end('ok')
  })
}).listen(7777, '0.0.0.0', () => console.log('log server on 0.0.0.0:7777'))
