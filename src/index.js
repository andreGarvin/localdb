const {
    writeFileSync,
    readFileSync,
    readdirSync,
    existsSync,
    mkdirSync,
} = require('fs')
const path = require('path')

const rimraf = require('rimraf')

const { CompressToGzip, unCompressGzip } = require('./lib/compressor')
const notUndefined = require('./lib/notUndefined')

/**
 * This is the data that was inside of the desired collection list of the
 * database. The collectio is what ever you put in the data base.
 * @typedef collection
 */

/**
 * This a prop that could conatin anything on retreive. It can be a Object,
 * array,sntring, or any data type except null or undefined.
 * @typedef data_object
 */

/**
 * This a like a QueryObject but give the type of action ypu want to perform and a paylaod
 * @property {string} type Its can be a 'add', 'del', 'update', 'fetch'
 * @property {payload}
 */

/**
 * This is a used to give the methods to act upon certain queries made
 * to the database.
 * @property __name__ teh name of the colection in the database to target
 * @property data_object the data to use and act upon revtrievel
 * @typedef QueryObject
 */


/**
 * @classdesc This is the local database manger on the local machine
 * controls the data created, deleted, upated and as well as the data
 * flow on bucket on the local computer
 * @class
 */
class localdb {
    constructor(dbconf) {
        // the database conf object based to create the leveldb database folder
        this.dbconf = dbconf;

        this.db = {};
        this.compressed_file_path;

        if (!notUndefined(this.dbconf)) {
            throw new Error('localdb was given a undefined config.')
        }

        if (this.dbconf.__name__ === undefined || this.dbconf.__name__.trim().length === 0) {
            throw new Error('No name was given for localdb')
        }

        // creates the localdb folder path
        this.db_path = `${path.resolve(this.dbconf.__name__)}@localdb`
        if (!existsSync(this.db_path)) {
            this.db = {
                state: {
                    dbs: [],
                    size: 0,
                    health: '',
                    synced: null
                }
            }

            // creates the folder
            mkdirSync(this.db_path)

            // creates the file path to the db file
            const db_file_path = path.resolve(this.db_path, `${Math.random().toString(16).slice(2)}.db`)
            CompressToGzip(db_file_path, this.db)
                .then(gz_path => {
                    this.compressed_file_path = gz_path
                })
                .catch(err => {
                    throw new Error(err)
                })
        } else {
            const file_name = readdirSync(this.db_path).filter(i => path.extname(i) === '.gz').join('')
            
            this.compressed_file_path = path.resolve(this.db_path, file_name)
            unCompressGzip(this.compressed_file_path)
                .then(db_stream => {
                    this.db = Object.assign(this.db, JSON.parse(db_stream))
                })
                .catch(err => console.log(err))
        }

        // fetching the leveldb state
        // this.__fetch_state__()
        //     .then(state => {
        //         this.__state__ = state
        //     })
        //     .catch(err => err)

        process.on('beforeExit', () => {
            this.close()
        })
    }

    on(__name__, cb) {
        process.on(__name__, payload => {
            return cb(payload)
        })
    }

    /**
     * This grabs the data and compresses it before the node process exits
     * and returns a process.exit() to close the process when the aync/await
     * call is finshed updating the new data stream in the db file.
     * @return {void} 
     */
    close() {

        async function writeTo_db() {
            const db_stream = JSON.parse(await unCompressGzip(this.compressed_file_path))
            const new_db_stream = Object.assign(db_stream, this.db)

            await CompressToGzip(this.compressed_file_path, JSON.stringify(new_db_stream))
            return process.exit()
        }

        return writeTo_db.call(this)
            .catch(err => console.log(err))
    }

