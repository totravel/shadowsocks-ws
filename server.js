"use strict";

const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const Relay = require('./relay');
const { keySize } = require('./aead');
const { EVP_BytesToKey } = require('./crypto');

(async () => {
    const PORT     = process.env.PORT || 80;
    const PASS     = process.env.PASS || 'secret';
    global.METHOD  = process.env.METHOD || 'chacha20-poly1305';
    global.TIMEOUT = process.env.TIMEOUT || 5;
    global.KEY     = EVP_BytesToKey(PASS, keySize[METHOD]).key;

    const server = http.createServer((req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        fs.createReadStream('index.html').pipe(res);
    });

    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        console.log('connection from', req.socket.remoteAddress);
        new Relay(ws);
    });

    server.listen(PORT, () => {
        console.log('server running at http://localhost:%d/', PORT);
    });
})();
