import { readdirSync, readFileSync } from 'fs';
const { deepEqual } = require('assert')

const { test } = require('ava')
const rimraf = require('rimraf')

const { CompressToGzip, unCompressGzip } = require('../src/lib/compressor')

test.afterEach(() => {
    rimraf.sync('./hello-world.gz')
    rimraf.sync('./new-file')
})

test('CompressToGzip()', async t => {
    await CompressToGzip('./hello-world', {
        message: 'helloooooooo'
    })
    return t.truthy(readdirSync('.').includes('hello-world.gz') && readFileSync('./hello-world.gz', 'utf8').length !== 0)
})

test('unCompressGzip().returnStream', async t => {
    await CompressToGzip('./hello-world', {
        message: 'helloooooooo'
    })
    const stream = await unCompressGzip('./hello-world.gz')
    t.is(JSON.parse(stream).message, 'helloooooooo')
})

test('unCompressGzip().toFile', async t => {
    await CompressToGzip('./hello-world', {
        message: 'helloooooooo'
    })
    await unCompressGzip('./hello-world.gz', './new-file')
    const sameObject = t.deepEqual(JSON.parse(readFileSync('./new-file', 'utf8')), {
        message: 'helloooooooo'
    })
    return t.truthy(readdirSync('.').includes('new-file') && readFileSync('./new-file', 'utf8') === JSON.stringify({
        message: 'helloooooooo'
    }))
})