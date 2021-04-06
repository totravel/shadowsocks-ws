"use strict";

const url = require('url');
const net = require('net');
const http = require('http');
const https = require('https');
const colors = require('colors');
const WebSocket = require('ws');
const DnsOverHttpResolver = require('dns-over-http-resolver');
const { loadFile, parseJSON } = require('./helper');

(async () => {
    console.clear();
    const banner = await loadFile('banner.txt');
    console.log(banner);

    console.log('loading...');
    const config = await parseJSON(await loadFile('config.json'));
    if (config === null) {
        console.error('failed to load config'.red);
        process.exit(1);
    }

    global.verbose = config.verbose;
    showURL(config);

    const parsed = url.parse(config.remote_address);
    const hostname = parsed.hostname;
    const options = {
        hostname,
        timeout: 3000,
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:86.0) Gecko/20100101 Firefox/86.0'
        }
    };

    // console.log('debugging...');
    // global.verbose = true;
    // options.lookup = (host, opt, cb) => cb(null, '127.0.0.1', 4);
    // start(config.remote_address, config.local_port, options);
    // return;

    console.log('resolving...', hostname.gray);
    const resolver = new DnsOverHttpResolver();
    resolver.setServers([ config.dns ]);
    const record4 = await resolve4(resolver, hostname);
    const record6 = await resolve6(resolver, hostname);
    const record = record4.concat(record6);
    if (record.length === 0) {
        console.error('failed to resolve host'.red);
        process.exit(1);
    }
    if (verbose) console.log(record);

    let min = Infinity;
    let fast = null;
    const h = parsed.protocol === 'wss:' ? https : http;
    for (const addr of record) {
        const atyp = net.isIP(addr);
        if (verbose) console.log(atyp);
        if (atyp) {
            console.log('trying...', addr.gray);
            options.lookup = (host, opt, cb) => cb(null, addr, atyp);
            let t = Date.now();
            const available = await attempt(h, options);
            t = Date.now() - t;
            if (available) {
                console.log('%dms'.gray, t);
                if (t < min) min = t, fast = { addr, atyp };
                continue;
            }
            console.log('unavailable'.gray);
        }
    }
    if (fast === null) {
        console.error('something bad happened'.red);
        process.exit(1);
    }

    console.log('using %s used %dms', fast.addr, min);
    options.lookup = (host, opt, cb) => cb(null, fast.addr, fast.atyp);
    start(config.remote_address, config.local_port, options);
})();

function showURL(c) {
    const userinfo = Buffer.from(c.method + ':' + c.password).toString('base64');
    console.log(colors.gray('ss://' + userinfo + '@' + c.local_address + ':' + c.local_port));
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

function attempt(h, options) {
    return new Promise((resolve, reject) => {
        const req = h.request(options, res => {
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

function start(remote_address, local_port, options) {
    const server = net.createServer();

    server.on('connection', c => {
        const ws = new WebSocket(remote_address, null, options);

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
            console.error('unexpected-response'.red, 'check your server and try again');
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

    server.listen(local_port, () => {
        console.log('server has started');
        console.log('have a good time!'.brightGreen);
    });
}
