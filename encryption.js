"use strict";

const crypto = require('crypto');
const { keySize, saltSize, tagSize, AEAD } = require('./aead');

class Encryption extends AEAD {

    constructor(method, key, salt = crypto.randomBytes(saltSize[method])) {
        key = crypto.hkdfSync('sha1', key, salt, 'ss-subkey', keySize[method]);
        super(method, key);
        this.c = [salt];
    }

    decryptLen(c) {
        let len = c.slice(0, 2);
        let lenTag = c.slice(2);
        len = this.decrypt(len, lenTag);
        return this.len = len?.readUInt16BE(0);
    }

    decryptPayload(c) {
        let payload = c.slice(0, this.len);
        let payloadTag = c.slice(this.len);
        return this.decrypt(payload, payloadTag);
    }

    encryptData(m) {
        const chunks = [];
        while (m.length > 0x3fff) {
            chunks.push(this.encryptChunk(m.slice(0, 0x3fff)));
            m = m.slice(0x3fff);
        }
        if (m.length) chunks.push(this.encryptChunk(m));
        return Buffer.concat(chunks);
    }

    encryptChunk(m) {
        let len = Buffer.alloc(2);
        len.writeUInt16BE(m.length);
        this.c.push(this.encrypt(len));
        this.c.push(this.tag);
        this.c.push(this.encrypt(m));
        this.c.push(this.tag);
        let t = Buffer.concat(this.c);
        this.c = [];
        return t;
    }
}

// https://www.openssl.org/docs/man1.1.1/man3/EVP_BytesToKey.html
function EVP_BytesToKey(data, keyLen, ivLen = 0) {
    const md5 = crypto.createHash('md5');
    let m = [];
    let d = '';
    let count = 0;
    do {
        d = md5.copy().update(d).update(data).digest();
        m.push(d);
        count += d.length;
    } while (count < keyLen + ivLen);
    m = Buffer.concat(m);
    const key = m.slice(0, keyLen);
    const iv = m.slice(keyLen, keyLen + ivLen);
    return { key, iv };
}

module.exports = { keySize, saltSize, tagSize, Encryption, EVP_BytesToKey };
