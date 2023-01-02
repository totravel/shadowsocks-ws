
import { exit } from 'node:process'
import http from 'node:http'
import https from 'node:https'
import { isIP, createServer } from 'node:net'
import { toString } from 'qrcode'
import WebSocket, { createWebSocketStream } from 'ws'
import { debuglog, infolog, warnlog, errorlog, readFile, lookup } from './util.mjs'

function makeSsUrl(method, password, local_address, local_port) {
  const userinfo = Buffer.from(method + ':' + password).toString('base64')
  return 'ss://' + userinfo + '@' + local_address + ':' + local_port
}

function checkServer(url, options) {
  return new Promise((resolve, reject) => {
    const { request } = url.protocol === 'https:' ? https : http
    const req = request(url, options, (res) => {
      if (res.statusCode === 204) {
        resolve()
      } else {
        reject(new Error(`unexpected response: ${res.statusCode}`))
      }
    })
    req.on('timeout', () => req.destroy(new Error('timeout'))) // 'error' event will be called
    req.on('error', reject)
    req.end()
  })
}

function startServer(url, options, localPort) {
  const server = createServer()
  server.on('connection', (client) => {
    debuglog(`client connected: ${client.remoteAddress}:${client.remotePort}`)

    let wss = null
    const ws = new WebSocket(url, options)
    ws.on('unexpected-response', (req, res) => {
      if (res.statusCode === 429) return
      errorlog(`unexpected response (${res.statusCode})`)
      exit(1)
    })
    ws.on('open', () => {
      debuglog('connection opened')
      wss = createWebSocketStream(ws)
      wss.pipe(client)
      client.pipe(wss)
      wss.on('error', (err) => errorlog(err.message))
    })
    ws.on('error', (err) => errorlog(err.message))
    ws.on('close', () => {
      debuglog('connection closed')
      wss?.destroy()
      if (!client.destroyed) client.destroy()
    })

    client.on('error', (err) => errorlog(err.message))
    client.on('close', () => {
      debuglog('client disconnected')
      wss?.destroy()
      ws.terminate()
    })
  })

  server.on('error', (err) => {
    errorlog(err.message)
    exit(1)
  })

  server.listen(localPort, () => {
    infolog(`local server listening on 0.0.0.0:${localPort}`)
    infolog('press Ctrl+C to stop')
  })
}


console.log(readFile('./banner.txt'))

let config = null
try {
  config = JSON.parse(readFile('./config.json'))
} catch (err) {
  errorlog(`failed to load configurations: ${err.message}`)
  exit(1)
}

if (config.show_qrcode || config.show_url) {
  const url = makeSsUrl(config.method, config.password, config.local_address, config.local_port)
  if (config.show_qrcode) {
    console.log(await toString(url, { type: 'terminal', errorCorrectionLevel: 'L', small: true }))
  }
  if (config.show_url) {
    infolog(`URL: ${url.underline}`)
  }
}

const homeUrl = new URL(config.server)
const serverUrl = new URL(homeUrl)
switch (homeUrl.protocol) {
  case 'https:':
    serverUrl.protocol = 'wss:'
    break
  case 'http:':
    serverUrl.protocol = 'ws:'
    break
  default:
    errorlog(`invalid URL: ${config.server}`)
    exit(1)
}

const options = {
  timeout: config.timeout,
  origin: homeUrl.origin,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:100.0) Gecko/20100101 Firefox/100.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
    'Accept-Encoding': 'gzip, deflate, br'
  }
}

let address = []
if (isIP(serverUrl.hostname)) {
  address.push(serverUrl.hostname)
} else {
  options.headers.Host = serverUrl.hostname
  options.servername = serverUrl.hostname // for SNI (Server Name Indication) TLS extension

  if (isIP(config.server_address)) {
    address.push(config.server_address)
  } else {
    try {
      infolog(`resolving ${serverUrl.hostname}...`)
      address = await lookup(serverUrl.hostname, config.nameserver)
    } catch (err) {
      errorlog(`failed to resolve hostname: ${err.message}`)
      exit(1)
    }
  }
}

let elapsed = Infinity
const checkUrl = new URL('/generate_204', homeUrl)
for (const addr of address) {
  try {
    infolog(`trying ${addr}...`)
    checkUrl.hostname = addr
    const start = Date.now()
    await checkServer(checkUrl, options)
    const end = Date.now()
    const t = end - start
    if (t < elapsed) {
      elapsed = t
      serverUrl.hostname = addr
    }
    infolog(`connected ${addr} in ${t}ms`)
  } catch (err) {
    warnlog(`cannot connect to ${addr}: ${err.message}`)
  }
}

if (elapsed < Infinity) {
  infolog(`remote server running on host '${homeUrl.hostname}' (${serverUrl.hostname})`)
  startServer(serverUrl, options, config.local_port)
} else {
  errorlog('server cannot be reached')
}