    /**
     * Creates a collections in leveldb with a gievn input, returns
     * that collection or a error if a error occurs.
     * @param {QueryObject} QueryObject 
     * @return {(Promise.collection|Promise.string)}
     */
    create(QueryObject) {
        // extracts the __name__ and the insertion object
        let { __name__, data_object } = QueryObject;

        return new Promise((resolve, reject) => {
            if (__name__ === undefined || __name__.trim().length === 0) {
                return reject( new Error('No collection name was given for the database in localdb.') )
            }

            // if (__name__ !== '__state__') {
            //     // updates the state in the database
            //     const state_dbs = this.__state__ ? this.__state__.dbs : []
            //     if (!state_dbs.includes(__name__)) {
            //         // Que.emit('change')
            //         this.__changeState__(this.__state__, {
            //             type: 'ADD_DB',
            //             payload: [...state_dbs, __name__]
            //         })
            //     }
            // }

            this.db[__name__] = data_object
            return resolve(this.db[__name__])
        })
    }

    /**
     * This deletes collections or collection properties from the database.
     * @param {QueryObject } QueryObject defined in the typedef for
     * @return {Promise.collection }
     */
    deleteProp(db_path) {

        return new Promise((resolve, reject) => {
            if (db_path === undefined || db_path.trim().length === 0) {
                return reject(new Error('Path was undefined or was not given.') )
            }

            const __name__ = db_path.split('/')[1]
            return this.getCollection(__name__)
                .then(collection => {

                    // clean the database path to reflect the object/coolection in the localdb
                    /*
                        /bar/this/is/dumb
                            bar === __name__
                            /this/is/dumb === 'collection_path'
                    */
                    db_path = `/${db_path.split('/').slice(2).join('/')}`
                    const collection_frag = inspect(db_path, collection, {
                        type: 'del'
                    })

                    if (collection_frag === undefined) {
                        return resolve(undefined)
                    }

                    if (collection_frag.message !== undefined) {
                        return reject(collection_frag.message)
                    }

                    // this converts it back to a db_path that was given
                    db_path = `/${__name__}/${db_path.split('/').slice(0, -1).join('/')}`
                    return this.updateProp(db_path, {
                        payload: collection_frag
                    })
                        .then(() => resolve(undefined))
                        .catch(err => reject(err))
                })
                .catch(err => reject(err))
        })
    }

    /**
     * This returns that data speficed in the collection
     * @param {string} _path the path of the props on the collection
     * @param {Object} action Its is decibed in the typedef of {action}
     * @return {(Promise.collection|Promise.string)}
     */
    fetchProp(db_path) {

        return new Promise((resolve, reject) => {
            if (db_path === undefined || db_path.trim().length === 0) {
                return reject( new Error('Path was undefined or was not given.') )
            }

            const __name__ = db_path.split('/')[1]

            if (Object.keys(this.db).length !== 0) {
                const collection = this.db[__name__]

                if (collection !== undefined) {
                    db_path = `/${db_path.split('/').slice(2).join('/')}`
                    const collection_frag = inspect(db_path, collection)

                    if (collection_frag.message !== undefined) {
                        return reject(collection_frag)
                    }
                    return resolve(collection_frag)
                }

                return reject( new Error(`localdb could not find collection name ['${__name__}'].`) )
            }

            return this.getCollection(__name__)
                .then(collection => {
                    db_path = `/${db_path.split('/').slice(2).join('/')}`
                    const collection_frag = inspect(db_path, collection)

                    if (collection_frag.message !== undefined) {
                        return reject(collection_frag)
                    }
                    return resolve(collection_frag)
                })
                .catch(err => reject(err))
        })
    }

    /**
     * Retruns a collection from the sepified collection name or a error.
     * @param {string} __name__ name of the collection
     * @return {(Promise.collection}
     */
    getCollection(__name__) {

        return new Promise((resolve, reject) => {
            if (__name__ === undefined || __name__.trim().length === 0) {
                return reject( new Error('No collection name was given for the database in localdb.') )
            }

            if (Object.keys( this.db ).length !== 0) {
                const collection = this.db[__name__]

                if (collection !== undefined) {
                    return resolve(collection)
                }

                return reject( new Error(`localdb could not find collection name ['${ __name__ }'].`) )
            }

            return unCompressGzip(this.compressed_file_path)
                .then(db_stream => {
                    db_stream = JSON.parse(db_stream)
                    
                    if (!notUndefined(db_stream)) {
                        return reject( new Error('localdb db data stream is corrupted; returned undefined value.') )
                    }

                    const collection = db_stream[__name__]
                    if (notUndefined(collection)) {
                        return resolve(collection)
                    }
                    return reject(new Error(`localdb could not find collection name ['${__name__}'].`))
                })
        })
    }

