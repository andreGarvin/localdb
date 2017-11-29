const { readdirSync } = require('fs');

const { test } = require('ava')
const rimraf = require('rimraf')

const localdb = require('../src')

const db = new localdb({
    __name__: './test'
})


test.after(() => {
    rimraf.sync('./test@localdb')
})


test('create()', async t => {
    const collection = await db.create({
        __name__: 'new_york',
        data_object: {
            best_brough: ['brooklyn'],
            something: {
                else: {
                    may: {
                        not: 'so muhc',
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
                    not: 'so muhc',
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

    await db.updateProp('/new_york/something/be/new', {
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

test('drop()', t => {
    db.drop()
    return t.falsy(readdirSync('.').includes('test@localdb'))
})