
import { isIP, createServer } from 'net'
import http from 'http'
import https from 'https'
import colors from 'colors'
import QRCode from 'qrcode'
import WebSocket, { createWebSocketStream } from 'ws'
import DnsOverHttpResolver from 'dns-over-http-resolver'
import { loadFile, parseJSON } from './helper.mjs'

const CONFIG = './config.json';

(async () => {
  console.clear()
  console.info(loadFile('banner.txt'))

  const config = parseJSON(loadFile(CONFIG))
  if (config === null) {
    console.error(`failed to load '${CONFIG}' config`.red)
    process.exit(1)
  }

  global.verbose = config.verbose
  const url = getURL(config)
  console.info(await QRCode.toString(url, { type: 'terminal', errorCorrectionLevel: 'L', small: true }))
  console.info(`${url.underline}\n`)

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
    console.info(`server running on host '${hostname}'`)
    start(protocol, hostname, config.local_port, options)
    return
  }

  options.headers.Host = hostname
  options.servername = hostname // for tls

  if (isIP(config.lookup)) {
    console.info(`server running on host '${hostname}' (${config.lookup})`)
    start(protocol, config.lookup, config.local_port, options)
    return
  }

  console.info(`resolving ${hostname}...`)
  const resolver = new DnsOverHttpResolver()
  resolver.setServers([config.dns])
  let resolved4 = [], resolved6 = [], resolved = []
  try {
    resolved4 = await resolver.resolve4(hostname)
  } catch (err) {
    console.warn(err.message.yellow)
  }
  try {
    resolved6 = await resolver.resolve6(hostname)
  } catch (err) {
    console.warn(err.message.yellow)
  }
  resolved = [...resolved4, ...resolved6]
  if (resolved.length === 0) {
    console.error(`failed to resolve host '${hostname}'`.red)
    process.exit(1)
  }
  if (verbose) console.debug(resolved)

  let min = Infinity, addr = null
  for (const record of resolved) {
    const atyp = isIP(record)
    if (atyp) {
      console.info(`trying ${record}...`)
      options.host = record
      let t = Date.now()
      const retval = await attempt(protocol, options)
      t = Date.now() - t
      if (retval) {
        console.info(`succeeded in ${t}ms`.gray)
        if (t < min) { min = t; addr = record }
        continue
      }
      console.info('failed'.gray)
    }
  }
  if (addr === null) {
    console.error('something bad happened'.red)
    process.exit(1)
  }

  console.info(`server running on host '${hostname}' (${addr})`)
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
        if (verbose) console.debug(res.headers['set-cookie'])
        options.headers.cookie = res.headers['set-cookie'][0].split(';')[0]
      }
      if (verbose) {
        res.setEncoding('utf8')
        res.once('data', (chunk) => {
          console.debug(res.headers['content-encoding'] ? 'zipped'.gray : chunk.gray)
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
      console.error(err.message.yellow)
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
    if (verbose) console.debug(`client connected: ${client.remoteAddress}:${client.remotePort}`)

    let wss = null
    const ws = new WebSocket(remote_address, options)
    ws.on('unexpected-response', (err) => {
      console.error('unexpected response, please check your server and try again.'.red)
      process.exit(1)
    })
    ws.on('open', () => {
      if (verbose) console.debug('connection opened')
      wss = createWebSocketStream(ws)
      wss.pipe(client)
      client.pipe(wss)
      wss.on('error', (err) => {
        console.error(err.message.red)
      })
    })
    ws.on('error', (err) => {
      console.error(err.message.red)
    })
    ws.on('close', () => {
      if (verbose) console.debug('connection closed')
      wss?.destroy()
      if (!client.destroyed) client.destroy()
    })

    client.on('error', (err) => {
      console.error(err.message.red)
    })
    client.on('close', () => {
      if (verbose) console.debug(`client disconnected`)
      wss?.destroy()
      ws.terminate()
    })
  })

  server.on('error', (err) => {
    console.error(err.message.red)
    process.exit(1)
  })

  server.listen(local_port, () => {
    console.info(`listening on port ${local_port}`.green)
  })
}
