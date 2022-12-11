
import 'colors'
import { createReadStream } from 'fs'
import { createServer } from 'http'
import { hkdfSync, randomBytes } from 'crypto'
import WebSocket, { WebSocketServer } from 'ws'
import { keySize, saltSize, tagSize, AEAD } from './aead.mjs'
import {
  EVP_BytesToKey, connect, inetNtoa, inetNtop,
  errorlog, warnlog, infolog, debuglog
} from './helper.mjs'

const dump = (from, to, stage) => `from=${from.blue} to=${to.cyan} stage=${stage.green}`

const METHOD = process.env.METHOD === 'aes-256-gcm' ? 'aes-256-gcm' : 'chacha20-poly1305'
const PASS   = process.env.PASS    || 'secret'
const PORT   = process.env.PORT    ||  80

const KEY_SIZE  = keySize[METHOD]
const SALT_SIZE = saltSize[METHOD]
const TAG_SIZE  = tagSize[METHOD]

const CLOSED  = 'closed'
const OPENING = 'opening'
const OPEN    = 'open'
const WRITING = 'writing'

const KEY = EVP_BytesToKey(PASS, KEY_SIZE).key

const server = createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html')
  createReadStream('./index.html').pipe(res)
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const from = `${req.socket.remoteAddress}:${req.socket.remotePort}`
  debuglog(`client connected: ${from}`)

  let rx = [], tx = []
  let decipher = null, cipher = null
  let chunkIndex = 0
  let cipherTextSize = 2
  const payloads = []
  let stage = CLOSED
  let to = 'unknown'
  let remote = null

  ws.on('message', async (data) => {
    // retrieve bytes received last time
    if (rx.length > 0) {
      rx.push(data)
      data = Buffer.concat(rx)
      rx = []
    }

    // init decipher
    if (decipher === null) {
      if (data.length < SALT_SIZE) {
        rx.push(data)
        debuglog('more bytes needed')
        return
      }

      const salt = Buffer.alloc(SALT_SIZE)
      data.copy(salt, 0, 0, SALT_SIZE)
      data = data.subarray(SALT_SIZE)

      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      decipher = new AEAD(METHOD, dk)
      debuglog('decipher initialized')
    }

    // decrypt chunks
    while (data.length > 0) {
      const chunkSize = cipherTextSize + TAG_SIZE
      if (data.length < chunkSize) {
        rx.push(data)
        debuglog('more bytes needed')
        break
      }

      const chunk = data.subarray(0, chunkSize)
      data = data.subarray(chunkSize)

      const cipherText = chunk.subarray(0, cipherTextSize)
      const authTag = chunk.subarray(cipherTextSize)
      const plainText = decipher.decrypt(cipherText, authTag)

      if (plainText === null) {
        warnlog('invalid password or cipher', dump(from, to, stage))
        ws.terminate() // 'close' event will be called
        return
      }

      if (chunkIndex % 2 === 0) { // current chunk is length chunk
        cipherTextSize = plainText.readUInt16BE(0)
      } else { // current chunk is payload chunk
        cipherTextSize = 2
        payloads.push(plainText)
        debuglog('payload decrypted')
      }
      chunkIndex++
    }
    data = null

    // consume payloads
    if (payloads.length === 0) {
      return
    }
    if (stage === OPENING || stage === WRITING) {
      return
    }
    if (stage === CLOSED) {
      stage = OPENING

      let addr, port
      let address = payloads.shift()
      switch (address[0]) {
        case 3: // Domain
          addr = address.subarray(2, 2 + address[1]).toString('binary')
          port = address.readUInt16BE(2 + address[1])
          address = address.subarray(4 + address[1])
          break
        case 1: // IPv4
          addr = inetNtoa(address.subarray(1, 5))
          port = address.readUInt16BE(5)
          address = address.subarray(7)
          break
        case 4: // IPv6
          addr = inetNtop(address.subarray(1, 17))
          port = address.readUInt16BE(17)
          address = address.subarray(19)
          break
        default:
          warnlog('invalid atyp', dump(from, to, stage))
          ws.terminate()
          return
      }
      if (address.length != 0) {
        payloads.push(address)
      }
      to = `${addr}:${port}`
      debuglog(`remote address parsed: ${to}`)

      try {
        ws.pause()
        remote = await connect(port, addr)
        ws.resume()
      } catch (err) {
        errorlog(err.message, dump(from, to, stage))
        ws.terminate()
        return
      }
      debuglog('remote connected')

      if (ws.readyState !== WebSocket.OPEN) {
        remote.destroy()
        return
      }

      const salt = randomBytes(SALT_SIZE)
      tx.push(salt)
      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      cipher = new AEAD(METHOD, dk)
      debuglog('cipher initialized')

      remote.on('data', (data) => {
        debuglog('reply received')
        while (data.length > 0) {
          const payload = data.subarray(0, 0x3fff)
          const length = Buffer.alloc(2)
          length.writeUInt16BE(payload.length)
          tx.push(cipher.encrypt(length))
          tx.push(cipher.encrypt(payload))
          data = data.subarray(0x3fff)
        }
        data = null

        remote.pause()
        ws.send(Buffer.concat(tx), () => remote.resume())
        tx = []
      })

      // 'close' event will be called
      remote.on('error', (err) => errorlog(err.message, dump(from, to, stage)))
      remote.on('end', () => remote.end())
      remote.on('close', () => {
        debuglog('remote disconnected')
        if (ws.readyState === WebSocket.OPEN) ws.terminate()
      })
    }

    stage = WRITING
    while (payloads.length !== 0) {
      if (remote.write(payloads.shift()) === false) {
        ws.pause()
        await new Promise(resolve => remote.once('drain', resolve))
        ws.resume()
      }
      debuglog('payload sent')
    }
    stage = OPEN
  })

  ws.on('close', () => {
    debuglog('client disconnected')
    if (remote !== null && !remote.destroyed) remote.destroy()
    decipher = cipher = rx = tx = null
  })
})

server.listen(PORT, () => infolog(`server running at http://0.0.0.0:${PORT}/`))
