// 分包实验：启动后自动跑完所有检查，结果发到局域网日志服务（tag 'spike'），屏幕上也显示进度。
// 问题清单见 .scratch/wechat-subpackages/issues/01-subpackage-spike.md
var LOG_URL = __LOG_URL__
var DELAY = __DELAY__
var BIG_COUNT = __BIG_COUNT__
var BUILD = __BUILD__

function send(tag, data) {
  try {
    wx.request({ url: LOG_URL, method: 'POST', data: JSON.stringify({ tag: tag, data: data, t: Date.now() }), fail: function () {} })
  } catch (e) {}
}
function report(step, data) {
  console.log('[spike]', step, JSON.stringify(data))
  send('spike', { step: step, data: data })
}
wx.onError && wx.onError(function (e) { report('uncaught', { message: e && e.message, stack: e && e.stack }) })

// ---------------------------------------------------------------- 画面：每帧画进度条和一个转圈的方块，统计帧间隔

var canvas = wx.createCanvas()
var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
canvas.width = info.windowWidth * info.pixelRatio
canvas.height = info.windowHeight * info.pixelRatio
var ctx = canvas.getContext('2d')
var progress = 0
var status = 'boot'
var lines = []
var frames = 0
var maxGap = 0
var last = Date.now()
var logo = null

function frame() {
  var now = Date.now()
  var gap = now - last
  last = now
  frames++
  if (gap > maxGap) maxGap = gap
  var s = info.pixelRatio
  ctx.fillStyle = '#202830'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (logo) ctx.drawImage(logo, canvas.width / 2 - 40 * s, 120 * s, 80 * s, 80 * s)
  ctx.save()
  ctx.translate(canvas.width / 2, 260 * s)
  ctx.rotate(frames / 20)
  ctx.fillStyle = '#ffcc33'
  ctx.fillRect(-15 * s, -15 * s, 30 * s, 30 * s)
  ctx.restore()
  ctx.fillStyle = '#444'
  ctx.fillRect(40 * s, 320 * s, canvas.width - 80 * s, 10 * s)
  ctx.fillStyle = '#fff'
  ctx.fillRect(40 * s, 320 * s, (canvas.width - 80 * s) * progress, 10 * s)
  ctx.font = 14 * s + 'px sans-serif'
  ctx.fillText(status, 40 * s, 360 * s)
  for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], 40 * s, (390 + i * 22) * s)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

function show(text) {
  lines.push(text)
  if (lines.length > 18) lines.shift()
}

// ---------------------------------------------------------------- 工具

