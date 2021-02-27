"use strict";

const fs = require('fs');
const url = require('url');
const net = require('net');
const https = require('https');
const colors = require('colors');
const WebSocket = require('ws');
const DnsOverHttpResolver = require('dns-over-http-resolver');

console.clear();

(async () => {
    let config = null;
    try {
        config = JSON.parse(fs.readFileSync('config.json', {encoding: 'utf8'}));
        showURL(config);
        global.verbose = config.verbose;
    } catch (err) {
        console.log(err);
        process.exit(1);
    };

    const hostname = url.parse(config.url).hostname;
    const options = {
        hostname,
        timeout: 3000,
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:85.0) Gecko/20100101 Firefox/85.0'
        }
    };

    let record4 = [];
    let record6 = [];
    console.log('resolving...', hostname.gray);
    const resolver = new DnsOverHttpResolver();
    resolver.setServers([config.dns]);
    try {
        record4 = await resolver.resolve4(hostname);
    } catch (err) {}
    try {
        record6 = await resolver.resolve6(hostname);
    } catch (err) {}
    const record = record4.concat(record6);
    if (record.length == 0) {
        console.log('failed'.red);
        process.exit(1);
    }
    if (verbose) console.log(record);

    let min = Infinity;
    let fast = null;
    for (const addr of record) {
        const atyp = net.isIP(addr);
        if (verbose) console.log(atyp);
        if (atyp) {
            try {
                console.log('trying...', addr.gray);
                options.lookup = (h, o, cb) => cb(null, addr, atyp);
                let t = Date.now();
                await testServer(options);
                t = Date.now() - t;
                console.log('used %dms'.gray, t);
                if (t < min) min = t, fast = {addr, atyp};
            } catch (err) {
                console.log('whoops!'.gray);
            }
        }
    }
    if (fast == null) {
        console.log('something bad happened'.red);
        process.exit(1);
    }

    console.log('using', fast.addr);
    options.lookup = (h, o, cb) => cb(null, fast.addr, fast.atyp);
    startServer(config, options);
})();

function showURL(c) {
    const userinfo = Buffer.from(c.method + ':' + c.password).toString('base64');
    console.log(colors.gray('ss://' + userinfo + '@' + c.server + ':' + c.remote_port));
}

function testServer(options) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            if (res.headers['set-cookie'])
                options.headers.cookie = res.headers['set-cookie'][0].split(';')[0];
            if (verbose) {
                console.log(res.headers['set-cookie']);
                res.setEncoding('utf8');
                res.once('data', (chunk) => {
                    console.log(chunk.gray);
                    resolve();
                });
            } else {
                resolve();
            }
        });

        req.on('timeout', () => {
            reject(new Error('timeout'));
            req.destroy();
        });

        req.on('error', reject);

        req.end();
    });
}

function startServer(config, options) {
    const server = net.createServer();

    server.on('connection', c => {
        const ws = new WebSocket(config.url, null, options);

        ws.on('open', () => {
            ws.d = WebSocket.createWebSocketStream(ws);
            ws.d.pipe(c);
            c.pipe(ws.d);

            ws.d.on('error', err => {
                if (verbose) console.log('pipe', err);
            });
        });

        ws.on('close', () => {
            ws.d?.destroy();
            c.destroyed || c.destroy();
        });

        ws.on('unexpected-response', (req, res) => {
            console.log('unexpected-response'.red);
            ws.d?.destroy();
            c.destroyed || c.destroy();
            server.close();
        });

        ws.on('error', err => {
            if (verbose) console.log('remote', err);
            ws.d?.destroy();
            c.destroyed || c.destroy();
        });

        c.on('close', () => {
            ws.d?.destroy();
            ws.terminate();
        });

        c.on('error', err => {
            if (verbose) console.log('local', err);
            ws.d?.destroy();
            ws.terminate();
        });
    });

    server.on('error', err => {
        console.log('server', err);
        process.exit(1);
    });

    server.listen(config.remote_port, () => {
        console.log('have a good time!'.brightGreen);
    });
}
