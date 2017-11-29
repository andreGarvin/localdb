const { existsSync, lstatSync, readFileSync, writeFileSync } = require('fs')
const { gzip, gunzip } = require('zlib')
const path = require('path')

function convertToString(data) {
    let str_data;

    switch (typeof data) {
        case 'number':
            str_data = data.toString()
        case 'boolean':
            str_data = data.toString()
        case 'object':
            str_data = JSON.stringify(data)
        default:
            if (Array.isArray(data)) {
                str_data = JSON.stringify(data)
            }
    }
    return str_data
}

module.exports.CompressToGzip = (_path, data) => {
    return new Promise((resolve, reject) => {
        if (_path === undefined || _path.trim().length === 0) {
            return reject('Undefined or no path was given to create compressed gzip file.')
        }

        if (typeof data === 'string') {
            if (data === undefined || data.trim().length === 0) {
                return reject('No data was given to compress to a gzip')
            }
            data = new Buffer(data)
        } else {
            if ([null, undefined].includes(data)) {
                return reject(`Can store data of type ${typeof data}, data mmust be a string.`)
            }
            data = new Buffer(convertToString(data))
        }

        const abs_gz_path = path.resolve( path.extname(_path) !== '.gz' ? `${_path}.gz` : _path)
        gzip(data, (err, gzip_data) => {
            if (err) {
                return reject(err)
            }

            writeFileSync(abs_gz_path, gzip_data)
            return resolve(abs_gz_path)
        })
    })
}

module.exports.unCompressGzip = (_path, dest_path) => {
    return new Promise((resolve, reject) => {
        if (_path === undefined || _path.trim().length === 0) {
            return reject('Undefined or no path was given to read gzip file.')
        }

        const abs_path = path.resolve(_path)
        if (existsSync(abs_path)) {
            if (!lstatSync(abs_path).isDirectory()) {
                const gz_data = readFileSync(abs_path)

                gunzip(gz_data, (err, ungzip_data) => {
                    if (!err) {
                        if (dest_path === undefined || dest_path.trim().length === 0) {
                            return resolve(ungzip_data.toString())
                        } else {

                            const abs_dest_path = path.resolve(dest_path)
                            writeFileSync(abs_dest_path, ungzip_data.toString(), 'utf8')
                            return resolve(abs_dest_path)
                        }
                    }
                    return reject(err)
                    
                })
                return
            }
            return reject(`Path to ${abs_path} is not a file.`)
        }
        return reject(`Path to ${abs_path} does not exist.`)
    })
}