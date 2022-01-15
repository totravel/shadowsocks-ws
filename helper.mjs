
import fs from 'fs'

export function loadFile(path) {
    return new Promise((resolve, reject) => {
        try {
            resolve(fs.readFileSync(path, { encoding: 'utf8' }))
        } catch (err) {
            resolve(null)
        }
    })
}

export function parseJSON(str) {
    return new Promise((resolve, reject) => {
        try {
            resolve(JSON.parse(str))
        } catch (err) {
            resolve(null)
        }
    })
}

export function getNodeMajorVersion() {
    return Number(process.version.substring(1).split('.')[0])
}
