const {
    readdirSync,
    existsSync,
    mkdirSync,
    watch,
} = require('fs')
const path = require('path')

const diff = require('@andre_garvin/diff')
const rimraf = require('rimraf')
const uuid = require('uuid')

const { CompressToGzip, unCompressGzip } = require('./lib/compressor')
const inspectObject = require('./lib/inspectObject')
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
 * @property {string} data This is the data you wanty to insert of update.
 * @typedef payload
 */

/**
 * This is a used to give the methods to act upon certain queries made
 * to the database.
 * @property __name__ teh name of the colection in the database to target
 * @property data_object the data to use and act upon revtrievel
 * @typedef QueryObject
 */

const notUndefined = (e) => e !== undefined 

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

        // this the database object being inside the gz file
        this.db = {};

        // this the middleware and you want to inject between functions
        this.extensions = [];
        this.__state__ = {
            dbs: [],
            size: 0,
            health: '',
            synced: null
        }
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
            this.db = Object.assign({}, { __state__: this.__state__ })
            
            // creates the folder
            mkdirSync(this.db_path)

            // creates the file path to the db file
            const db_file_path = path.resolve(this.db_path, `${Math.random().toString(16).slice(2)}.db`)
            CompressToGzip(db_file_path, this.db)
                .then(gz_path => {
                    this.compressed_file_path = gz_path
                })
                .catch(err => {
                    rimraf.sync(this.db_path)
                    throw new Error(err)
                })
        } else {
            const file_name = readdirSync(this.db_path).filter(i => path.extname(i) === '.gz').join('')
            
            this.compressed_file_path = path.resolve(this.db_path, file_name)
            unCompressGzip(this.compressed_file_path)
                .then(db_stream => {
                    this.db = Object.assign(this.db, JSON.parse(db_stream))
                    this.__state__ = Object.assign(this.__state__, this.db.__state__)
                })
                .catch(err => {
                    rimraf.sync(this.db_path)
                    throw new Error(err)
                })
        }

        process.on('beforeExit', () => {
            if (this.compressed_file_path !== 'dropped') {
                this.close()
            }
        })

        /**
         * This handles middle ware used for localdb
         */
        process.on('action', (type, payload) => {

            async function resolvePromise(promiseObj, type, payload) {
                const resp = await promiseObj

                if (resp !== undefined) {
                    const { __name__, db_path, data_object } = await resp

                    if (db_path !== undefined) {
                        await this.updateProp(db_path, {
                            payload: data_object
                        }, 'internal')
                    } else {
                        this.db[__name__] = Object.assign(this.db[__name__], {
                            data: data_object
                        })
                    }
                }
            }

            this.extensions.forEach(i => {
                const Func = i.call(this, this, type, payload)

                if (Func instanceof Promise) {
                    resolvePromise.call(this, Func, type, payload)
                        .then(() => undefined)
                }
            })
        })
    }

    on(collection_name, cb) {

        process.on('dbChange', payload => {
            const { __name__, type, dbPath = '' } = payload;

            if (collection_name === __name__ ) {
                return cb(type, payload)
            }

            const matchesDBPath = (
                collection_name == dbPath ||
                collection_name === dbPath.slice(0, collection_name.trim().length) ||
                dbPath === collection_name.slice(0, dbPath.trim().length)
            )
            if (collection_name !== undefined && matchesDBPath) {
                return cb(type, payload)
            }
        })
    }

    /**
     * This updates the databases state internally after each query is made
     * @param {Object} state the current state
     * @param {Object} action the action that is being effected by the state
     * @return {void}
     */
    setState(state, action) {
        const newState = state
        let prop;

        const { type, payload } = action
        switch (type) {
            case 'ADD_DB':
                prop = 'dbs'
                newState.dbs = payload
                break;
            case 'DEL_DB':
                prop = 'dbs'
                newState.dbs = payload
                break;
            case 'HEALTH':
                prop = 'health'
                newState.health = payload
                break;
            case 'SYNCED':
                prop = 'synced'
                newState.synced = payload
                break;
        }

        return this.updateProp(`/__state__/${prop}`, {
            payload,
        })
            .then(_state => {
                this.__state__ = Object.assign(this.__state__, _state)
            })
            .catch(err => console.log(err))
    }

    /**
     * This is localdb state management chains
     * this states the localdb state giving a description
     * of changes and data being put tinot the database.
     * @return {Promise.stateObject}
     */
    fetchState() {

        return new Promise((resolve, reject) => {
            return this.getCollection('__state__')
                .then(state => resolve(state))
                .catch(err => {
                    const file_name = readdirSync(this.db_path).filter(i => path.extname(i) === '.gz').join('')
                    const compressed_file_path = path.resolve(this.db_path, file_name)
                    return unCompressGzip(compressed_file_path)
                        .then(db_stream => resolve(JSON.parse(db_stream).__state__))
                        .catch(err => console.error(err))
                })
        })
    }

    /**
     * This grabs the data and compresses it before the node process exits
     * and returns a process.exit() to close the process when the aync/await
     * call is finshed updating the new data stream in the db file.
     * @return {void} 
     */
    close() {

        async function writeTo_db(db) {
            const saved_db_stream = JSON.parse(await unCompressGzip(this.compressed_file_path))
                
            this.__state__.dbs = Object.keys(this.db).filter(i => i !== '__state__')
            this.db = Object.assign(this.db, { __state__: this.__state__ })
            
            const decouple_obj_ref = JSON.parse(JSON.stringify(saved_db_stream))
            const new_db_stream = Object.assign(decouple_obj_ref, this.db)

            console.log(diff(saved_db_stream, new_db_stream))
            if (diff(saved_db_stream, new_db_stream)) {
                await CompressToGzip(this.compressed_file_path, JSON.stringify(new_db_stream))
            }
            return process.exit(0)
        }

        return writeTo_db.call(this, this.db)
            .catch(err => {
                console.error(err)
                return process.exit(1)
            })
    }

    /**
     * Creates a collections in leveldb with a gievn input, returns
     * that collection or a error if a error occurs.
     * @param {QueryObject} QueryObject This is defined in the typedef for QueryObject
     * @return {(Promise.collection|Promise.string)}
     */
    create(QueryObject) {
        // extracts the __name__ and the insertion object
        let { __name__, data_object } = QueryObject;

        return new Promise((resolve, reject) => {
            if (__name__ === undefined || __name__.trim().length === 0) {
                return reject( new Error('No collection name was given for the database in localdb.') )
            }

            if (__name__ !== '__state__') {

                this.setState(this.__state__ || this.db.__state__, {
                    type: 'ADD_DB',
                    payload: [ __name__ ]
                })

                const collection = {};
                collection[__name__] = {
                    id: uuid(),
                    data: data_object
                }
                this.db = Object.assign(this.db, collection)

                if ( this.extends.length !== 0) {

                    process.emit('action', 'crt', {
                        __name__,
                        collection: data_object
                    })
                }

                process.emit('dbChange', {
                    dbPath: undefined,
                    __name__,
                    type: 'crt',
                    payload: data_object
                })
                
                return resolve(data_object)
            }
        })
    }

    /**
     * This creates a TCP server to connect to and send data to when ever there is a update,
     * deletion, or create.
     * @return {(Promise.void|Promise.Error)}
     */
    startServer() {
        if (notUndefined(this.dbconf.SERVER)) {
            if (notUndefined(this.db) || Object.keys(this.db) !== 0) {
                return require('./lib/server')(this.dbconf.SERVER, this.db, this.compressed_file_path)
            }
            
            const file_name = readdirSync(this.db_path).filter(i => path.extname(i) === '.gz').join('')
            const compressed_file_path = path.resolve(this.db_path, file_name)
            return unCompressGzip(compressed_file_path)
                .then(db_stream => {
                    db_stream = JSON.parse(db_stream)

                    this.db = Object.assign(this.db, db_stream)
                    this.__state__ = Object.assign(this.__state__, db_stream.__state__)
                    return require('./lib/server')(this.dbconf.SERVER, this.db, compressed_file_path)
                })
                .catch(err => Promise.reject(err))
        }

        return Promise.reject(new Error('SERVER feild was given but is empty.'))
    }

    /**
     * This deletes collections or collection properties from the database.
     * @param {QueryObject } QueryObject defined in the typedef for
     * @return {(Promise.collection|Promise.Error)}
     */
    deleteProp(db_path) {

        async function _deleteProp(__name__, db_path) {
            const collection = await this.getCollection(__name__)
            // clean the database path to reflect the object/coolection in the localdb
            /*
                /bar/this/is/dumb
                    bar === __name__
                    /this/is/dumb === 'collection_path'
            */
            
            const collection_frag = inspectObject(db_path, collection, {
                type: 'del'
            })

            if (collection_frag !== undefined) {
                return await collection_frag.ErrorMessage
            }

            process.emit('dbChange', {
                dbPath: db_path,
                __name__,
                type: 'del',
                payload: undefined
            })

            // this converts it back to a db_path that was given
            return await this.updateProp(`/${__name__}`, {
                payload: collection
            })
        }

        return new Promise((resolve, reject) => {
            if (db_path === undefined || db_path.trim().length === 0) {
                return reject(new Error('Path was undefined or was not given.') )
            }

            const __name__ = db_path.split('/')[1]
            db_path = `/${db_path.split('/').slice(2).join('/')}`
            return _deleteProp.call(this, __name__, db_path)
                .then(() => resolve(undefined))
                .catch(err => reject(err))
        })
    }

    /**
    * This deletes the database folder.
    * @return {void}
    */
    drop() {
        this.compressed_file_path = 'dropped';
        return rimraf.sync(this.db_path)
    }

    /**
     * This is a method that that always to inject middleware of code that runs
     * on actions beng made on locladb
     * The actions such as create, delete, insert/update will call the excutebale code
     * @param {(Promise|function)} func this is a the executable function
     * @return {void}
     */
    extends(func) {
        this.extensions.push(func)
    }

    /**
     * This returns that data speficed in the collection
     * @param {string} db_path the path of the props on the collection
     * @param {Object} action Its is decibed in the typedef of {action}
     * @return {(Promise.collection|Promise.string)}
     */
    fetchProp(db_path) {

        return new Promise((resolve, reject) => {
            if (db_path === undefined || db_path.trim().length === 0) {
                return reject( new Error('Path was undefined or was not given.') )
            }

            const __name__ = db_path.split('/')[1]

                if (__name__ !== '__state__') {
                    if (Object.keys(this.db).length !== 0) {
                        if ( !Object.keys(this.db).includes(__name__) ) {
                            return reject(new Error(`localdb could not find collection name ['${__name__}'].`))
                        }

                        const collection = this.db[__name__].data

                        if (collection !== undefined) {
                            db_path = `/${db_path.split('/').slice(2).join('/')}`
                            const collection_frag = inspectObject(db_path, collection, {
                                type: 'fetch'
                            })

                            if (Object.keys(collection_frag).includes('ErrorMessage')) {
                                return reject(collection_frag.ErrorMessage)
                            }
                            return resolve(collection_frag)
                        }
                    }

                    return this.getCollection(__name__)
                        .then(collection => {
                            db_path = `/${db_path.split('/').slice(2).join('/')}`
                            const collection_frag = inspectObject(db_path, collection, {
                                type: 'fetch'
                            })

                            if (Object.keys(collection_frag).includes('ErrorMessage')) {
                                return reject(collection_frag.ErrorMessage)
                            }
                            return resolve(collection_frag)
                        })
                        .catch(err => reject(err))
                }
            })
    }

    /**
     * Retruns a collection from the sepified collection name or a error.
     * @param {string} __name__ name of the collection
     * @return {(Promise.collection|Promise.Error)}
     */
    getCollection(__name__) {
        
        return new Promise((resolve, reject) => {
            if (__name__ === undefined || __name__.trim().length === 0) {
                return reject( new Error('No collection name was given for the database in localdb.') )
            }
            
            if (Object.keys( this.db ).length !== 0) {
                if (Object.keys( this.db ).includes(__name__)) {
                    const collection = __name__ === '__state__' ? this.db[__name__] : this.db[__name__].data
                    
                    if (collection !== undefined) {
                        return resolve(collection)
                    }
                }
                return reject( new Error(`localdb could not find collection name ['${ __name__ }'].`) )
            }

            return unCompressGzip(this.compressed_file_path)
                .then(db_stream => {
                    db_stream = JSON.parse(db_stream)
                    
                    if (!notUndefined(db_stream)) {
                        return reject( new Error('localdb db data stream is corrupted; returned undefined value.') )
                    }

                    if (notUndefined(db_stream[__name__])) {
                        const collection = __name__ === '__state__' ? db_stream[__name__] : db_stream[__name__].data
                        return resolve(collection)
                    }
                    return reject( new Error(`localdb could not find collection name ['${__name__}'].`) )
                })
                .catch(err => reject(err))
        })
    }

    /**
     * Destorys colletion or collections inside of leveldb given a collection name.
     * However state will not be deleted it will throw a reject if state is being deleted.
     * @param {string} __name__ name of the collection
     * @return {(Promise.void|Promise.Error)}
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

    /**
     * This udpates the desired path in the collection stored in localdb.
     * @param {string} db_path This is the path of the data you want to change
     * @param {Object} payload this holds the data you want to change
     * @return {(Promise.collection|Promise.Error)}
     */
    updateProp(db_path, payload) {
        const internal = Array.from(arguments).slice(-1)[0] === 'internal'

        async function updateCollectionPath(db_path, action) {
            // extracts the name from the db_path
            const __name__ = db_path.split('/')[1]

            // cleans the db path go to the path in the collection
            db_path = `/${db_path.split('/').slice(2).join('/')}`
            let collection = __name__ === '__state__' ? await this.fetchState() : await this.getCollection(__name__)

            // updates the object
            if (db_path === '/') {
                // if db_path is a '/' then that means that they are chaning the whole collection
                collection = action.payload
            } else {
                inspectObject(db_path, collection, action)
            }

            if (__name__ === '__state__') {
                if (notUndefined(this.__state__)) {
                    this.__state__ = Object.assign(this.__state__, collection)
                }
            } else {

                this.db[__name__] = Object.assign(this.db[__name__], { data: collection })
                
                if (!internal) {
                    process.emit('dbChange', {
                        dbPath: `/${__name__}${db_path}`,
                        __name__,
                        type: 'udp',
                        payload: action.payload
                    })
                    
                    process.emit('action', 'upd', {
                        __name__,
                        collection,
                    })
                }
                // returns the new object
                return await collection
            }
        }

        return new Promise((resolve, reject) => {
            // checks if the a db_path was given
            if (db_path === undefined || db_path.trim().length === 0) {
                return reject( new Error('No db path was to search through collection paths') )
            } else if (payload === undefined || (Object.keys(payload).length === 0 && Object.values(payload).length === 0)) {
                // checks if a payload was given
                return reject( new Error('No paylaod data was given') )
            }

            payload = Object.assign(payload, {
                type: 'upd'
            })
            return updateCollectionPath.call(this, db_path, payload)
                // return the new updated collection Object
                .then(collection => resolve(collection))
                .catch(err => reject(err))
        })
    }
}

module.exports = localdb