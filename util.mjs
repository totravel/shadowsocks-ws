
import 'colors'
import { error, warn, info, debug } from 'console'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { createConnection } from 'net'
import dohjs from 'dohjs'
const { DohResolver } = dohjs

export const errorlog = (...args) => error('ERROR'.red, ...args)

export const warnlog  = (...args) => warn('WARN '.yellow, ...args)

export const infolog  = (...args) => info('INFO '.green, ...args)

export const debuglog = process.env.DEBUG === 'true'
  ? (...args) => debug('DEBUG'.gray, ...args)
  : () => null

export function loadFile(path) {
  try {
    return readFileSync(path, { encoding: 'utf8' })
  } catch (err) {
    errorlog(`loadFile(): failed to load file, path='${path}': readFileSync(): ${err.message}`)
    return ''
  }
}

export function parseJSON(str) {
  try {
    return JSON.parse(str)
  } catch (err) {
    errorlog(`parseJSON(): failed to parse string: JSON.parse(): ${err.message}`)
    return ''
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

export function connect(port, addr) {
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

export async function lookup(nameserver, hostname) {
  try {
    const addresses = []
    const response = await new DohResolver(nameserver).query(hostname, 'A')
    for (const answer of response.answers) {
      if (answer.type === 'A') {
        addresses.push(answer.data)
      }
    }
    return addresses
  } catch (err) {
    errorlog(`lookup(): failed to resolve host, nameserver='${nameserver}', hostname='${hostname}': DohResolver.query(): ${err.message}`)
    return []
  }
}
