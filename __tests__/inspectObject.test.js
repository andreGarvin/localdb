const { test } = require('ava')

const inspectObject = require('../lib/inspectObject')

test('fetch', t => {
    const value = inspectObject('/this/is/true', {
        this: {
            is: {
                true: 'yes'
            }
        }
    });
    return t.is(value, 'yes')
})

test('update', t => {
    const obj = {
        this: {
            is: {
                true: 'yes'
            }
        }
    };

    inspectObject('/this/is/true', obj, {
        type: 'upd',
        payload: false
    });
    return t.falsy(obj.this.is.true)
})

test('del', t => {
    const obj = {
        this: {
            is: {
                true: 'yes'
            },
            I_AM_STILL_HERE: undefined
        }
    };

    inspectObject('/this/is/true', obj, {
        type: 'del'
    });
    return t.deepEqual(obj, {
        this: {
            I_AM_STILL_HERE: undefined
        }
    })
})

test('fetch.Array', t => {
    const obj = {
        this: {
            is: {
                true: 'yes'
            }
        },
        list: [
            {
                _id: 1234,
                text: 'cat'
            },
            {
                _id: 2466,
                text: 'water'
            }
        ]
    };
    
    const result = inspectObject('/list/_id', obj)
    return t.is(result.length, 2)
})

test('update.Object.newProp', t => {
    const obj = {
        this: {
            is: {
                true: 'yes'
            }
        },
        list: [
            {
                _id: 1234,
                text: 'cat'
            },
            {
                _id: 2466,
                text: 'water'
            }
        ]
    }
    inspectObject('/this/stuff', obj, {
        type: 'upd',
        payload: {
            dummy_data: true,
            other: {
                stuff: {
                    that: 'might',
                    be: {
                        useful: false
                    }
                }
            }
        }
    })
    return t.deepEqual(inspectObject('/this/stuff', obj), {
        dummy_data: true,
        other: {
            stuff: {
                that: 'might',
                be: {
                    useful: false
                }
            }
        }
    })
})

test('update.Arrays.newProp', t => {
    const obj = {
        list: [
            {
                _id: 1234,
                text: 'cat'
            },
            {
                _id: 5678,
                text: 'frog'
            }
        ]
    }

    inspectObject('/list/_id/5678/:speak', obj, {
        type: 'upd',
        payload: 'ribit'
    })
    return t.is(obj.list[1].speak, 'ribit')
})

test('update.Object.newProp', t => {
    const obj = {
        1: true
    }

    inspectObject(['0'], obj, {
        type: 'upd',
        payload: false
    })
    return t.falsy(obj['0'])
})

test('update.Object.newProp', t => {
    const obj = {
        1: true,
        newProp: {
            stuff: undefined
        }
    }

    inspectObject(['0', 'maybe', 'this', 'will', 'work'], obj, {
        type: 'upd',
        payload: false
    })
    return t.falsy(obj['0'].maybe.this.will.work)
})

test('delete.Array', t => {
    const obj = {
        list: [
            {
                _id: 1234,
                text: 'cat',

            },
            {
                _id: 5678,
                text: 'frog'
            }
        ]
    }

    inspectObject('/list/_id/1234', obj, {
        type: 'del'
    })
    return t.deepEqual(obj.list, [
        {
            _id: 5678,
            text: 'frog'
        }
    ])
})

test('delete.Array.prop', t => {
    const obj = {
        list: [
            {
                _id: 1234,
                text: 'cat',
                speak: 'meow'
            },
            {
                _id: 5678,
                text: 'frog',
                speak: 'ribit'
            }
        ]
    }

    inspectObject('/list/_id/', obj, {
        type: 'del'
    })
    return t.deepEqual(obj.list, [
        {
            text: 'cat',
            speak: 'meow'
        },
        {
            text: 'frog',
            speak: 'ribit'
        }
    ])
})