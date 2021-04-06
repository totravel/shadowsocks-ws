"use strict";

const net = require('net');
const { saltSize, tagSize } = require('./aead');
const { Crypto } = require('./crypto');

class Relay {

    constructor(ws) {
        this.ws = ws;
        this.buf = Buffer.alloc(0);
        this.cb = this.getSalt;
        this.payloadHandler = this.connect;

        this.ws.on('message', (d) => {
            if (! Buffer.isBuffer(d)) d = Buffer.from(d);
            this.buf = Buffer.concat([this.buf, d]);
            this.cb();
        });

        this.ws.on('close', () => {
            this.dst?.destroy();
        });

        this.ws.on('error', (e) => {
            console.error(e);
            this.dst?.destroy();
        });
    }

    getSalt() {
        if (this.buf.length < saltSize[METHOD]) return;

        this.decipher = new Crypto(METHOD, KEY, this.buf.slice(0, saltSize[METHOD]));

        this.buf = this.buf.slice(saltSize[METHOD]);
        this.cb = this.getPayloadLength;
        this.cb();
    }

    getPayloadLength() {
        if (this.buf.length < (2 + tagSize[METHOD])) return;

        if (this.decipher.decryptPayloadLength(this.buf.slice(0, 2 + tagSize[METHOD])) === null) {
            console.error('invalid password or cipher');
            this.ws.terminate();
            return;
        }

        this.buf = this.buf.slice(2 + tagSize[METHOD]);
        this.cb = this.getPayload;
        this.cb();
    }

    getPayload() {
        if (this.buf.length < (this.decipher.payloadLength + tagSize[METHOD])) return;

        const ciphertext = this.buf.slice(0, this.decipher.payloadLength + tagSize[METHOD]);
        this.payload = this.decipher.decryptPayload(ciphertext);
        if (this.payload === null) {
            console.error('invalid password or cipher');
            this.ws.terminate();
            return;
        }

        this.buf = this.buf.slice(this.decipher.payloadLength + tagSize[METHOD]);
        this.cb = noop;
        this.payloadHandler();
        this.payload = Buffer.alloc(0);
    }

    connect() {
        var addr, port;

        const atyp = this.payload[0];
        if (atyp === 1) {
            // IPv4
            addr = inetNtoa(this.payload.slice(1, 5));
            port = this.payload.readUInt16BE(5);
        } else if (atyp === 3) {
            // Domain
            addr = this.payload.slice(2, 2 + this.payload[1]).toString('binary');
            port = this.payload.readUInt16BE(2 + this.payload[1]);
        } else if (atyp === 4) {
            // IPv6
            addr = inetNtop(this.payload.slice(1, 17));
            port = this.payload.readUInt16BE(17);
        } else {
            console.error('invalid atyp');
            this.ws.terminate();
            return;
        }
        console.log('connect to', addr);

        this.dst = net.createConnection(port, addr);
        this.dst.on('connect', () => {
            this.cipher = new Crypto(METHOD, KEY);
            this.payloadHandler = this.send;
            this.cb = this.getPayloadLength;
            this.cb();

            this.dst.setTimeout(TIMEOUT * 1000, () => {
                this.dst.destroy();
            });
        });

        this.dst.on('data', (d) => {
            this.ws.send(this.cipher.encryptData(d));
        });

        this.dst.on('close', () => {
            this.ws.terminate();
        });

        this.dst.on('error', (e) => {
            console.error(e);
            this.ws.terminate();
        });
    }

    send() {
        this.dst.write(this.payload);
        this.cb = this.getPayloadLength;
        this.cb();
    }
}

const noop = () => {};

const inetNtoa = buf => `${buf[0]}.${buf[1]}.${buf[2]}.${buf[3]}`;

const inetNtop = buf => `${buf[0]}${buf[1]}:${buf[2]}${buf[3]}:${buf[4]}${buf[5]}:${buf[6]}${buf[7]}:${buf[8]}${buf[9]}:${buf[10]}${buf[11]}:${buf[12]}${buf[13]}:${buf[14]}${buf[15]}`;

module.exports = Relay;
