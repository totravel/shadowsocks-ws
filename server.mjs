
import fs from 'fs';
import http from 'http';
import { WebSocketServer } from 'ws';
import Relay from './relay.mjs';
import { keySize } from './aead.mjs';
import { EVP_BytesToKey } from './crypto.mjs';

const PORT    = process.env.PORT    || 80;
const PASS    = process.env.PASS    || 'secret';
const METHOD  = process.env.METHOD === 'aes-256-gcm' ? 'aes-256-gcm' : 'chacha20-poly1305';
const TIMEOUT = process.env.TIMEOUT || 5000;
const KEY     = EVP_BytesToKey(PASS, keySize[METHOD]).key;

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    fs.createReadStream('index.html').pipe(res);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    console.debug('connected from', req.socket.remoteAddress);
    new Relay(ws, METHOD, KEY, TIMEOUT);
});

server.listen(PORT, () => {
    console.info(`server running at http://0.0.0.0:${PORT}/`);
});