function loadImage(src) {
  return new Promise(function (resolve) {
    var t0 = Date.now()
    var img = wx.createImage()
    img.onload = function () { resolve({ ok: true, w: img.width, h: img.height, ms: Date.now() - t0, img: img }) }
    img.onerror = function (e) { resolve({ ok: false, err: safe(e), ms: Date.now() - t0 }) }
    img.src = src
  })
}
function readFile(path, encoding) {
  return new Promise(function (resolve) {
    var opts = { filePath: path, success: function (r) { resolve({ ok: true, size: typeof r.data === 'string' ? r.data.length : r.data.byteLength, data: typeof r.data === 'string' ? r.data.slice(0, 60) : undefined, raw: r.data }) }, fail: function (e) { resolve({ ok: false, err: safe(e) }) } }
    if (encoding) opts.encoding = encoding
    wx.getFileSystemManager().readFile(opts)
  })
}
function innerAudio(src) {
  return new Promise(function (resolve) {
    var a = wx.createInnerAudioContext()
    var done = function (r) { clearTimeout(timer); a.destroy(); resolve(r) }
    var timer = setTimeout(function () { done({ ok: false, err: 'timeout 5s' }) }, 5000)
    a.onCanplay(function () { done({ ok: true, duration: a.duration }) })
    a.onError(function (e) { done({ ok: false, err: safe(e) }) })
    a.src = src
  })
}
function webAudioDecode(path) {
  return readFile(path).then(function (r) {
    if (!r.ok) return { ok: false, step: 'readFile', err: r.err }
    return new Promise(function (resolve) {
      var ac = wx.createWebAudioContext()
      ac.decodeAudioData(r.raw, function (buf) { resolve({ ok: true, duration: buf.duration }) }, function (e) { resolve({ ok: false, step: 'decode', err: safe(e) }) })
    })
  })
}
function safe(v) {
  try { return JSON.parse(JSON.stringify(v)) } catch (e) { return String(v) }
}
function strip(r) {
  var o = {}
  for (var k in r) if (k !== 'img' && k !== 'raw') o[k] = r[k]
  return o
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

function loadSubpackage() {
  return new Promise(function (resolve) {
    var t0 = Date.now()
    var f0 = frames
    maxGap = 0
    var events = []
    var task = wx.loadSubpackage({
      name: 'pkg',
      success: function (r) { resolve({ ok: true, res: safe(r), ms: Date.now() - t0, framesDuring: frames - f0, maxFrameGapMs: maxGap, progressEvents: events.length, firstEvents: events.slice(0, 3), lastEvent: events[events.length - 1] }) },
      fail: function (e) { resolve({ ok: false, err: safe(e), ms: Date.now() - t0, framesDuring: frames - f0, progressEvents: events.length, lastEvent: events[events.length - 1] }) },
    })
    report('loadSubpackage-task', { hasTask: !!task, hasOnProgress: !!(task && task.onProgressUpdate) })
    if (task && task.onProgressUpdate) {
      task.onProgressUpdate(function (p) {
        events.push(safe(p))
        progress = (p.progress || 0) / 100
        status = 'subpackage ' + (p.progress || 0) + '%  ' + (p.totalBytesWritten || 0) + '/' + (p.totalBytesExpectedToWrite || 0)
      })
    }
  })
}

// ---------------------------------------------------------------- 检查

async function run() {
  var launches = (wx.getStorageSync('spikeLaunches') || 0) + 1
  wx.setStorageSync('spikeLaunches', launches)
  var sys = wx.getSystemInfoSync()
  report('boot', { build: BUILD, launches: launches, platform: sys.platform, system: sys.system, SDKVersion: sys.SDKVersion, version: sys.version, brand: sys.brand, model: sys.model })
  show('launch #' + launches + '  ' + sys.platform + ' ' + sys.SDKVersion)

  var l = await loadImage('boot/logo.png')
  logo = l.img || null
  report('main-image', strip(l))

  // 3：分包加载之前读分包里的文件
  var before = {
    image: strip(await loadImage('pkg/img.png')),
    readFile: strip(await readFile('pkg/data.json', 'utf8')),
  }
  report('before-load', before)
  show('before load: image ' + before.image.ok + ', readFile ' + before.readFile.ok)

  if (DELAY) {
    for (var i = DELAY; i > 0; i--) {
      status = 'loading subpackage in ' + i + 's (switch network off now to test failure)'
      await sleep(1000)
    }
  }

  // 4、5、6：下载期间的帧、进度事件、缓存、失败
  status = 'loading subpackage…'
  var r = await loadSubpackage()
  report('loadSubpackage', r)
  show('loadSubpackage ' + (r.ok ? 'ok' : 'FAIL') + ' ' + r.ms + 'ms, ' + r.framesDuring + ' frames, ' + r.progressEvents + ' progress events')
  if (!r.ok) {
    status = 'failed; retrying in 3s'
    await sleep(3000)
    var retry = await loadSubpackage()
    report('loadSubpackage-retry', retry)
    show('retry ' + (retry.ok ? 'ok' : 'FAIL') + ' ' + retry.ms + 'ms')
    if (!retry.ok) { status = 'retry failed'; report('done', {}); return }
  }
  progress = 1
  report('entry', { pkgEntryRan: GameGlobal.__pkgEntryRan || null })

  // 2：分包里的各种文件
  var after = {
    image: strip(await loadImage('pkg/img.png')),
    imageLeadingSlash: strip(await loadImage('/pkg/img.png')),
    big: strip(await loadImage('pkg/big-0.png')),
    readFileUtf8: strip(await readFile('pkg/data.json', 'utf8')),
    readFileBinary: strip(await readFile('pkg/sfx.mp3')),
    innerAudio: await innerAudio('pkg/sfx.mp3'),
    webAudio: await webAudioDecode('pkg/sfx.mp3'),
    access: (function () { try { wx.getFileSystemManager().accessSync('pkg/data.json'); return 'ok' } catch (e) { return safe(e) } })(),
    stat: (function () { try { return safe(wx.getFileSystemManager().statSync('pkg/big-0.png')) } catch (e) { return safe(e) } })(),
  }
  report('after-load', after)
  for (var k in after) show(k + ': ' + (after[k] && after[k].ok !== undefined ? after[k].ok : JSON.stringify(after[k]).slice(0, 40)))

  // 再调一次：已经加载过时的表现
  var again = await loadSubpackage()
  report('loadSubpackage-again', again)
  show('again ' + (again.ok ? 'ok' : 'FAIL') + ' ' + again.ms + 'ms')

  status = 'done (launch #' + launches + ', ' + BIG_COUNT + ' big png)'
  report('done', { launches: launches })
}

run().catch(function (e) { report('crash', { message: e && e.message, stack: e && e.stack }) })
