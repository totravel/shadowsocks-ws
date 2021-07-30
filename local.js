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
    console.log(await loadFile('banner.txt'));

    console.log('loading...');
    const config = await parseJSON(await loadFile('config.json'));
    if (config === null) {
        console.error('failed to load config'.red);
        process.exit(1);
    }

    global.verbose = config.verbose;
    showURL(config);

    const timeout = config.timeout;
    const parsed = url.parse(config.remote_address);
    const hostname = parsed.hostname;
    const options = {
        timeout,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
            'Accept-Encoding': 'gzip, deflate, br'
        }
    };

    if (net.isIP(hostname)) {
        start(config.remote_address, config.local_port, options);
        return;
    }

    options.origin = parsed.protocol === 'wss:' ? 'https://' : 'http://';
    options.origin += hostname;
    options.headers.Host = hostname;

    if (net.isIP(config.lookup)) {
        start(parsed.protocol + '//' + config.lookup, config.local_port, options);
        return;
    }

    console.log('resolving...', hostname.gray);
    const resolver = new DnsOverHttpResolver();
    resolver.setServers([ config.dns ]);
    const records4 = await resolve4(resolver, hostname);
    const records6 = await resolve6(resolver, hostname);
    const records = records4.concat(records6);
    if (records.length === 0) {
        console.error('failed to resolve host'.red);
        process.exit(1);
    }
    if (verbose) console.log(records);

    let min = Infinity, addr = null;
    for (const record of records) {
        const atyp = net.isIP(record);
        if (atyp) {
            console.log('trying...', record.gray);
            options.host = record;
            let t = Date.now();
            const retval = await attempt(parsed.protocol, options);
            t = Date.now() - t;
            if (retval) {
                console.log('%dms'.gray, t);
                if (t < min) min = t, addr = record;
                continue;
            }
            console.log('failed'.gray);
        }
    }
    if (addr === null) {
        console.error('something bad happened'.red);
        process.exit(1);
    }
    console.log('using %s used %dms', addr, min);

    start(parsed.protocol + '//' + addr, config.local_port, options);
})();

function showURL(c) {
    const userinfo = Buffer.from(c.method + ':' + c.password).toString('base64');
    const url = 'ss://' + userinfo + '@' + c.local_address + ':' + c.local_port;
    console.log(url.gray);
}

function resolve4(resolver, hostname) {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(await resolver.resolve4(hostname));
        } catch (err) {
            if (verbose) console.error('resolve4'.red, err);
            resolve([]);
        }
    });
}

function resolve6(resolver, hostname) {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(await resolver.resolve6(hostname));
        } catch (err) {
            if (verbose) console.error('resolve6'.red, err);
            resolve([]);
        }
    });
}

function attempt(protocol, options) {
    return new Promise((resolve, reject) => {
        const req = (protocol === 'wss:' ? https : http).request(options, res => {
            if (res.headers['set-cookie']) {
                if (verbose) console.log(res.headers['set-cookie']);
                options.headers.cookie = res.headers['set-cookie'][0].split(';')[0];
            }
            if (verbose) {
                res.setEncoding('utf8');
                res.once('data', chunk => {
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

        req.on('error', err => null);
        req.end();
    });
}

function start(remote_address, local_port, options) {
    const server = net.createServer();

    server.on('connection', c => {
        const ws = new WebSocket(remote_address, options);

        ws.on('open', () => {
            ws.s = WebSocket.createWebSocketStream(ws);
            ws.s.pipe(c);
            c.pipe(ws.s);

            ws.s.on('error', err => {
                if (verbose) console.error('pipe'.red, err);
            });
        });

        ws.on('close', () => {
            ws.s?.destroy();
            c.destroyed || c.destroy();
        });

        ws.on('unexpected-response', (req, res) => {
            console.error('unexpected-response'.red, 'check your server and try again');
            ws.s?.destroy();
            c.destroyed || c.destroy();
            server.close();
        });

        ws.on('error', err => {
            if (verbose) console.error('ws'.red, err);
            ws.s?.destroy();
            c.destroyed || c.destroy();
        });

        c.on('close', () => {
            ws.s?.destroy();
            ws.terminate();
        });

        c.on('error', err => {
            if (verbose) console.error('connection'.red, err);
            ws.s?.destroy();
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
