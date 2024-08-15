module.exports = {
  apps : [{
    name: "shadowsocks-ws",
    script: "./server.min.js",
    env: {
      "NODE_ENV": "production",
      "METHOD": "aes-256-gcm",
      "PASS": "secret",
      "PROXY": "https://github.com",
      "PORT": 80
    }
  }]
}