
import 'colors'
import { isIP, createServer } from 'net'
import http from 'http'
import https from 'https'
import { toString } from 'qrcode'
import WebSocket, { createWebSocketStream } from 'ws'
import DnsOverHttpResolver from 'dns-over-http-resolver'
import { info as infolog } from 'console'
import { loadFile, parseJSON, errorlog, warnlog, debuglog } from './helper.mjs'

(async () => {
  infolog(loadFile('banner.txt'))

  const config = parseJSON(loadFile('./config.json'))
  if (config === null) {
    errorlog('failed to load config.json')
    process.exit(1)
  }

  const url = getURL(config)
  infolog(await toString(url, { type: 'terminal', errorCorrectionLevel: 'L', small: true }))
  infolog(`${url.underline}\n`)

  const timeout = config.timeout
  const parsed = new URL(config.server)
  const hostname = parsed.hostname
  const protocol = parsed.protocol
  const options = {
    timeout,
    origin: config.server, // for ws
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:100.0) Gecko/20100101 Firefox/100.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
      'Accept-Encoding': 'gzip, deflate, br'
    }
  }

  if (isIP(hostname)) {
    infolog(`server running on host '${hostname}'`)
    start(protocol, hostname, config.local_port, options)
    return
  }

  options.headers.Host = hostname
  options.servername = hostname // for tls

  if (isIP(config.lookup)) {
    infolog(`server running on host '${hostname}' (${config.lookup})`)
    start(protocol, config.lookup, config.local_port, options)
    return
  }

  infolog(`resolving ${hostname}...`)
  const resolver = new DnsOverHttpResolver()
  resolver.setServers([config.lookup])
  let resolved4 = [], resolved6 = [], resolved = []
  try {
    resolved4 = await resolver.resolve4(hostname)
  } catch (err) {
    warnlog(err.message)
  }
  try {
    resolved6 = await resolver.resolve6(hostname)
  } catch (err) {
    warnlog(err.message)
  }
  resolved = [...resolved4, ...resolved6]
  if (resolved.length === 0) {
    errorlog(`failed to resolve host '${hostname}'`)
    process.exit(1)
  }
  debuglog(resolved)

  let min = Infinity, addr = null
  for (const record of resolved) {
    const atyp = isIP(record)
    if (atyp) {
      infolog(`trying ${record}...`)
      options.host = record
      let t = Date.now()
      const msg = await attempt(protocol, options)
      t = Date.now() - t
      if (msg === 'OK') {
        infolog(`connected ${record} in ${t}ms`.gray)
        if (t < min) { min = t; addr = record }
        continue
      }
      infolog(`failed to connect to ${record}: ${msg}`.gray)
    }
  }
  if (addr === null) {
    errorlog('failed to connect to server')
    process.exit(1)
  }

  infolog(`server running on host '${hostname}' (${addr})`)
  start(protocol, addr, config.local_port, options)
})()

function getURL(config) {
  const userinfo = Buffer.from(config.method + ':' + config.password).toString('base64')
  return 'ss://' + userinfo + '@' + config.local_address + ':' + config.local_port
}

function attempt(protocol, options) {
  return new Promise((resolve, reject) => {
    const req = (protocol === 'https:' ? https : http).request(options, (res) => {
      resolve(res.statusMessage)
    })

    req.on('timeout', () => {
      req.destroy(new Error('timeout')) // 'error' event will be called
    })

    req.on('error', (err) => {
      resolve(err.message)
    })

    req.end()
  })
}

function start(protocol, remote_host, local_port, options) {
  const prefix = protocol === 'https:' ? 'wss://' : 'ws://'
  const server_addr = prefix + remote_host

  const server = createServer()
  server.on('connection', (client) => {
    debuglog(`client connected: ${client.remoteAddress}:${client.remotePort}`)

    let wss = null
    const ws = new WebSocket(server_addr, options)
    ws.on('unexpected-response', (req, res) => {
      debuglog(`HTTP response status code: ${res.statusCode}`)
      if (res.statusCode === 429) return
      errorlog(`unexpected response received from server`)
      process.exit(1)
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
    process.exit(1)
  })

  server.listen(local_port, () => {
    infolog(`local listening on 0.0.0.0:${local_port}`)
    infolog('press Ctrl+C to stop'.green)
  })
}
