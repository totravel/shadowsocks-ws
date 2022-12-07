
import { createDecipheriv, createCipheriv } from 'crypto'

const keySize = {
  'aes-256-gcm': 32,
  'chacha20-poly1305': 32
}

const saltSize = {
  'aes-256-gcm': 32,
  'chacha20-poly1305': 32
}

const nonceSize = {
  'aes-256-gcm': 12,
  'chacha20-poly1305': 12
}

const tagSize = {
  'aes-256-gcm': 16,
  'chacha20-poly1305': 16
}

const options = {
  'aes-256-gcm': {},
  'chacha20-poly1305': { authTagLength: 16 }
}

function increase(nonce) {
  let i = 0
  do {
    nonce[i]++
  } while (nonce[i] === 0 && ++i < nonce.length)
}

class AEAD {
  constructor(algorithm, key) {
    this.algorithm = algorithm
    this.key = key
    this.nonce = Buffer.alloc(nonceSize[algorithm])
    this.options = options[algorithm]
  }

  decrypt(c, tag) {
    const d = createDecipheriv(this.algorithm, this.key, this.nonce, this.options)
    const m = []
    m.push(d.setAuthTag(tag).update(c))
    try {
      m.push(d.final())
      increase(this.nonce)
      return Buffer.concat(m)
    } catch (e) {
      return null
    }
  }

  encrypt(m) {
    const e = createCipheriv(this.algorithm, this.key, this.nonce, this.options)
    const c = []
    c.push(e.update(m))
    c.push(e.final())
    c.push(e.getAuthTag())
    increase(this.nonce)
    return Buffer.concat(c)
  }
}

export { keySize, saltSize, tagSize, AEAD }
