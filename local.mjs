
import { info } from 'console'
import { isIP, createServer } from 'net'
import http from 'http'
import https from 'https'
import colors from 'colors'
import QRCode from 'qrcode'
import WebSocket, { createWebSocketStream } from 'ws'
import DnsOverHttpResolver from 'dns-over-http-resolver'
import { loadFile, parseJSON } from './helper.mjs'
import { error, warn, debug } from './helper.mjs'

const CONFIG = './config.json';

(async () => {
  info(loadFile('banner.txt'))

  const config = parseJSON(loadFile(CONFIG))
  if (config === null) {
    error(`failed to load '${CONFIG}' config`)
    process.exit(1)
  }

  global.verbose = config.verbose
  const url = getURL(config)
  info(await QRCode.toString(url, { type: 'terminal', errorCorrectionLevel: 'L', small: true }))
  info(`${url.underline}\n`)

  const timeout = config.timeout
  const parsed = new URL(config.remote_address)
  const hostname = parsed.hostname
  const protocol = parsed.protocol
  const options = {
    timeout,
    origin: config.remote_address, // for ws
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:96.0) Gecko/20100101 Firefox/96.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
      'Accept-Encoding': 'gzip, deflate, br'
    }
  }

  if (isIP(hostname)) {
    info(`server running on host '${hostname}'`)
    start(protocol, hostname, config.local_port, options)
    return
  }

  options.headers.Host = hostname
  options.servername = hostname // for tls

  if (isIP(config.lookup)) {
    info(`server running on host '${hostname}' (${config.lookup})`)
    start(protocol, config.lookup, config.local_port, options)
    return
  }

  info(`resolving ${hostname}...`)
  const resolver = new DnsOverHttpResolver()
  resolver.setServers([config.dns])
  let resolved4 = [], resolved6 = [], resolved = []
  try {
    resolved4 = await resolver.resolve4(hostname)
  } catch (err) {
    warn(err.message)
  }
  try {
    resolved6 = await resolver.resolve6(hostname)
  } catch (err) {
    warn(err.message)
  }
  resolved = [...resolved4, ...resolved6]
  if (resolved.length === 0) {
    error(`failed to resolve host '${hostname}'`)
    process.exit(1)
  }
  if (verbose) debug(resolved)

  let min = Infinity, addr = null
  for (const record of resolved) {
    const atyp = isIP(record)
    if (atyp) {
      info(`trying ${record}...`)
      options.host = record
      let t = Date.now()
      const retval = await attempt(protocol, options)
      t = Date.now() - t
      if (retval) {
        info(`succeeded in ${t}ms`.gray)
        if (t < min) { min = t; addr = record }
        continue
      }
      info('failed'.gray)
    }
  }
  if (addr === null) {
    error('something bad happened')
    process.exit(1)
  }

  info(`server running on host '${hostname}' (${addr})`)
  start(protocol, addr, config.local_port, options)
})()

function getURL (config) {
  const userinfo = Buffer.from(config.method + ':' + config.password).toString('base64')
  return 'ss://' + userinfo + '@' + config.local_address + ':' + config.local_port
}

function attempt (protocol, options) {
  return new Promise((resolve, reject) => {
    const req = (protocol === 'https:' ? https : http).request(options, (res) => {
      if (res.headers['set-cookie']) {
        if (verbose) debug(res.headers['set-cookie'])
        options.headers.cookie = res.headers['set-cookie'][0].split(';')[0]
      }
      if (verbose) {
        res.setEncoding('utf8')
        res.once('data', (chunk) => {
          debug(res.headers['content-encoding'] ? 'zipped'.gray : chunk.gray)
          resolve(true)
        })
      } else {
        resolve(true)
      }
    })

    req.on('timeout', () => {
      req.destroy(new Error('timeout')) // 'error' event will be called
    })

    req.on('error', (err) => {
      warn(err.message)
      resolve(false)
    })

    req.end()
  })
}

function start (protocol, remote_host, local_port, options) {
  const prefix = protocol === 'https:' ? 'wss://' : 'ws://'
  const remote_address = prefix + remote_host

  const server = createServer()
  server.on('connection', (client) => {
    if (verbose) debug(`client connected: ${client.remoteAddress}:${client.remotePort}`)

    let wss = null
    const ws = new WebSocket(remote_address, options)
    ws.on('unexpected-response', (req, res) => {
      error('unexpected response, please check your server and try again.')
      process.exit(1)
    })
    ws.on('open', () => {
      if (verbose) debug('connection opened')
      wss = createWebSocketStream(ws)
      wss.pipe(client)
      client.pipe(wss)
      wss.on('error', (err) => {
        error(err.message)
      })
    })
    ws.on('error', (err) => {
      error(err.message)
    })
    ws.on('close', () => {
      if (verbose) debug('connection closed')
      wss?.destroy()
      if (!client.destroyed) client.destroy()
    })

    client.on('error', (err) => {
      error(err.message)
    })
    client.on('close', () => {
      if (verbose) debug('client disconnected')
      wss?.destroy()
      ws.terminate()
    })
  })

  server.on('error', (err) => {
    error(err.message)
    process.exit(1)
  })

  server.listen(local_port, () => {
    info(`listening on port ${local_port}, press Ctrl+C to stop`.green)
  })
}
