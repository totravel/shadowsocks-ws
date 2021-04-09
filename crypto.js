"use strict";

const crypto = require('crypto');
const { keySize, saltSize, AEAD } = require('./aead');
const hkdf = require('futoin-hkdf');

class Crypto extends AEAD {

    constructor(method, key, salt = crypto.randomBytes(saltSize[method])) {
        const dk = hkdf(key, keySize[method], {salt, info: 'ss-subkey', hash: 'sha1'});
        super(method, dk);
        this.c = [salt];
    }

    decryptPayloadLength(c) {
        let payloadLength = this.decrypt(c.slice(0, 2), c.slice(2));
        return this.payloadLength = payloadLength ? payloadLength.readUInt16BE(0) : null;
    }

    decryptPayload(c) {
        return this.decrypt(c.slice(0, this.payloadLength), c.slice(this.payloadLength));
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
        const l = Buffer.alloc(2);
        l.writeUInt16BE(m.length);
        this.c.push(this.encrypt(l));
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
    let m = [];
    let d = '';
    let count = 0;
    do {
        d = crypto.createHash('md5').update(d).update(data).digest();
        m.push(d);
        count += d.length;
    } while (count < keyLen + ivLen);
    m = Buffer.concat(m);
    const key = m.slice(0, keyLen);
    const iv = m.slice(keyLen, keyLen + ivLen);
    return { key, iv };
}

module.exports = { Crypto, EVP_BytesToKey };
