
import { createReadStream } from 'fs'
import http from 'http'
import { hkdfSync, randomBytes } from 'crypto'
import WebSocket, { WebSocketServer } from 'ws'
import { keySize, saltSize, tagSize, AEAD } from './aead.mjs'
import { EVP_BytesToKey, createAndConnect, inetNtoa, inetNtop } from './helper.mjs'

const METHOD = process.env.METHOD === 'aes-256-gcm' ? 'aes-256-gcm' : 'chacha20-poly1305'
const PASS   = process.env.PASS    || 'secret'
const PORT   = process.env.PORT    ||  80

const KEY_SIZE  = keySize[METHOD]
const SALT_SIZE = saltSize[METHOD]
const TAG_SIZE  = tagSize[METHOD]

const KEY = EVP_BytesToKey(PASS, KEY_SIZE).key

const HTML = './index.html'

const server = http.createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html')
  createReadStream(HTML).pipe(res)
})

const wss = new WebSocketServer({ server })

const UNCONNECTED = 0
const CONNECTING  = 1
const CONNECTED   = 2

function dump (client, target, messages) {
  return `connections=${connections} messages=${messages} client.addr=${client.addr} client.port=${client.port} target.addr=${target.addr} target.port=${target.port} target.readyState=${target.readyState}`
}

let connections = 0

wss.on('connection', (ws, req) => {
  connections++
  console.debug(`connected from client: ${req.socket.remoteAddress}`)

  const client = {
    addr: req.socket.remoteAddress,
    port: req.socket.remotePort,
    decipher: null,
    cipher: null,
    rx: [],
    tx: []
  }
  const target = {
    addr: null,
    port: null,
    sock: null,
    readyState: UNCONNECTED
  }

  let messages = 0

  ws.on('message', async (data) => {
    messages++
    console.debug(`${data.length} bytes received from client`)

    if (client.decipher === null) {
      const salt = data.slice(0, SALT_SIZE)
      data = data.slice(SALT_SIZE)
      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      client.decipher = new AEAD(METHOD, dk)
      console.debug('decipher initialized')
    }

    if (target.readyState === CONNECTING) {
      client.rx.push(data)
      console.debug(`${data.length} bytes buffered`)
      return
    }

    while (data.length > 0) {
      const encryptedPayloadLength = data.slice(0, 2)
      const lengthTag = data.slice(2, 2 + TAG_SIZE)
      data = data.slice(2 + TAG_SIZE)
      let payloadLength = client.decipher.decrypt(encryptedPayloadLength, lengthTag)
      if (payloadLength === null) {
        console.error(`invalid password or cipher: ${dump(client, target, messages)}`)
        ws.terminate() // 'close' event will be called
        return
      }
      payloadLength = payloadLength.readUInt16BE(0)
      console.debug(`encrypted payload length decrypted: ${payloadLength}`)

      const encryptedPayload = data.slice(0, payloadLength)
      const payloadTag = data.slice(payloadLength, payloadLength + TAG_SIZE)
      data = data.slice(payloadLength + TAG_SIZE)
      const payload = client.decipher.decrypt(encryptedPayload, payloadTag)
      console.debug('encrypted payload decrypted')

      if (target.readyState === CONNECTED) {
        target.sock.write(payload)
        console.debug(`${payload.length} bytes sent to target`)
        continue
      }
      target.readyState = CONNECTING

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
        console.error(`invalid atyp: ${dump(client, target, messages)}`)
        ws.terminate()
        return
      }
      target.addr = addr
      target.port = port
      console.debug(`target address parsed: ${addr}:${port}`)

      try {
        target.sock = await createAndConnect(port, addr)
      } catch (err) {
        console.error(`${err.message}: ${dump(client, target, messages)}`)
        ws.terminate()
        return
      }
      target.readyState = CONNECTED
      console.debug('connected to target')
      if (client.rx.length > 0) {
        client.rx.unshift(data)
        data = Buffer.concat(client.rx)
        client.rx = []
        console.debug('buffered data consumed')
      }

      const salt = randomBytes(SALT_SIZE)
      client.tx.push(salt)
      const dk = hkdfSync('sha1', KEY, salt, 'ss-subkey', KEY_SIZE)
      client.cipher = new AEAD(METHOD, dk)
      console.debug('cipher initialized')

      target.sock.on('data', (data) => {
        console.debug(`${data.length} bytes sent from target to client`)
        while (data.length > 0) {
          const payload = data.slice(0, 0x3fff)
          const payloadLength = Buffer.alloc(2)
          payloadLength.writeUInt16BE(payload.length)
          client.tx.push(client.cipher.encrypt(payloadLength))
          client.tx.push(client.cipher.encrypt(payload))
          data = data.slice(0x3fff)
        }
        ws.send(Buffer.concat(client.tx))
        client.tx = []
      })

      target.sock.on('error', (err) => {
        console.error(`${err.message}: ${dump(client, target, messages)}`)
      }) // 'close' event will be called

      target.sock.on('end', () => target.sock.end())

      target.sock.on('close', () => {
        console.debug('disconnected from target')
        if (ws.readyState === WebSocket.OPEN) ws.terminate()
      })
    }
  })

  ws.on('close', () => {
    connections--
    console.debug('disconnected from client')
    if (target.sock !== null && !target.sock.destroyed) target.sock.destroy()
  })
})

server.listen(PORT, () => {
  console.info(`server running at http://0.0.0.0:${PORT}/`)
})
