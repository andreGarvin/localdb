const { test } = require('ava')
const diff = require('../lib/diff')

test('diff', t => {
    const is_diff = diff({
            __state__:
                {
                    dbs: ['new_york', 'los_angles'],
                    size: 0,
                    health: '',
                    synced: null
                },
            los_angles: { message: 'hello' },
            new_york:
                {
                    id: '83961895-c227-4dcd-a900-a4e04dc28286',
                    data: { message: 'hello' }
                }
        }, {
            new_k:
                {
                    id: '8c3f444d-702e-4af8-90d2-e93c3a0d6e4d',
                    data: { message: 'hellonkjndhwhioe' }
                },
            __state__:
                {
                    dbs: ['new_k', 'los_angles', 'new_york'],
                    size: 0,
                    health: '',
                    synced: null
                },
            los_angles: { message: 'hello' },
            new_york:
                {
                    id: '83961895-c227-4dcd-a900-a4e04dc28286',
                    data: { message: 'hello' }
                }
        })

    return t.truthy(is_diff)
})