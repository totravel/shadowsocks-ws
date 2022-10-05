
import 'colors'
import { readFileSync } from 'fs'
import { createConnection } from 'net'
import { createHash } from 'crypto'
import { error, warn, info, debug } from 'console'

export function loadFile(path) {
  try {
    return readFileSync(path, { encoding: 'utf8' })
  } catch (err) {
    return null
  }
}

export function parseJSON(str) {
  try {
    return JSON.parse(str)
  } catch (err) {
    return null
  }
}

// https://www.openssl.org/docs/man3.0/man3/EVP_BytesToKey.html
export function EVP_BytesToKey(data, keylen, ivlen = 0) {
  let d = '', m = [], l = 0
  do {
    d = createHash('md5').update(d).update(data).digest()
    m.push(d)
    l += d.length
  } while (l < keylen + ivlen)
  m = Buffer.concat(m)
  const key = m.slice(0, keylen)
  const iv  = m.slice(keylen, keylen + ivlen)
  return { key, iv }
}

export function createAndConnect(port, addr) {
  return new Promise((resolve, reject) => {
    const sock = createConnection(port, addr)
    sock.once('connect', () => resolve(sock))
    sock.once('error', (err) => reject(err))
  })
}

export function inetNtoa(buf) {
  const a = []
  for (let i = 0; i < 4; i++) {
    a.push(buf.readUInt8(i).toString())
  }
  return a.join('.')
}

export function inetNtop(buf) {
  const a = []
  for (let i = 0; i < 16; i += 2) {
    a.push(buf.readUInt16BE(i).toString(16))
  }
  return a.join(':')
}

export const errorlog = (msg, ...args) => error(`ERROR: ${msg}`.red, ...args)

export const warnlog  = (msg, ...args) => warn(`WARNING: ${msg}`.yellow, ...args)

export const infolog  = (msg, ...args) => info(`INFO: ${msg}`, ...args)

export const debuglog = process.env.DEBUG === 'true'
  ? (msg, ...args) => debug(`DEBUG: ${msg}`.gray, ...args)
  : () => null
