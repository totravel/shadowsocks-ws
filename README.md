# Shadowsocks over WebSocket

![License](https://img.shields.io/github/license/totravel/shadowsocks-ws)
![GitHub last commit](https://img.shields.io/github/last-commit/totravel/shadowsocks-ws)

shadowsocks-ws 是基于 WebSocket 的 Shadowsocks，既可以部署在 [Heroku][heroku] 和 [Railway][railway] 等 PaaS 平台，也可以部署在常规的 VPS 上。

```
        socks5            tcp               websocket                tcp
client <------> ss-local <---> ss-ws-local <-- gfw --> ss-ws-remote <---> target
                encrypt                                decrypt
```

shadowsocks-ws 客户端（`ss-ws-local`）和 shadowsocks-ws 服务器（`ss-ws-remote`）之间使用 WebSocket 协议进行通信。shadowsocks-ws 客户端只负责转发经过加密的流量，须配合 [Shadowsocks for Windows][sfw] 等常规 Shadowsocks 客户端（`ss-local`）使用。shadowsocks-ws 服务器不仅是一个 Shadowsocks 服务器，还是一个支持反向代理的 Web 服务器，可以伪装成某个网站。

## 环境要求

- [Node.js][nodejs] 16+
- [Windows Terminal][wt]
- [Git for Windows][gfw]

## 服务器部署

作为一个 Shadowsocks 服务器，shadowsocks-ws 服务器使用的加密方案、密码和端口号分别由环境变量 `METHOD`、`PASS` 和 `PORT` 决定。目前，shadowsocks-ws 服务器仅支持 `chacha20-ietf-poly1305` 和 `aes-256-gcm` 两种加密方案。

作为一个支持反向代理的 Web 服务器，shadowsocks-ws 服务器默认使用根目录下的 `index.html` 作为网站主页。如果使用环境变量 `PROXY` 指定了一个网站，shadowsocks-ws 服务器就会成为那个网站的反向代理，从而伪装成那个网站。

### PaaS

- [Heroku][heroku]
- [Railway][railway]

### VPS

获取 shadowsocks-ws 的代码，安装 shadowsocks-ws 服务器依赖的第三方库：

```bash
git clone https://github.com/totravel/shadowsocks-ws.git
cd shadowsocks-ws
npm i
```

设置 shadowsocks-ws 服务器使用的加密方案、密码和端口号：

```bash
export METHOD=aes-256-gcm
export PASS=secret
export PORT=80
```

如有需要，可以设置反向代理的目标网站：

```bash
export PROXY='https://github.com'
```

生成并启动 shadowsocks-ws 服务器：

```bash
npm run build
npm start
```

#### 使用 PM2 创建守护进程

确认服务器可以正常工作后，就可以用 [PM2][pm2] 来创建守护进程了。

将 PM2 配置文件的模板 `ecosystem.config.js.example` 重命名为 `ecosystem.config.js` 并根据需要修改或注释 `env` 结点下的字段。

```js
module.exports = {
  apps : [{
    name: "shadowsocks-ws",
    script: "./server.min.js",
    env: {
      "NODE_ENV": "production",
      "PROXY": "https://github.com",
      "METHOD": "aes-256-gcm",
      "PASS": "secret",
      "PORT": 80
    }
  }]
}
```

安装 PM2 并创建守护进程：

```bash
npm install pm2 -g
pm2 start ecosystem.config.js
```

## 客户端配置

用户需要在本地同时运行 shadowsocks-ws 客户端和常规 Shadowsocks 客户端。

### shadowsocks-ws 客户端

获取 shadowsocks-ws 的代码，安装 shadowsocks-ws 客户端依赖的第三方库：

```bash
git clone https://github.com/totravel/shadowsocks-ws.git
cd shadowsocks-ws
npm i --omit=dev --omit=optional
```

将 shadowsocks-ws 客户端配置文件的模板 `config.json.example` 重命名为 `config.json` 并修改其中的 `server`、`password` 和 `method` 三个字段。

```json
{
  "nameserver": "https://doh.opendns.com/dns-query",
  "server": "https://*.up.railway.app/",
  "server_address": [],
  "local_address": "127.0.0.1",
  "local_port": 8787,
  "password": "secret",
  "method": "aes-256-gcm",
  "timeout": 5000,
  "show_qrcode": true,
  "show_url": false
}
```

如果 `server` 字段的主机部分不是一个 IP 地址，而是一个主机名，shadowsocks-ws 客户端就会自动进行 DNS 查询。如果服务器的 IP 地址已知并且已经用 `server_address` 字段一一列出，shadowsocks-ws 客户端就不会进行 DNS 查询。

`nameserver` 字段的值必须是 DoH 服务器的地址。下列取值供参考：

- [DNSPod](https://www.dnspod.cn/) `https://doh.pub/dns-query`
- [AliDNS](https://alidns.com/) `https://dns.alidns.com/dns-query`
- [360DNS](https://sdns.360.net/) `https://doh.360.cn/dns-query`
- [IPv6 DNS](https://www.ipv6dns.com/) `https://dns.ipv6dns.com/dns-query`
- [Cisco OpenDNS](https://www.opendns.com/) `https://doh.opendns.com/dns-query`
- [Cloudflare](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests) `https://1.1.1.1/dns-query`
- [Cloudflare](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests) `https://1.0.0.1/dns-query`
- [bebasdns](https://github.com/bebasid/bebasdns) `https://dns.bebasid.com/dns-query`
- [AlekBergNl](https://alekberg.net/) `https://dnsnl.alekberg.net/dns-query`
- [AlekBergSE](https://alekberg.net/) `https://dnsse.alekberg.net/dns-query`
- [adfree](https://usableprivacy.com/) `https://adfree.usableprivacy.net/query`
- [Cloudflare](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests) `https://cloudflare-dns.com/dns-query`

启动 shadowsocks-ws 客户端：

```bash
npm run local
```

### 常规 Shadowsocks 客户端

下文根据需要选择性阅读。

#### Shadowsocks for Windows

打开 [Shadowsocks for Windows][sfw]：

1. 系统托盘 > 上下文菜单
    1. 服务器 > 扫描屏幕上的二维码
    1. 系统代理 > PAC 模式

#### Clash for Windows

将配置文件的模板 `clash.yaml.example` 重命名为 `clash.yaml` 并修改 `cipher` 和 `password` 两个字段。

```yaml
proxies:
  - name: "ss1"
    type: ss
    server: 127.0.0.1
    port: 8787
    cipher: aes-256-gcm
    password: "secret"

proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - ss1

rules:
  - GEOIP,LAN,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,PROXY
```

打开 [Clash for Windows][cfw]：

1. 配置 > 导入上述配置文件
1. 主页 > 打开「系统代理」开关
1. 代理 > 规则

##### 获取和使用规则集

执行脚本 `ruleset.sh` 下载 [Clash 规则集][clash-rules]。

```bash
./ruleset.sh
```

使用规则集的配置文件的模板为 `blacklist.yaml.example` 或 `whitelist.yaml.example`。它们的用法与 `clash.yaml.example` 相同。

#### SagerNet for Android

将手机和电脑连接至同一网络，打开 [SagerNet for Android][sn]：

1. 右上角 > 添加服务器配置 > 扫描二维码
1. 修改服务器配置 > 将「服务器」字段由 `127.0.0.1` 修改为电脑的 IP 地址
1. 右下角 > 连接

#### shadowsocks-rust

另外再准备一个配置文件，例如：

```json
{
  "server": "127.0.0.1",
  "server_port": 8787,
  "password": "secret",
  "method": "aes-256-gcm",
  "local_address": "127.0.0.1",
  "local_port": 1080
}
```

然后用如下命令启动 [shadowsocks-rust][ss-rust]：

```bash
./sslocal -c config.json --log-without-time
```

## 常见问题

### 用常规 Shadowsocks 客户端连接 shadowsocks-ws 服务器失败？

不能直接用常规 Shadowsocks 客户端连接 shadowsocks-ws 服务器。要使用 shadowsocks-ws，必须先在本地运行 shadowsocks-ws 客户端，再让常规 Shadowsocks 客户端连接到 shadowsocks-ws 客户端。具体步骤见 [客户端配置](#客户端配置)。

### 如何确认 shadowsocks-ws 服务器已经部署成功并且可以正常访问？

直接在浏览器的地址栏中输入 shadowsocks-ws 服务器的地址并访问。如果可以看到 `You're free as a bird!`，就说明服务器已经可以正常访问。

### shadowsocks-ws 客户端提示所有 IP 地址都连接超时？

先用浏览器访问服务器，确保服务器可以访问。再修改配置文件中的 `nameserver` 字段并重试。

### shadowsocks-ws 支持 UDP 代理吗？

不支持。目前也没有支持 UDP 的计划。

## 求助和反馈

求助和反馈可以在 [Issues](https://github.com/totravel/shadowsocks-ws/issues) 版块进行。

## 讨论和交流

讨论和交流可以在 [Discussions](https://github.com/totravel/shadowsocks-ws/discussions) 版块进行。

## 鸣谢

- [websockets/ws][ws] Simple to use, blazing fast and thoroughly tested WebSocket client and server for Node.js
- [expressjs/express][express] Fast, unopinionated, minimalist web framework for node.
- [chimurai/http-proxy-middleware][proxy] The one-liner node.js http-proxy middleware for connect, express, next.js and more
- [byu-imaal/dohjs][dohjs] DNS over HTTPS client for use in the browser
- [Marak/colors][colors] get colors in your node.js console
- [soldair/qrcode][qrcode] qr code generator
- [Shadowsocks for Windows][sfw] A C# port of shadowsocks
- [Clash for Windows][cfw] clash for windows汉化版. 提供clash for windows的汉化版, 汉化补丁及汉化版安装程序
- [Loyalsoldier/clash-rules][clash-rules] Clash Premium 规则集(RULE-SET)，兼容 ClashX Pro、Clash for Windows 客户端。
- [SagerNet for Android][sn] The universal proxy toolchain for Android

## 许可协议

[MIT](LICENSE)

[nodejs]: https://nodejs.dev/en/download/
[wt]: https://github.com/microsoft/terminal
[gfw]: https://gitforwindows.org/

[pm2]: https://github.com/Unitech/pm2

[heroku]: https://www.heroku.com/
[railway]: https://railway.app/

[sfw]: https://github.com/shadowsocks/shadowsocks-windows
[cfw]: https://github.com/ender-zhao/Clash-for-Windows_Chinese
[clash-rules]: https://github.com/Loyalsoldier/clash-rules
[sn]: https://github.com/SagerNet/SagerNet
[ss-libev]: https://github.com/shadowsocks/shadowsocks-libev
[go-ss2]: https://github.com/shadowsocks/go-shadowsocks2
[ss-rust]: https://github.com/shadowsocks/shadowsocks-rust

[ws]: https://github.com/websockets/ws
[express]: https://expressjs.com/
[proxy]: https://github.com/chimurai/http-proxy-middleware
[dohjs]: https://github.com/byu-imaal/dohjs
[colors]: https://github.com/Marak/colors.js
[qrcode]: https://github.com/soldair/node-qrcode

[ss2022]: https://github.com/Shadowsocks-NET/shadowsocks-specs
