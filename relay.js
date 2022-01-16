
import net from 'net';
import { saltSize, tagSize } from './aead.js';
import { Crypto } from './crypto.js';

class Relay {

    constructor(ws, method, key, timeout) {
        this.ws = ws;
        this.method = method;
        this.key = key;
        this.timeout = timeout;
        this.tagSize = tagSize[method];
        this.saltSize = saltSize[method];
        this.buf = Buffer.alloc(0);
        this.cb = this.getSalt;
        this.payloadHandler = this.connect;

        this.ws.on('message', (d) => {
            if (!Buffer.isBuffer(d)) d = Buffer.from(d);
            this.buf = Buffer.concat([this.buf, d]);
            this.cb();
        });

        this.ws.on('close', () => {
            if (this.dst) this.dst.destroyed || this.dst.destroy();
        });

        this.ws.on('error', (err) => {
            console.error(err);
            if (this.dst) this.dst.destroyed || this.dst.destroy();
        });
    }

    getSalt() {
        if (this.buf.length < this.saltSize) return;

        const salt = this.buf.slice(0, this.saltSize);
        this.decipher = new Crypto(this.method, this.key, salt);

        this.buf = this.buf.slice(this.saltSize);
        this.cb = this.getPayloadLength;
        this.cb();
    }

    getPayloadLength() {
        if (this.buf.length < (2 + this.tagSize)) return;

        const l = this.buf.slice(0, 2 + this.tagSize);
        if (this.decipher.decryptPayloadLength(l) === null) {
            console.error('invalid password or cipher');
            this.ws.terminate();
            return;
        }

        this.buf = this.buf.slice(2 + this.tagSize);
        this.cb = this.getPayload;
        this.cb();
    }

    getPayload() {
        if (this.buf.length < (this.decipher.payloadLength + this.tagSize)) return;

        const c = this.buf.slice(0, this.decipher.payloadLength + this.tagSize);
        this.payload = this.decipher.decryptPayload(c);
        if (this.payload === null) {
            console.error('invalid password or cipher');
            this.ws.terminate();
            return;
        }

        this.buf = this.buf.slice(this.decipher.payloadLength + this.tagSize);
        this.cb = noop;
        this.payloadHandler();
        this.payload = null;
    }

    connect() {
        const atyp = this.payload[0];
        if (atyp === 1) {
            // IPv4
            this.dstAddr = inetNtoa(this.payload.slice(1, 5));
            this.dstPort = this.payload.readUInt16BE(5);
        } else if (atyp === 3) {
            // Domain
            this.dstAddr = this.payload.slice(2, 2 + this.payload[1]).toString('binary');
            this.dstPort = this.payload.readUInt16BE(2 + this.payload[1]);
        } else if (atyp === 4) {
            // IPv6
            this.dstAddr = inetNtop(this.payload.slice(1, 17));
            this.dstPort = this.payload.readUInt16BE(17);
        } else {
            console.error('invalid atyp');
            this.ws.terminate();
            return;
        }

        this.dst = net.createConnection(this.dstPort, this.dstAddr);
        console.debug('connecting to', this.dstAddr);

        this.dst.on('connect', () => {
            console.debug('connected to', this.dstAddr);
            this.cipher = new Crypto(this.method, this.key);
            this.payloadHandler = this.send;
            this.cb = this.getPayloadLength;
            this.cb();

            this.dst.setTimeout(this.timeout, () => {
                this.dst.destroy();
                console.debug('disconnected from', this.dstAddr, 'because of timeout');
            });
        });

        this.dst.on('data', (d) => {
            console.debug(d.length, 'bytes from', this.dstAddr);
            this.ws.send(this.cipher.encryptData(d));
        });

        this.dst.on('close', () => {
            this.ws.terminate();
        });

        this.dst.on('error', (err) => {
            console.error(err);
            this.ws.terminate();
        });
    }

    send() {
        console.debug(this.payload.length, 'bytes to', this.dstAddr);
        this.dst.write(this.payload);
        this.cb = this.getPayloadLength;
        this.cb();
    }
}

const noop = () => {};

const inetNtoa = (buf) => `${buf[0]}.${buf[1]}.${buf[2]}.${buf[3]}`;

function inetNtop(buf) {
    let a = [];
    for (let i = 0; i < 16; i += 2)
        a.push(buf.readUInt16BE(i).toString(16));
    return a.join(':');
}

export default Relay;
