
import { createReadStream } from 'fs'
import { createServer } from 'http'
import { hkdfSync, randomBytes } from 'crypto'
import WebSocket, { WebSocketServer } from 'ws'
import { keySize, saltSize, tagSize, AEAD } from './aead.mjs'
import { EVP_BytesToKey, createAndConnect, inetNtoa, inetNtop, error, warn, info, debug } from './helper.mjs'

import colors from 'colors'
const { gray, green, magenta, blue } = colors

const METHOD = process.env.METHOD === 'aes-256-gcm' ? 'aes-256-gcm' : 'chacha20-poly1305'
const PASS   = process.env.PASS    || 'secret'
const PORT   = process.env.PORT    ||  80

const KEY_SIZE  = keySize[METHOD]
const SALT_SIZE = saltSize[METHOD]
const TAG_SIZE  = tagSize[METHOD]

const PAYLOAD_LENGTH_SIZE = 2
const PAYLOAD_LENGTH_CHUNK_SIZE = 2 + TAG_SIZE

const KEY = EVP_BytesToKey(PASS, KEY_SIZE).key

const CLOSED  = 'closed'
const OPENING = 'opening'
const OPEN    = 'open'

const HTML = './index.html'

const server = createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html')
  createReadStream(HTML).pipe(res)
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const clientAddr = `${req.socket.remoteAddress}:${req.socket.remotePort}`
  let decipher = null
  let cipher = null
  let rx = []
  let tx = []
  let pending = false
  let payloadLength = 0
  const payloads = []
  let targetReadyState = CLOSED
  let targetAddr = null
  let targetSocket = null

  debug(`client connected: ${clientAddr}`)

  ws.on('message', async (data) => {
    if (decipher === null) {
      const salt = data.slice(0, SALT_SIZE)
      data = data.slice(SALT_SIZE)
      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      decipher = new AEAD(METHOD, dk)
      debug('decipher initialized')
    }

    if (targetReadyState === OPENING) {
      rx.push(data)
      return
    }

    if (rx.length > 0) {
      rx.push(data)
      data = Buffer.concat(rx)
      rx = []

      if (pending) {
        const encryptedPayload = data.slice(0, payloadLength)
        const payloadTag = data.slice(payloadLength, payloadLength + TAG_SIZE)
        data = data.slice(payloadLength + TAG_SIZE)
        const payload = decipher.decrypt(encryptedPayload, payloadTag)

        if (payload === null) {
          warn('invalid password or cipher', dump(clientAddr, targetAddr, targetReadyState))
          ws.terminate() // 'close' event will be called
          return
        }

        payloads.push(payload)
        debug('payload decrypted')
        pending = false
      }
    }

    while (data.length > 0) {
      if (data.length < PAYLOAD_LENGTH_CHUNK_SIZE) {
        rx.push(data)
        debug('no data')
        break
      }

      const encryptedPayloadLength = data.slice(0, PAYLOAD_LENGTH_SIZE)
      const lengthTag = data.slice(PAYLOAD_LENGTH_SIZE, PAYLOAD_LENGTH_CHUNK_SIZE)
      data = data.slice(PAYLOAD_LENGTH_CHUNK_SIZE)
      payloadLength = decipher.decrypt(encryptedPayloadLength, lengthTag)

      if (payloadLength === null) {
        warn('invalid password or cipher', dump(clientAddr, targetAddr, targetReadyState))
        ws.terminate() // 'close' event will be called
        return
      }

      payloadLength = payloadLength.readUInt16BE(0)
      debug(`payload length decrypted: ${payloadLength}`)

      const chunkLength = payloadLength + TAG_SIZE
      if (data.length < chunkLength) {
        rx.push(data)
        pending = true
        debug('no data')
        break
      }

      const encryptedPayload = data.slice(0, payloadLength)
      const payloadTag = data.slice(payloadLength, chunkLength)
      data = data.slice(chunkLength)
      const payload = decipher.decrypt(encryptedPayload, payloadTag)
      if (payload === null) {
        warn('invalid password or cipher', dump(clientAddr, targetAddr, targetReadyState))
        ws.terminate() // 'close' event will be called
        return
      }
      debug('payload decrypted')

      if (targetReadyState === OPEN) {
        payloads.push(payload)
        continue
      }
      targetReadyState = OPENING
      ws.pause()
      rx.push(data)

      let addr, port
      switch (payload[0]) {
        case 1: // IPv4
          addr = inetNtoa(payload.slice(1, 5))
          port = payload.readUInt16BE(5)
          break
        case 3: // Domain
          addr = payload.slice(2, 2 + payload[1]).toString('binary')
          port = payload.readUInt16BE(2 + payload[1])
          break
        case 4: // IPv6
          addr = inetNtop(payload.slice(1, 17))
          port = payload.readUInt16BE(17)
          break
        default:
          warn('invalid atyp', dump(clientAddr, targetAddr, targetReadyState))
          ws.terminate()
          return
      }
      targetAddr = `${addr}:${port}`
      debug(`target address parsed: ${addr}:${port}`)

      try {
        targetSocket = await createAndConnect(port, addr)
      } catch (err) {
        error(err.message, dump(clientAddr, targetAddr, targetReadyState))
        ws.terminate()
        return
      }

      if (ws.readyState !== WebSocket.OPEN) {
        targetSocket.destroy()
        return
      }

      debug('target connected')
      targetReadyState = OPEN
      ws.resume()
      data = Buffer.concat(rx)
      rx = []

      const salt = randomBytes(SALT_SIZE)
      tx.push(salt)
      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      cipher = new AEAD(METHOD, dk)
      debug('cipher initialized')

      targetSocket.on('data', (data) => {
        debug('reply received')
        while (data.length > 0) {
          const payload = data.slice(0, 0x3fff)
          const payloadLength = Buffer.alloc(2)
          payloadLength.writeUInt16BE(payload.length)
          tx.push(cipher.encrypt(payloadLength))
          tx.push(cipher.encrypt(payload))
          data = data.slice(0x3fff)
        }
        data = null

        // download
        targetSocket.pause()
        ws.send(Buffer.concat(tx), () => {
          targetSocket.resume()
        })
        tx = []
      })

      targetSocket.on('error', (err) => { // 'close' event will be called
        error(err.message, dump(clientAddr, targetAddr, targetReadyState))
      })

      targetSocket.on('end', () => targetSocket.end())

      targetSocket.on('close', () => {
        debug('target disconnected')
        if (ws.readyState === WebSocket.OPEN) ws.terminate()
      })
    }
    data = null

    // upload
    if (ws.isPaused) return
    ws.pause()
    while (payloads.length !== 0) {
      if (targetSocket.write(payloads.shift()) === true) {
        debug('payload sent')
        continue
      }
      await new Promise(resolve => targetSocket.once('drain', resolve))
    }
    ws.resume()
  })

  ws.on('close', () => {
    debug('client disconnected')
    if (targetSocket !== null && !targetSocket.destroyed) targetSocket.destroy()
    decipher = cipher = rx = tx = null
  })
})

server.listen(PORT, () => {
  info(`server running at http://0.0.0.0:${PORT}/`)
})

function dump (clientAddr, targetAddr, targetReadyState) {
  return gray('from=') + blue(clientAddr) +
         gray(' to=') + magenta(targetAddr) +
         gray(' state=') + green(targetReadyState)
}
