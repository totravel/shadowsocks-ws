
import 'colors'
import { createReadStream } from 'fs'
import { createServer } from 'http'
import { hkdfSync, randomBytes } from 'crypto'
import WebSocket, { WebSocketServer } from 'ws'
import { keySize, saltSize, tagSize, AEAD } from './aead.mjs'
import {
  EVP_BytesToKey, createAndConnect, inetNtoa, inetNtop,
  errorlog, warnlog, infolog, debuglog
} from './helper.mjs'

const METHOD = process.env.METHOD === 'aes-256-gcm' ? 'aes-256-gcm' : 'chacha20-poly1305'
const PASS   = process.env.PASS    || 'secret'
const PORT   = process.env.PORT    ||  80

const KEY_SIZE  = keySize[METHOD]
const SALT_SIZE = saltSize[METHOD]
const TAG_SIZE  = tagSize[METHOD]

const PAYLOAD_LENGTH_SIZE = 2
const PAYLOAD_LENGTH_CHUNK_SIZE = 2 + TAG_SIZE

const CLOSED  = 'closed'
const OPENING = 'opening'
const OPEN    = 'open'

const KEY = EVP_BytesToKey(PASS, KEY_SIZE).key

const dump = (from, to, readyState) => `from=${from.blue} to=${to.cyan} readyState=${readyState.green}`

const server = createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html')
  createReadStream('./index.html').pipe(res)
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const from = `${req.socket.remoteAddress}:${req.socket.remotePort}`
  let decipher = null
  let cipher = null
  let rx = [], tx = []
  let pending = false
  let length = 0
  const payloads = []
  let readyState = CLOSED
  let to = 'null'
  let remote = null

  debuglog(`client connected: ${from}`)
  ws.on('message', async (data) => {
    if (decipher === null) {
      const salt = data.slice(0, SALT_SIZE)
      data = data.slice(SALT_SIZE)
      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      decipher = new AEAD(METHOD, dk)
      debuglog('decipher initialized')
    }

    if (rx.length > 0) {
      rx.push(data)
      data = Buffer.concat(rx)
      rx = []

      if (pending) {
        const encryptedPayload = data.slice(0, length)
        const payloadTag = data.slice(length, length + TAG_SIZE)
        data = data.slice(length + TAG_SIZE)
        const payload = decipher.decrypt(encryptedPayload, payloadTag)

        if (payload === null) {
          warnlog('invalid password or cipher', dump(from, to, readyState))
          ws.terminate() // 'close' event will be called
          return
        }

        payloads.push(payload)
        debuglog('payload decrypted')
        pending = false
      }
    }

    while (data.length > 0) {
      if (data.length < PAYLOAD_LENGTH_CHUNK_SIZE) {
        rx.push(data)
        debuglog('no data')
        break
      }

      const encryptedPayloadLength = data.slice(0, PAYLOAD_LENGTH_SIZE)
      const lengthTag = data.slice(PAYLOAD_LENGTH_SIZE, PAYLOAD_LENGTH_CHUNK_SIZE)
      data = data.slice(PAYLOAD_LENGTH_CHUNK_SIZE)
      length = decipher.decrypt(encryptedPayloadLength, lengthTag)

      if (length === null) {
        warnlog('invalid password or cipher', dump(from, to, readyState))
        ws.terminate() // 'close' event will be called
        return
      }
      length = length.readUInt16BE(0)

      const chunkLength = length + TAG_SIZE
      if (data.length < chunkLength) {
        rx.push(data)
        pending = true
        debuglog('pending')
        break
      }

      const encryptedPayload = data.slice(0, length)
      const payloadTag = data.slice(length, chunkLength)
      data = data.slice(chunkLength)
      const payload = decipher.decrypt(encryptedPayload, payloadTag)
      if (payload === null) {
        warnlog('invalid password or cipher', dump(from, to, readyState))
        ws.terminate() // 'close' event will be called
        return
      }
      payloads.push(payload)
      debuglog('payload decrypted')
    }
    data = null

    if (readyState === OPENING || payloads.length === 0 || ws.isPaused) return
    if (readyState === CLOSED) {
      readyState = OPENING
      ws.pause()

      let addr, port
      const address = payloads.shift()
      switch (address[0]) {
        case 3: // Domain
          addr = address.slice(2, 2 + address[1]).toString('binary')
          port = address.readUInt16BE(2 + address[1])
          break
        case 1: // IPv4
          addr = inetNtoa(address.slice(1, 5))
          port = address.readUInt16BE(5)
          break
        case 4: // IPv6
          addr = inetNtop(address.slice(1, 17))
          port = address.readUInt16BE(17)
          break
        default:
          warnlog('invalid atyp', dump(from, to, readyState))
          ws.terminate()
          return
      }
      to = `${addr}:${port}`
      debuglog(`remote address parsed: ${addr}:${port}`)

      try {
        remote = await createAndConnect(port, addr)
      } catch (err) {
        errorlog(err.message, dump(from, to, readyState))
        ws.terminate()
        return
      }

      if (ws.readyState !== WebSocket.OPEN) {
        remote.destroy()
        return
      }

      readyState = OPEN
      ws.resume()
      debuglog('remote connected')

      const salt = randomBytes(SALT_SIZE)
      tx.push(salt)
      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      cipher = new AEAD(METHOD, dk)
      debuglog('cipher initialized')

      remote.on('data', (data) => {
        debuglog('reply received')
        while (data.length > 0) {
          const payload = data.slice(0, 0x3fff)
          const length = Buffer.alloc(2)
          length.writeUInt16BE(payload.length)
          tx.push(cipher.encrypt(length))
          tx.push(cipher.encrypt(payload))
          data = data.slice(0x3fff)
        }
        data = null

        remote.pause()
        ws.send(Buffer.concat(tx), () => remote.resume())
        tx = []
      })

      // 'close' event will be called
      remote.on('error', (err) => errorlog(err.message, dump(from, to, readyState)))
      remote.on('end', () => remote.end())
      remote.on('close', () => {
        debuglog('remote disconnected')
        if (ws.readyState === WebSocket.OPEN) ws.terminate()
      })
    }

    ws.pause()
    while (payloads.length !== 0) {
      if (remote.write(payloads.shift()) === false) {
        await new Promise(resolve => remote.once('drain', resolve))
      }
      debuglog('payload sent')
    }
    ws.resume()
  })

  ws.on('close', () => {
    debuglog('client disconnected')
    if (remote !== null && !remote.destroyed) remote.destroy()
    decipher = cipher = rx = tx = null
  })
})

server.listen(PORT, () => infolog(`server running at http://0.0.0.0:${PORT}/`))
