const {
    readdirSync,
    existsSync,
    mkdirSync,
    watch,
} = require('fs')
const path = require('path')

const rimraf = require('rimraf')
const uuid = require('uuid')

const { CompressToGzip, unCompressGzip } = require('./lib/compressor')
const notUndefined = require('./lib/notUndefined')
const diff = require('./lib/diff')

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

        process.on('action', (type, payload) => {

            this.extensions.forEach(i => {
                const Func = i.call(this, this, type, payload)

                if (Func instanceof Promise) {
                    resolvePromise.call(this, Func, type, payload)
                        .then(() => undefined)
                }
            })
        })
    }

    on(__name__, cb) {
        process.on(__name__, payload => {
            return cb(payload)
        })
    }

    /**
     * This updates the databases state internally after each query is made
     * @param {*} state the current state
     * @param {*} action the action that is being effected by the state
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

            if (diff(saved_db_stream, new_db_stream)) {
                await CompressToGzip(this.compressed_file_path, JSON.stringify(new_db_stream))
            }
            return process.exit()
        }

        return writeTo_db.call(this, this.db)
            .catch(err => {
                console.log(err)
                return process.exit()
            })
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
                return resolve(data_object)
            }
        })
    }

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
        } else {
            return Promise.reject(new Error('SERVER feild was given but is empty.'))    
        }
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
                    
                    if (collection_frag !== undefined) {
                        return reject(collection_frag.ErrorMessage)
                    }
                    
                    // this converts it back to a db_path that was given
                    return this.updateProp(`/${__name__}`, {
                        payload: collection
                    })
                        .then(() => resolve(undefined))
                        .catch(err => reject(err))
                })
                .catch(err => reject(err))
        })
    }

    /**
    * This deletes the database folder
    * @return {void}
    */
    drop() {
        this.compressed_file_path = 'dropped';
        // console.log(`Dropped ${path.basename(this.compressed_file_path).split('.gz').join('')}`)
        return rimraf.sync(this.db_path)
    }

    /* This is a method that that always to inject middleware of code that runs
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

            if (__name__ !== '__state__') {
                if (Object.keys(this.db).length !== 0) {
                    if ( !Object.keys(this.db).includes(__name__) ) {
                        return reject(new Error(`localdb could not find collection name ['${__name__}'].`))
                    }

                    const collection = this.db[__name__].data

                    if (collection !== undefined) {
                        db_path = `/${db_path.split('/').slice(2).join('/')}`
                        const collection_frag = inspect(db_path, collection, {
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
                        const collection_frag = inspect(db_path, collection, {
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
     * @return {(Promise.collection}
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
        const internal = Array.from(arguments).slice(-1)[0] === 'internal'

        async function updateCollectionPath(db_path, action) {
            // extracts the name from the db_path
            const __name__ = db_path.split('/')[1]

            // cleans the db the data again
            db_path = `/${db_path.split('/').slice(2).join('/')}`
            let collection = __name__ === '__state__' ? await this.fetchState() : await this.getCollection(__name__)

            // updates the object
            if (db_path === '/') {
                collection = action.payload
            } else {
                inspect(db_path, collection, action)
            }

            if (__name__ === '__state__') {
                if (notUndefined(this.__state__)) {
                    this.__state__ = Object.assign(this.__state__, collection)
                }
            } else {

                this.db[__name__] = Object.assign(this.db[__name__], { data: collection })
                
                if (!internal) {
                    process.emit(__name__, collection)
                    
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

/**
 * This fetchs, deletes, updates, adn inserts data to a object passed in
 * @param {(string|array)} path The path to go through of the object 
 * @param {Object} obj the object you want to inspect
 * @param {Object} action the 
 */
function inspect(db_path, obj, action) {
    if (!db_path) {
        return {
            ErrorMessage: new Error('No path was given.')
        }
    }
    
    // turns the path splited into array
    if (!Array.isArray(db_path)) {
        db_path = db_path.split('/').slice(1).filter(i => i !== '')
    }
    if (db_path.length === 0) {
        if (action.type === 'fetch') {
            return obj
        }
        return {
            ErrorMessage: new Error('No path was given.')
        }
    }
    if (obj === undefined || Object.keys(obj).length === 0) {
        return {
            ErrorMessage: new Error('No object was passed to inspect.')
        }
    }

    // checks if there is a first item and there is more paths to go to
    if (db_path[0] !== undefined && db_path.length !== 1) {

        // checks if the path on the object being inspected exists on the object
        if (!notUndefined(obj[db_path[0]])) {
            if ((db_path.length !== 0 || db_path.length !== 1) && action.type === 'upd') {
                obj[db_path[0]] = {}
                return inspect(db_path.slice(1), obj[db_path[0]], action)
            }
            
            return {
                ErrorMessage: new Error(`Path to property<'${db_path[0]}'> or Object<'${db_path[0]}'> does not exist on Object.`)
            }
        }

        // in cases of adding a prop that does not exist on the JSON object
        // this creates object and assigns it to the JSON object and replace exist prop value/s
        // in caese of deleting prop but not the parent root
        if (db_path.length === 2 && !Object.keys(obj).includes(db_path[1])) {
            if (action.type === 'upd') {
                const new_obj = {}
                new_obj[db_path[1]] = action.payload
                obj[db_path[0]] = new_obj
                return;
            } else if (action.type === 'del') {
                delete obj[db_path[0]][db_path[1]]

                if (Object.keys(obj[db_path[0]]).length === 0) {
                    delete obj[db_path[0]]
                }
                return
            }
        }

        // slices the path to the next path and pass the object being inspected
        return inspect(db_path.slice(1), obj[db_path[0]], action)
    } else {

        // If there is not more paths then return the object
        if (!db_path[0] && action.type === 'fetch') {
            return obj[db_path[0]]
        }

        // if the action was given
        if (action !== undefined) {

            const { type, payload } = action
            switch (type) {
                case 'del':
                    if ( notUndefined(obj[path[0]]) ) {
                        delete obj[db_path[0]]
                    } else {
                        delete obj
                    }
                    break;
                case 'upd':
                    if ( notUndefined(obj[db_path[0]]) ) {
                        if (typeof obj[db_path[0]] === 'object' && typeof payload === 'object') {
                            obj[db_path[0]] = Object.assign(obj[db_path[0]], payload)
                        } else {
                            obj[db_path[0]] = payload
                        }
                    } else {
                        obj[db_path[0]] = payload
                    }
                    break;
            }

            return type === 'fetch' ? obj[db_path[0]] : payload
        }

        if (!obj[path[0]]) {
            return {
                ErrorMessage: new Error(`db_path to property<'${db_path[0]}'> or Object<'${db_path[0]}'> does not exist on Object.`)
            }
        }
    }
}