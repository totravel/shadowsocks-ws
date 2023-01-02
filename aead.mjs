
import { createDecipheriv, createCipheriv } from 'node:crypto'

function increase(nonce) {
  let i = 0
  do {
    nonce[i]++
  } while (nonce[i] === 0 && ++i < nonce.length)
}

export class AEAD {
  static keySizeMap = {
    'aes-256-gcm': 32,
    'chacha20-poly1305': 32
  }

  static saltSizeMap = {
    'aes-256-gcm': 32,
    'chacha20-poly1305': 32
  }

  static nonceSizeMap = {
    'aes-256-gcm': 12,
    'chacha20-poly1305': 12
  }

  static tagSizeMap = {
    'aes-256-gcm': 16,
    'chacha20-poly1305': 16
  }

  static optionsMap = {
    'aes-256-gcm': {},
    'chacha20-poly1305': { authTagLength: 16 }
  }

  static getSize(method) {
    const keySize  = this.keySizeMap[method]
    const saltSize = this.saltSizeMap[method]
    const tagSize  = this.tagSizeMap[method]
    return { keySize, saltSize, tagSize }
  }

  constructor(algorithm, key) {
    this.algorithm = algorithm
    this.key = key
    this.nonce = Buffer.alloc(AEAD.nonceSizeMap[algorithm])
    this.options = AEAD.optionsMap[algorithm]
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
