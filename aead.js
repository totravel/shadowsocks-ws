"use strict";

const crypto = require('crypto');

const keySize = {
    'aes-256-gcm': 32,
    'chacha20-poly1305': 32
};

const saltSize = {
    'aes-256-gcm': 32,
    'chacha20-poly1305': 32
};

const nonceSize = {
    'aes-256-gcm': 12,
    'chacha20-poly1305': 12
};

const tagSize = {
    'aes-256-gcm': 16,
    'chacha20-poly1305': 16
};

class AEAD {

    constructor(algorithm, key) {
        this.a = algorithm;
        this.k = key;
        this.n = Buffer.alloc(nonceSize[this.a]);
        this.o = {};
        if (this.a === 'chacha20-poly1305')
            this.o.authTagLength = tagSize[this.a];
    }

    decrypt(c, tag) {
        const d = crypto.createDecipheriv(this.a, this.k, this.n, this.o);
        const m = [];
        m.push(d.setAuthTag(tag).update(c));
        try {
            m.push(d.final());
            this.incNonce();
            return Buffer.concat(m);
        } catch (e) {
            return null;
        }
    }

    encrypt(m) {
        const e = crypto.createCipheriv(this.a, this.k, this.n, this.o);
        const c = [];
        c.push(e.update(m));
        c.push(e.final());
        this.tag = e.getAuthTag();
        this.incNonce();
        return Buffer.concat(c);
    }

    incNonce() {
        const n = new Uint32Array(this.n.buffer);
        let i = 0;
        do n[i]++; while (n[i] === 0 && ++i < n.length);
    }
}

module.exports = { keySize, saltSize, tagSize, AEAD };
