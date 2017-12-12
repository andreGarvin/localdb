const { readdirSync } = require('fs');
const request = require('request')

const { test } = require('ava')
const rimraf = require('rimraf')

const localdb = require('../')

const db = new localdb({
    __name__: './test',
    SERVER: {
        PORT: 8080
    }
})

test('create()', async t => {
    const collection = await db.create({
        __name__: 'new_york',
        data_object: {
            best_brough: ['brooklyn'],
            something: {
                else: {
                    may: {
                        not: 'so much',
                        at_all: 123
                    },
                    be: {
                        new: false
                    }
                }
            }
        }
    })

    return t.deepEqual(collection, {
        best_brough: ['brooklyn'],
        something: {
            else: {
                may: {
                    not: 'so much',
                    at_all: 123
                },
                be: {
                    new: false
                }
            }
        }
    })
})

test('getCollection()', async t => {
    const new_collection = await db.create({
        __name__: 'turtles',
        data_object: ['flash', 'princess', 'patrick']
    })
    const turtle_name_array = await db.getCollection('turtles')
    
    return t.deepEqual(new_collection, turtle_name_array)
})

test('on()', async t => {
    db.on('new_york', payload => {
        return t.not(payload, undefined)
    })

    await db.updateProp('/new_york/something/else/be/new', {
        payload: true
    })
})

test('teardown()', async t => {
    await db.create({
            __name__: 'turtles',
            data_object: ['flash', 'princess', 'patrick']
        })
    await db.teardown('turtles')
    return db.getCollection('turtles')
        .catch(err => t.not(err, undefined))
})

test('fetchProp()', async t => {
    const collection_prop_value = await db.fetchProp('/new_york/something/else/may/at_all')
    return t.is(collection_prop_value, 123)
})

test('updateProp()', async t => {
    await db.updateProp('/new_york/best_brough', {
        payload: ['still_brooklyn_nigga', 'always will be']
    })
    const collection_prop_value = await db.fetchProp('/new_york/best_brough')
    return t.is(collection_prop_value.length, 2)
})

test('deleteProp()', async t => {
    await db.deleteProp('/new_york/something/else/may/not')

    const collection_prop_value = await db.fetchProp('/new_york/something/else/may')
    const collection_prop_name_array = Object.keys(collection_prop_value)
    return t.truthy(!collection_prop_name_array.includes('not'))
})

test('extends()', t => {
    
    function changeDataPromise(db, type, payload) {
        let { __name__, collection } = payload

        return new Promise(resolve => {
            if (__name__ === 'new-collection') {
                
                t.deepEqual({
                    db: typeof db !== undefined,
                    type,
                    collection,
                }, {
                    db: true,
                    type: 'crt',
                    collection: ['person', 'cat', 'rock'].map((item, id) => Object.assign({}, { id, item }))
                })
                collection = collection.map(i => i.item)
                
                return resolve({
                    __name__,
                    data_object: collection,
                })
            } else {
                return resolve(undefined)
            }
        })
    }

    db.extends(changeDataPromise)
    
    db.create({
        __name__: 'new-collection',
        data_object: ['person', 'cat', 'rock'].map((item, id) => Object.assign({}, { id, item }))
    }).then(() => undefined)
})

// broken test
test('startServer()', async t => {
    await db.startServer()

    const collection = await db.getCollection('new-collection')

    function fetchResponse() {
        return new Promise(resolve => {
            request(`http://localhost:8080/new-collection`, async (err, data) => {
                return resolve(data)
            })
        })
    }
    const resp = await fetchResponse()
    t.deepEqual(JSON.parse(resp.body), collection.map(i => i.item))
})