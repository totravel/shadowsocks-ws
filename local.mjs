
import { exit } from 'node:process'
import { readFileSync } from 'node:fs'
import { isIP, createServer } from 'node:net'

import { toString } from 'qrcode'
import WebSocket, { createWebSocketStream } from 'ws'

import { debuglog, infolog, warnlog, errorlog, lookup } from './util.mjs'


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


console.log(readFileSync('./banner.txt'))
const config = JSON.parse(readFileSync('./config.json'))


if (config.show_qrcode || config.show_url) {
  const userinfo = Buffer.from(config.method + ':' + config.password).toString('base64')
  const ssUrl = 'ss://' + userinfo + '@' + config.local_address + ':' + config.local_port

  if (config.show_qrcode) {
    console.log(await toString(ssUrl, { type: 'terminal', errorCorrectionLevel: 'L', small: true }))
  }
  if (config.show_url) {
    infolog(`URL: ${ssUrl.underline}`)
  }
}


const homeUrl = new URL(config.server)
infolog(`server: '${homeUrl}'`)


const options = {
  timeout: config.timeout,
  origin: homeUrl.origin,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
    'Accept-Encoding': 'gzip, deflate, br'
  }
}

// TLS fingerprinting
// https://www.openssl.org/docs/man1.1.1/man1/ciphers.html#CIPHER-SUITE-NAMES
options.ciphers = [
  'TLS_AES_128_GCM_SHA256',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-AES256-SHA',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'TLS_AES_256_GCM_SHA384',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'AES256-SHA',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'AES256-GCM-SHA384',
  'ECDHE-ECDSA-AES128-SHA',
  'AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
].join(':')


const serverUrl = new URL(homeUrl)
const IS_HTTPS = serverUrl.protocol === 'https:'
serverUrl.protocol = IS_HTTPS ? 'wss:' : 'ws:'

let address = []
if (isIP(serverUrl.hostname)) {
  address.push(serverUrl.hostname)
} else {
  options.headers.Host = serverUrl.hostname
  options.servername = serverUrl.hostname // for SNI (Server Name Indication) TLS extension

  if (config.server_address.length > 0) {
    address = config.server_address
  } else {
    try {
      infolog(`nameserver: '${config.nameserver}'`)
      infolog(`resolving ${serverUrl.hostname}...`)
      address = await lookup(serverUrl.hostname, config.nameserver)
    } catch (err) {
      errorlog(`failed to resolve hostname: ${err.message}`)
      exit(1)
    }
  }
}


const checkUrl = new URL('/generate_204', homeUrl)
const { request } = IS_HTTPS
  ? await import('node:https')
  : await import('node:http')

let elapsed = Infinity
for (const addr of address) {
  try {
    infolog(`trying ${addr}...`)
    checkUrl.hostname = addr
    const start = Date.now()
    await new Promise((resolve, reject) => {
      const req = request(checkUrl, options, (res) => {
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