    /**
     * Destorys colletion or collections inside of leveldb given a collection name.
     * However state will not be deleted it will throw a reject if state is being deleted.
     * @param {string} ___name__ name of the collection
     * @return {Promise.void}
     */
    teardown(__name__) {
        
        async function deleteCollection(__name__) {
            const db_stream = JSON.parse(
                await unCompressGzip(this.compressed_file_path)
            )

            delete db_stream[__name__]
            this.db = db_stream
            return await CompressToGzip(this.compressed_file_path, JSON.stringify(db_stream))
        }

        return new Promise((resolve, reject) => {
            if (__name__ === undefined || __name__.trim().length === 0) {
                return reject( new Error('No name was given for the database in localdb') )
            }

            if ( Object.keys( this.db ).length !== 0 ) {
                delete this.db[__name__]
                return resolve(undefined)
            }

            return deleteCollection.call(this, __name__)
                .then(() => resolve(undefined))
                .catch(err => reject(err))
        })
    }

    updateProp(db_path, payload) {

        async function updateCollectionPath(db_path, action) {
            // extracts the name from the db_path
            const __name__ = db_path.split('/')[1]

            // cleans the db the data again
            db_path = `/${db_path.split('/').slice(2).join('/')}`
            let collection = await this.getCollection(__name__)

            // updates the object
            if (db_path === '/') {
                collection = Object.assign(collection, action.payload)
            } else {
                inspect(db_path, collection, action)
            }
            this.db[__name__] = collection

            process.emit(__name__, collection)
            // returns the new object
            return await collection
        }

        return new Promise((resolve, reject) => {
            // checks if the a db_path was given
            if (db_path === undefined || db_path.trim().length === 0) {
                return reject( new Error('No db path was to search through collection paths') )
            } else if (payload === undefined || (Object.keys(payload).length === 0 && Object.values(payload).length === 0)) {
                // checks if a payload was given
                return reject( new Error('No paylaod data was given') )
            }

            payload = {
                ...payload,
                type: 'upd'
            }
            return updateCollectionPath.call(this, db_path, payload)
                // return the new updated collection Object
                .then(collection => resolve(collection))
                .catch(err => reject(err))
        })
    }

    /**
     * This deletes the database folder
     * @return {void}
     */
    drop() {
        return rimraf.sync(this.db_path)
    }
}

module.exports = localdb

/**
 * This fetchs, deletes, updates, adn inserts data to a object passed in
 * @param {(string|array)} path The path to go through of the object 
 * @param {Object} obj the object you want to inspect
 * @param {Object} action the 
 */
function inspect(path, obj, action) {
    if (!path) {
        return new Error('No path was given.')
    }

    // turns the path splited into array 
    if (!Array.isArray(path)) {
        path = path.split('/').slice(1).filter(i => i !== '')
    } else if (path.length === 0) {
        return new Error('No path was given.')
    } else if (obj === undefined || Object.keys(obj).length === 0) {
        return new Error('No object was passed to inspect.')
    }

    // checks if there is a first item and there is more paths to go to
    if (path[0] !== undefined && path.length !== 1) {

        // checks if the path on the object being inspected exists on the object
        if (!obj[path[0]]) {
            return new Error(`Path to property<'${path[0]}'> or Object<'${path[0]}'> does not exist on Object.`)
        }

        // slices the path to the next path and pass the object being inspected
        return inspect(path.slice(1), obj[path[0]], action)
    } else {

        // If there is not more paths then return the object
        if (!path[0]) {
            return obj
        }

        // if the action was given
        if (action !== undefined) {

            const { type, payload } = action
            switch (type) {
                case 'del':
                    delete obj[path[0]]
                    break;
                case 'inst':
                    obj[path[0]] = payload[i]
                    break;
                case 'upd':
                    obj[path[0]] = payload
                    break;
            }
            return payload || obj
        }

        if (!obj[path[0]]) {
            return new Error(`Path to property<'${path[0]}'> or Object<'${path[0]}'> does not exist on Object.`)
        }
        return obj[path[0]]
    }
}