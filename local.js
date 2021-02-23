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
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:85.0) Gecko/20100101 Firefox/85.0'
        }
    };

    let dnsRecord = null;
    try {
        console.log('resolving...', hostname.gray);
        const resolver = new DnsOverHttpResolver();
        resolver.setServers([config.dns]);
        dnsRecord = await resolver.resolve(hostname);
        verbose && console.log(dnsRecord);
    } catch (err) {
        console.log('doh', err);
        process.exit(1);
    }

    let err = true;
    for (const addr of dnsRecord) {
        try {
            console.log('trying...', addr.gray);
            options.lookup = (h, o, cb) => cb(null, addr, 4);
            await getCookie(options);
            err = false;
            break;
        } catch (err) {}
    }
    if (err) {
        console.log('something happened'.red);
        process.exit(1);
    }

    startServer(config, options);
})();

function showURL(c) {
    const userinfo = Buffer.from(c.method + ':' + c.password).toString('base64');
    console.log(colors.gray('ss://' + userinfo + '@' + c.server + ':' + c.remote_port));
}

function getCookie(options) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            if (res.headers['set-cookie'])
                options.headers.cookie = res.headers['set-cookie'][0].split(';')[0];
            if (verbose) {
                console.log(res.headers['set-cookie']);
                res.setEncoding('utf8');
                res.once('data', (chunk) => {
                    console.log(chunk.gray);
                });
            }
            resolve();
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
                verbose && console.log('pipe', err);
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
            verbose && console.log('remote', err);
            ws.d?.destroy();
            c.destroyed || c.destroy();
        });

        c.on('close', () => {
            ws.d?.destroy();
            ws.terminate();
        });

        c.on('error', err => {
            verbose && console.log('local', err);
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
