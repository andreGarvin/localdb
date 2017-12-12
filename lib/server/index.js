const { watchFile, readdirSync } = require('fs')

const http = require('http')

const { unCompressGzip } = require('../compressor')
const notUndefined = require('../notUndefined')

const Watcher = require('watch-fs').Watcher

module.exports = (server_opts, db, db_file_path) => {
    const { PORT = 8080 } = server_opts
    
    let db_stream = db;

    const server = (req, res) => {

        if (req.method === 'GET') {
            const path = req.url

            if (path !== '/favicon.ico') {
                switch (path) {
                    case '/':
                        const content = JSON.stringify(db_stream)
                        res.writeHead(200, {
                            'Content-Type': 'Application/json',
                            'Content-Length': content.length
                        })
                        res.end(content)
                        return;
                    default:
                        const __name__ = path.split('/').filter(i => i !== '')[0]

                        console.log(__name__, path)
                        if (notUndefined(__name__)) {
                            const collection = __name__ === '__state__' ? db_stream[__name__] : db_stream[__name__].data

                            if (notUndefined(collection)) {
                                const content = JSON.stringify(collection)
                                res.writeHead(200, {
                                    'Content-Type': 'Application/json',
                                    'Content-Length': content.length
                                })
                                res.end(content)
                                return;
                            } else {
                                const content = JSON.stringify({
                                    message: `localdb: collection name ['${__name__}'] does not exist`,
                                    statusCode: 404
                                })

                                res.writeHead(404, {
                                    'Content-Type': 'Application/json',
                                    'Content-Length': content.length
                                })
                                res.end(content)
                                return;
                            }
                        }
                        break;
                }
            }
        }
    }

    const watcher = new Watcher({
        paths: [ db_file_path ]
    })

    watcher.start((err, failed) => undefined);

    watcher.on('change', () => {
        return unCompressGzip(db_file_path)
            .then(new_db_stream => {
                db_stream = JSON.parse(new_db_stream)
            })
    })

    const s = http.createServer(server)

    return new Promise((resolve, reject) => {
        try {
            return resolve(s.listen(PORT))
        } catch (e) {
            return reject(e)
        }
    })
}