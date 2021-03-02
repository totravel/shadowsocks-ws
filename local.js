"use strict";

const fs = require('fs');
const url = require('url');
const net = require('net');
const https = require('https');
const colors = require('colors');
const WebSocket = require('ws');
const DnsOverHttpResolver = require('dns-over-http-resolver');

(async () => {
    console.clear();
    const banner = await loadFile('banner.txt');
    console.log(banner);

    console.log('loading...');
    const str = await loadFile('config.json');
    if (str === null) {
        console.error('failed'.red);
        process.exit(1);
    }

    console.log('parsing...');
    const config = await parseJSON(str);
    if (config === null) {
        console.error('failed'.red);
        process.exit(1);
    }

    global.verbose = config.verbose;
    showURL(config);

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

    console.log('resolving...', hostname.gray);
    const resolver = new DnsOverHttpResolver();
    resolver.setServers([ config.dns ]);
    const record4 = await resolve4(resolver, hostname);
    const record6 = await resolve6(resolver, hostname);
    const record = record4.concat(record6);
    if (record.length === 0) {
        console.error('failed'.red);
        process.exit(1);
    }
    if (verbose) console.log(record);

    let min = Infinity;
    let fast = null;
    for (const addr of record) {
        const atyp = net.isIP(addr);
        if (verbose) console.log(atyp);
        if (atyp) {
            console.log('trying...', addr.gray);
            options.lookup = (h, o, cb) => cb(null, addr, atyp);
            let t = Date.now();
            const available = await testServer(options);
            t = Date.now() - t;
            if (available) {
                console.log('%dms'.gray, t);
                if (t < min) min = t, fast = { addr, atyp };
                continue;
            }
            console.error('unavailable'.gray);
        }
    }
    if (fast === null) {
        console.error('something bad happened'.red);
        process.exit(1);
    }

    console.log('using %s used %dms', fast.addr, min);
    options.lookup = (h, o, cb) => cb(null, fast.addr, fast.atyp);
    startServer(config, options);
})();

function loadFile(path) {
    return new Promise((resolve, reject) => {
        try {
            resolve(fs.readFileSync(path, { encoding: 'utf8' }));
        } catch (err) {
            console.error('fs'.red, err);
            resolve(null);
        }
    });
}

function parseJSON(str) {
    return new Promise((resolve, reject) => {
        try {
            resolve(JSON.parse(str));
        } catch (err) {
            console.error('json'.red, err);
            resolve(null);
        }
    });
}

function showURL(c) {
    const userinfo = Buffer.from(c.method + ':' + c.password).toString('base64');
    console.log(colors.gray('ss://' + userinfo + '@' + c.server + ':' + c.remote_port));
}

function resolve4(resolver, hostname) {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(await resolver.resolve4(hostname));
        } catch (err) {
            if (verbose) console.error('ipv4'.red, err);
            resolve([]);
        }
    });
}

function resolve6(resolver, hostname) {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(await resolver.resolve6(hostname));
        } catch (err) {
            if (verbose) console.error('ipv6'.red, err);
            resolve([]);
        }
    });
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
                    resolve(true);
                });
            } else {
                resolve(true);
            }
        });

        req.on('timeout', () => {
            if (verbose) console.error('timeout'.red);
            req.destroy();
            resolve(false);
        });

        req.on('error', err => {
            if (verbose) console.error('request'.red, err);
            resolve(false);
        });

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
                if (verbose) console.error('pipe'.red, err);
            });
        });

        ws.on('close', () => {
            ws.d?.destroy();
            c.destroyed || c.destroy();
        });

        ws.on('unexpected-response', (req, res) => {
            console.error('unexpected response!'.red);
            console.error('this means the server is not installed correctly.');
            ws.d?.destroy();
            c.destroyed || c.destroy();
            server.close();
        });

        ws.on('error', err => {
            if (verbose) console.error('remote'.red, err);
            ws.d?.destroy();
            c.destroyed || c.destroy();
        });

        c.on('close', () => {
            ws.d?.destroy();
            ws.terminate();
        });

        c.on('error', err => {
            if (verbose) console.error('local'.red, err);
            ws.d?.destroy();
            ws.terminate();
        });
    });

    server.on('error', err => {
        console.error('server'.red, err);
        process.exit(1);
    });

    server.listen(config.remote_port, () => {
        console.log('have a good time!'.brightGreen);
    });
}
