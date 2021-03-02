"use strict";

const fs = require('fs');
const net = require('net');
const http = require('http');
const WebSocket = require('ws').Server;
const { EVP_BytesToKey, keySize, saltSize, tagSize, Encryption } = require('./encryption');

const M = process.env.METHOD === 'aes-256-gcm' ? 'aes-256-gcm' : 'chacha20-poly1305';
const PASS = process.env.PASS || 'secret';
const PORT = process.env.PORT || 8080;
const TIMEOUT = process.env.TIMEOUT || 3;
const KEY = EVP_BytesToKey(PASS, keySize[M]).key;

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    fs.createReadStream('index.html').pipe(res);
});

const wss = new WebSocket({ server });

wss.on('connection', (ws, req) => {
    ws.clientAddr = req.socket.remoteAddress + ':' + req.socket.remotePort;
    initConn(ws);
});

server.listen(PORT, () => {
    console.log('server running at http://localhost:%d/', PORT);
});

function initConn(c) {
    console.log(c.clientAddr, 'client connected');

    c.buf = Buffer.alloc(0);
    c.handler = getSalt;
    c.payloadHandler = connectToDst;

    c.on('message', (d) => {
        if (! Buffer.isBuffer(d)) d = Buffer.from(d);
        c.buf = Buffer.concat([c.buf, d]);
        c.handler(c);
    });

    c.on('close', () => {
        console.log(c.clientAddr, 'client disconnected');
        c.dst?.destroy();
    });

    c.on('error', (e) => {
        console.warn('client', e);
        c.dst?.destroy();
    });
}

function getSalt(c) {
    if (c.buf.length < saltSize[M]) return;

    c.decipher = new Encryption(M, KEY, c.buf.slice(0, saltSize[M]));
    console.log(c.clientAddr, 'salt received');

    c.buf = c.buf.slice(saltSize[M]);
    c.handler = getLen;
    c.handler(c);
}

function getLen(c) {
    if (c.buf.length < (2 + tagSize[M])) return;

    if (c.decipher.decryptLen(c.buf.slice(0, 2 + tagSize[M])) === null) {
        console.warn(c.clientAddr, 'invalid length');
        c.terminate();
        return;
    }
    console.log(c.clientAddr, 'length decrypted');

    c.buf = c.buf.slice(2 + tagSize[M]);
    c.handler = getPayload;
    c.handler(c);
}

function getPayload(c) {
    if (c.buf.length < (c.decipher.len + tagSize[M])) return;

    const ciphertext = c.buf.slice(0, c.decipher.len + tagSize[M]);
    c.payload = c.decipher.decryptPayload(ciphertext);
    if (c.payload === null) {
        console.warn(c.clientAddr, 'invalid payload');
        c.terminate();
        return;
    }
    console.log(c.clientAddr, 'payload decrypted');

    c.buf = c.buf.slice(c.decipher.len + tagSize[M]);
    c.handler = noop;
    c.payloadHandler(c);
    c.payload = Buffer.alloc(0);
}

function connectToDst(c) {
    var addr;
    var port;

    const atyp = c.payload[0];
    if (atyp === 1) {
        addr = inetNtoa(c.payload.slice(1, 5));
        port = c.payload.readUInt16BE(5);
    } else if (atyp === 3) {
        const addrLen = c.payload[1];
        addr = c.payload.slice(2, 2 + addrLen).toString('binary');
        port = c.payload.readUInt16BE(2 + addrLen);
    } else if (atyp === 4) {
        addr = inetNtop(c.payload.slice(1, 17));
        port = c.payload.readUInt16BE(17);
    } else {
        console.warn(c.clientAddr, 'address type not supported');
        c.terminate();
        return;
    }

    console.log(c.clientAddr, 'destination:', addr, port);
    c.dst = net.createConnection(port, addr);

    c.dst.on('connect', () => {
        console.log(c.clientAddr, 'destination connected');
        c.cipher = new Encryption(M, KEY);
        c.payloadHandler = sendToDst;
        c.handler = getLen;
        c.handler(c);

        c.dst.setTimeout(TIMEOUT * 1000, () => {
            console.log(c.clientAddr, 'destination timeout');
            c.dst.destroy();
        });
    });

    c.dst.on('data', (d) => {
        console.log(c.clientAddr, 'client <- destination');
        c.send(c.cipher.encryptData(d));
    });

    c.dst.on('close', () => {
        console.log(c.clientAddr, 'destination disconnected');
        c.terminate();
    });

    c.dst.on('error', (e) => {
        console.warn('destination', e);
        c.terminate();
    });
}

function sendToDst(c) {
    console.log(c.clientAddr, 'client -> destination');
    c.dst.write(c.payload);
    c.handler = getLen;
    c.handler(c);
}

const noop = () => {};

const inetNtoa = buf => `${buf[0]}.${buf[1]}.${buf[2]}.${buf[3]}`;

const inetNtop = buf => `${buf[0]}${buf[1]}:${buf[2]}${buf[3]}:${buf[4]}${buf[5]}:${buf[6]}${buf[7]}:${buf[8]}${buf[9]}:${buf[10]}${buf[11]}:${buf[12]}${buf[13]}:${buf[14]}${buf[15]}`;
