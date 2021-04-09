"use strict";

const fs = require('fs');

function loadFile(path) {
    return new Promise((resolve, reject) => {
        try {
            resolve(fs.readFileSync(path, { encoding: 'utf8' }));
        } catch (err) {
            resolve(null);
        }
    });
}

function parseJSON(str) {
    return new Promise((resolve, reject) => {
        try {
            resolve(JSON.parse(str));
        } catch (err) {
            resolve(null);
        }
    });
}

function getNodeMajorVersion() {
    return Number(process.version.substring(1).split('.')[0]);
}

module.exports = { loadFile, parseJSON, getNodeMajorVersion };
