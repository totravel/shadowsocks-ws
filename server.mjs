
import { createReadStream } from 'fs'
import { createServer } from 'http'
import { hkdfSync, randomBytes } from 'crypto'
import WebSocket, { WebSocketServer } from 'ws'
import { keySize, saltSize, tagSize, AEAD } from './aead.mjs'
import { EVP_BytesToKey, createAndConnect, inetNtoa, inetNtop } from './helper.mjs'

import colors from 'colors'
const { red, gray, green, magenta, blue } = colors

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

function dump (message, clientAddr, targetAddr, targetReadyState) {
  return red(`${message}:`) +
         gray(' clientAddr=') + blue(clientAddr) +
         gray(' targetAddr=') + magenta(targetAddr) +
         gray(' targetReadyState=') + green(targetReadyState)
}

wss.on('connection', (ws, req) => {
  const clientAddr = `${req.socket.remoteAddress}:${req.socket.remotePort}`
  let decipher = null
  let cipher = null
  let rx = []
  let tx = []
  let decryptedPayloadLength = null
  const decryptedPayload = []
  let targetReadyState = CLOSED
  let targetAddr = null
  let targetSocket = null

  console.debug(`client connected: ${clientAddr}`)

  ws.on('message', async (data) => {
    console.debug(`${data.length} bytes received from client`)

    if (decipher === null) {
      const salt = data.slice(0, SALT_SIZE)
      data = data.slice(SALT_SIZE)
      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      decipher = new AEAD(METHOD, dk)
      console.debug('decipher initialized')
    }

    if (targetReadyState === OPENING) {
      rx.push(data)
      console.debug('data buffered')
      return
    }

    if (rx.length > 0) {
      rx.push(data)
      data = Buffer.concat(rx)
      rx = []
      console.debug('data consumed')
    }

    while (data.length > 0) {
      let payloadLength = decryptedPayloadLength
      if (payloadLength === null) {
        if (data.length < PAYLOAD_LENGTH_CHUNK_SIZE) {
          rx.push(data)
          console.debug('no data')
          return
        }

        const encryptedPayloadLength = data.slice(0, PAYLOAD_LENGTH_SIZE)
        const lengthTag = data.slice(PAYLOAD_LENGTH_SIZE, PAYLOAD_LENGTH_CHUNK_SIZE)
        data = data.slice(PAYLOAD_LENGTH_CHUNK_SIZE)
        payloadLength = decipher.decrypt(encryptedPayloadLength, lengthTag)

        if (payloadLength === null) {
          console.error(dump('invalid password or cipher', clientAddr, targetAddr, targetReadyState))
          ws.terminate() // 'close' event will be called
          return
        }

        payloadLength = payloadLength.readUInt16BE(0)
        console.debug(`payload length decrypted: ${payloadLength}`)
      } else {
        decryptedPayloadLength = null
        console.debug('payload length already exists')
      }

      if (data.length < (payloadLength + TAG_SIZE)) {
        rx.push(data)
        decryptedPayloadLength = payloadLength
        console.debug('no data')
        return
      }

      const encryptedPayload = data.slice(0, payloadLength)
      const payloadTag = data.slice(payloadLength, payloadLength + TAG_SIZE)
      data = data.slice(payloadLength + TAG_SIZE)
      const payload = decipher.decrypt(encryptedPayload, payloadTag)
      console.debug('payload decrypted')

      if (targetReadyState === OPEN) {
        decryptedPayload.push(payload)
        continue
      }
      targetReadyState = OPENING
      ws.pause()

      const atyp = payload[0]
      let addr, port
      if (atyp === 1) {
        addr = inetNtoa(payload.slice(1, 5)) // IPv4
        port = payload.readUInt16BE(5)
      } else if (atyp === 3) {
        addr = payload.slice(2, 2 + payload[1]).toString('binary') // Domain
        port = payload.readUInt16BE(2 + payload[1])
      } else if (atyp === 4) {
        addr = inetNtop(payload.slice(1, 17)) // IPv6
        port = payload.readUInt16BE(17)
      } else {
        console.error(dump('invalid atyp', clientAddr, targetAddr, targetReadyState))
        ws.terminate()
        return
      }
      targetAddr = `${addr}:${port}`
      console.debug(`target address parsed: ${addr}:${port}`)

      try {
        targetSocket = await createAndConnect(port, addr)
      } catch (err) {
        console.error(dump(err.message, clientAddr, targetAddr, targetReadyState))
        ws.terminate()
        return
      }
      console.debug('target connected')

      targetReadyState = OPEN
      ws.resume()
      if (rx.length > 0) {
        rx.unshift(data)
        data = Buffer.concat(rx)
        rx = []
      }

      const salt = randomBytes(SALT_SIZE)
      tx.push(salt)
      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      cipher = new AEAD(METHOD, dk)
      console.debug('cipher initialized')

      targetSocket.on('data', (data) => {
        console.debug(`${data.length} bytes sent to client`)
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
        console.error(dump(err.message, clientAddr, targetAddr, targetReadyState))
      })

      targetSocket.on('end', () => targetSocket.end())

      targetSocket.on('close', () => {
        console.debug('target disconnected')
        if (ws.readyState === WebSocket.OPEN) ws.terminate()
      })
    }
    data = null

    if (targetReadyState !== OPEN || ws.isPaused) return
    write()
  })

  // upload
  function write () {
    while (decryptedPayload.length !== 0) {
      if (targetSocket.write(decryptedPayload.shift()) === true) continue
      ws.pause()
      targetSocket.once('drain', write)
      return
    }
    if (ws.isPaused) ws.resume()
  }

  ws.on('close', () => {
    console.debug('client disconnected')
    if (targetSocket !== null && !targetSocket.destroyed) targetSocket.destroy()
  })
})

server.listen(PORT, () => {
  console.info(`server running at http://0.0.0.0:${PORT}/`)
})
