# Shadowsocks over WebSocket

![License](https://img.shields.io/github/license/totravel/shadowsocks-ws)
![GitHub last commit](https://img.shields.io/github/last-commit/totravel/shadowsocks-ws)

shadowsocks-ws 是基于 WebSocket 的 Shadowsocks，支持 AEAD，支持反向代理，支持 TLS，可以部署在 PaaS 或 VPS 上，兼容 V2RayN。

## 服务器部署

shadowsocks-ws 既可以处理 Shadowsocks over WebSocket (over TLS) 流量，也可以处理 HTTP(S) 请求。对于后者，默认使用项目根目录下的 `index.html` 作为响应。

shadowsocks-ws 使用下列环境变量：

- 基本
  - `METHOD` 加密方式，仅支持 `aes-256-gcm` 和 `chacha20-poly1305`，默认 `aes-256-gcm`
  - `PASS` 密码，默认 `secret`
  - `PORT` 端口，默认 `80`
- 高级
  - `PROXY` 反向代理的目标网站，如 `https://github.com`，默认空
  - `CERT` 证书的路径，默认空
  - `CERT_KEY` 私钥的路径，默认空

### 部署到 PaaS

已知 shadowsocks-ws 可以部署在下列 PaaS 上：

- [Heroku][heroku]
- [Railway][railway]
- [Render][render]
- [Adaptable][adaptable]

环境变量的配置方法请参考各平台官方文档。

### 部署到 VPS

克隆代码、安装依赖、打包模块：

```bash
git clone https://github.com/totravel/shadowsocks-ws.git
cd shadowsocks-ws
npm i
npm run build
```

#### 使用 PM2 创建守护进程

将 [PM2][pm2] 配置文件的模板 `ecosystem.config.js.example` 重命名为 `ecosystem.config.js` 并根据需要修改 `env` 结点下的字段。

```js
module.exports = {
  apps: [
    {
      name: "shadowsocks-ws",
      script: "./server.min.mjs",
      env: {
        "NODE_ENV": "production",
        "METHOD": "aes-256-gcm",
        "PASS": "secret",
        "PORT": 80
      }
    }
  ]
}
```

安装 PM2 并创建守护进程：

```bash
npm install pm2 -g
pm2 start ecosystem.config.js
```

`pm2` 命令的更多用法请参考 [PM2][pm2] 官方文档。

#### 配置 SSL 证书以启用 TLS

在配有域名和证书的主机上，要启用 TLS，只需添加环境变量 `CERT` 和 `CERT_KEY`，分别指定证书和私钥的路径即可。

```js
module.exports = {
  apps: [
    {
      name: "shadowsocks-ws",
      script: "./server.min.mjs",
      env: {
        "NODE_ENV": "production",
        "METHOD": "aes-256-gcm",
        "PASS": "secret",
        "CERT": "fullchain.pem",   // your full chain certs
        "CERT_KEY": "privkey.pem", // your cert key
        "PORT": 443
      }
    }
  ]
}
```

重载配置文件以生效：

```bash
pm2 reload ecosystem.config.js
```

## 客户端配置

下载并运行 [V2RayN][v2rayn]：

1. 菜单栏 > 服务器 > 添加[Shadowsocks]服务器
    1. 填写地址、端口、密码、加密方式
    1. 传输协议选择 `ws`
    1. 有启用 TLS 的，传输层安全选择 `tls`
1. 菜单栏 > 设置
    1. 参数设置 > 关闭 UDP
    1. 路由设置 > 菜单栏 > 域名解析策略 > IPIfNonMatch
1. 底栏 > 路由 > 绕开大陆或黑名单
1. 底栏 > 系统代理 > 自动配置系统代理

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
- [2dust/v2rayN][v2rayn] A GUI client for Windows, support Xray core and v2fly core and others

## 许可协议

[MIT](LICENSE)

[heroku]: https://www.heroku.com/
[railway]: https://railway.app/
[render]: https://render.com/
[adaptable]: https://adaptable.io/

[pm2]: https://github.com/Unitech/pm2
[v2rayn]: https://github.com/2dust/v2rayN

[ws]: https://github.com/websockets/ws
[express]: https://expressjs.com/
[proxy]: https://github.com/chimurai/http-proxy-middleware
[dohjs]: https://github.com/byu-imaal/dohjs
[colors]: https://github.com/Marak/colors.js
[qrcode]: https://github.com/soldair/node-qrcode

[ss2022]: https://github.com/Shadowsocks-NET/shadowsocks-specs
