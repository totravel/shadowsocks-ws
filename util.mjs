
import 'colors'
import { env } from 'node:process'
import { debug, info, warn, error } from 'node:console'
import { createHash } from 'node:crypto'
import { createConnection } from 'node:net'
import dohjs from 'dohjs'
const { DohResolver } = dohjs

function fromString(value, type) {
  if (type === 'string') {
    return value
  }
  let newValue = null
  switch (type) {
    case 'number':
      newValue = Number(value)
      break

    case 'boolean':
      switch (value.toLowerCase()) {
        case 'true':
        case 'on':
          newValue = true
          break

        case 'false':
        case 'off':
          newValue = false
          break
      }
      break
  }
  return newValue
}

export function readEnv(name, defaultValue, possibleValues = []) {
  if (name in env) {
    const value = fromString(env[name], typeof defaultValue)
    if (value !== null) {
      if (possibleValues.length === 0 || possibleValues.includes(value)) {
        return value
      }
    }
  }
  env[name] = defaultValue
  return defaultValue
}

export const NODE_ENV = readEnv('NODE_ENV', 'production', ['production', 'development'])
export const APP_DEBUG = NODE_ENV === 'development'

export const debuglog = APP_DEBUG
  ? (...args) => debug('DEBUG'.gray, ...args)
  : () => null

export const infolog = (...args) => info('INFO '.green, ...args)

export const warnlog = (...args) => warn('WARN '.yellow, ...args)

export const errorlog = (...args) => error('ERROR'.red, ...args)

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
    const socket = createConnection(port, addr)
    socket.once('connect', () => {
      socket.removeAllListeners('error')
      resolve(socket)
    })
    socket.once('error', (err) => {
      const sockerr = new Error(`failed to connect to ${addr} port ${port}: ${err.message}`)
      reject(sockerr)
    })
  })
}

export function inet_ntoa(buf) {
  const a = []
  for (let i = 0; i < 4; i++) {
    a.push(buf.readUInt8(i).toString())
  }
  return a.join('.')
}

export function inet_aton(addr) {
  const buf = Buffer.alloc(4)
  const a = addr.split('.')
  for (let i = 0; i < 4; i++) {
    buf.writeUInt8(parseInt(a[i]), i)
  }
  return buf
}

export function inet_ntop(buf) {
  const a = []
  for (let i = 0; i < 16; i += 2) {
    a.push(buf.readUInt16BE(i).toString(16))
  }
  return a.join(':')
}

export function inet_pton(addr) {
  let count = 8
  const parts = addr.split(':')

  const head = []
  while (count > 0 && parts.length > 0) {
    const hex = parts.shift()
    if (hex === '') {
      break
    }
    head.push(hex)
    count--
  }

  const tail = []
  while (count > 0 && parts.length > 0) {
    const hex = parts.shift()
    if (hex === '') {
      continue
    }
    tail.push(hex)
    count--
  }

  const buf = Buffer.alloc(16)

  if (tail.length > 0) {
    const last = tail.pop()
    if (last.split('.').length > 1) {
      inet_aton(last).copy(buf, 12)
      count -= 2
    } else {
      tail.push(last)
    }
  }

  let i = 0
  for (const hex of head) {
    buf.writeUInt16BE(parseInt(hex, 16), i)
    i += 2
  }
  i += count * 2
  for (const hex of tail) {
    buf.writeUInt16BE(parseInt(hex, 16), i)
    i += 2
  }

  return buf
}

export async function lookup(hostname, nameserver) {
  const addresses = []
  const response = await new DohResolver(nameserver).query(hostname, 'A', 'GET', {}, 5000)
  for (const answer of response.answers) {
    if (answer.type === 'A') {
      addresses.push(answer.data)
    }
  }
  if (addresses.length === 0) {
    throw new Error('no address associated with hostname')
  }
  return addresses
}
