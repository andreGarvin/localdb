const notUndefined = (e) => e !== undefined;

/**
 * This fetchs, deletes, updates, adn inserts data to a object passed in
 * @param {(string|array)} path The path to go through of the object 
 * @param {Object} obj the object you want to inspect
 * @param {Object} action the 
 */
function inspect(dbPath, obj = undefined, action = { type: 'fetch' }) {
    if (!dbPath) {
        return {
            ErrorMessage: new Error('No path was given.')
        }
    }

    // turns the path splited into array
    dbPath = Array.isArray(dbPath) ? dbPath : dbPath.split('/').filter(i => i !== '')
    if (dbPath.length === 0) {
        return {
            ErrorMessage: new Error('No path was given.')
        }
    }

    if ( obj === undefined || (Object.keys(obj).length === 0 && dbPath.length === 0) ) {
        return {
            ErrorMessage: new Error('No object was passed to inspect.')
        }
    }
    
    if (obj[dbPath[0]] === undefined) {
        if (action.type !== 'upd') {
            return {
                ErrorMessage: new Error(`Path to property<'${dbPath[0]}'> or Object<'${dbPath[0]}'> does not exist on Object.`)
            }
        }
    }

    const { type, payload } = action
    switch (type) {
        case 'fetch':
            return fetch(dbPath, obj)
        case 'upd':
            if (!notUndefined(payload)) {
                return {
                    errorMessage: new Error('Must receive some type of payload to replace/update/insert into object.')
                }
            }
            return update(dbPath, obj, payload)
        case 'del':
            return _delete(dbPath, obj)
        default:
            return {
                errorMessage: new Error('No type of action was given to be performed on object.')
            }
    }
}

module.exports = inspect

const isObject = (o) => typeof o === 'object' && !Array.isArray(o)
const stringSlice = (str, fo, so) => str.split('').slice(fo, so).join('');

function fetch(dbPath, obj) {

    if (dbPath.length === 0 && Object.keys(obj).length === 0) {
        return {
            errorMessage: new Error('No path was given.')
        }
    }

    if (Array.isArray(obj[dbPath[0]])) {
        if (Object.keys(obj).includes(dbPath[0]) ) {
            return obj[dbPath[0]]
        }

        const propName = dbPath[1]
        // if there is a object or multiple things that match in the array
        let queryArrayResult = obj[dbPath[0]].filter(i => {
            if (typeof i === 'object' && !Array.isArray(i)) {
                if (propName === dbPath.slice(-1)[0]) {
                    return i[propName]
                }
                if (i[propName].toString() === dbPath.slice(-1)[0]) {
                    return i
                }
            } else if (typeof i !== 'object' && !Array.isArray(i)) {
                if (propName === i.toString()) {
                    return i
                }
            }
        })

        // if the object has more paths then we inspect those if the are objects
        if (dbPath.slice(1).length === 1) {
            queryArrayResult = queryArrayResult.filter(i => notUndefined(i))
        }

        if (queryArrayResult.length === 1) {
            return queryArrayResult[0]
        }
        return queryArrayResult
    } else if (isObject(obj)) {

        if (obj[dbPath[0]] === undefined) {
            return {
                errorMessage: new Error(`Path to property<'${dbPath[0]}'> or Object<'${dbPath[0]}'> does not exist on Object.`)
            }
        }

        if (dbPath.length === 1) {
            return obj[dbPath[0]]
        }
        return fetch(dbPath.slice(1), obj[dbPath[0]])
    }

}

function update(dbPath, obj, payload = undefined) {

    // checks if there is a first item and there is more paths to go to
    if (notUndefined(dbPath[0]) && dbPath.length !== 1) {

        if (Array.isArray(obj[dbPath[0]])) {
            const propName = dbPath[1];

            if (dbPath.slice(-1).length === 1) {
                let bridgePath;

                if (dbPath.join('/').includes('/:')) {
                    const bridgeIndex = dbPath.join('/').indexOf(':')
                    bridgePath = stringSlice(dbPath.join('/'), bridgeIndex + 1).split('/')
                    dbPath = stringSlice(dbPath.join('/'), 0, bridgeIndex).split('/').filter(i => i !== '')
                }

                obj[dbPath[0]] = obj[dbPath[0]].map(i => {
                    if (isObject(i) && !Array.isArray(i)) {
                        if (i[propName] === dbPath.slice(-1)[0]) {
                            i[propName] = payload
                            return i
                        } else {
                            if (notUndefined(bridgePath)) {
                                update(bridgePath, i, payload)
                            } else {
                                i[propName] = payload
                            }
                            return i
                        }
                    } else if (!isObject(i) && !Array.isArray(i)) {
                        if (i === propName) {
                            i = payload
                            return i
                        }
                    }
                    return i
                })
            } else {
                obj[dbPath[0]] = obj[dbPath[0]].map(i => {
                    if (typeof i === 'object' && !Array.isArray(i)) {
                        if (i[propName] === dbPath.slice(-1)[0]) {
                            i[propName] = update(dbPath.slice(2), obj[dbPath[0][dbPath[1]]], payload)
                            return i
                        }
                    }
                })
            }
            return payload
        }

        // checks if the path on the object being inspected exists on the object
        if (obj[dbPath[0]] === undefined) {
            // if there is a path being updated to create a new path then it creates a new property
            // with the value of a new Object
            if ((dbPath.length !== 0 || dbPath.length !== 1) && payload !== undefined) {
                obj[dbPath[0]] = {}
                // then it recursive goes down the rest of the dbPath
                return update(dbPath.slice(1), obj[dbPath[0]], payload);
            }

            return {
                errorMessage: new Error(`Path to property<'${dbPath[0]}'> or Object<'${dbPath[0]}'> does not exist on Object.`)
            }
        } else {
            return update(dbPath.slice(1), obj[dbPath[0]], payload)
        }

    } else {
        if (notUndefined(payload)) {
            if (notUndefined(obj[dbPath[0]])) {
                if (isObject(obj[dbPath[0]]) && isObject(payload)) {
                    obj[dbPath[0]] = Object.assign(obj[dbPath[0]], payload)
                    return payload
                } else {
                    if (Array.isArray(obj[dbPath[0]])) {
                        obj[dbPath[0]] = obj[dbPath[0]].concat(payload)
                        return payload
                    } else {
                        obj[dbPath[0]] = payload
                        return payload
                    }
                }
            } else {
                if (dbPath.length !== 1) {
                    obj[dbPath[0]] = {}
                    return update(dbPath.slice(1), obj[dbPath[0]], payload)
                } else {
                    obj[dbPath[0]] = payload
                    return payload
                }
            }
        }

        return {
            errorMessage: new Error(`Path to property<'${dbPath[0]}'> or Object<'${dbPath[0]}'> does not exist on Object.`)
        }
    }
}

function _delete(dbPath, obj) {
    
    if (Array.isArray(obj[dbPath[0]])) {
        const propName = dbPath[1]

        // if it is a array of objects
        if (dbPath.length >= 2) {
            let lastItem = dbPath.slice(-1)[0]
            let bridgePath;

            if (dbPath.join('/').includes('/:')) {
                const bridgeIndex = dbPath.join('/').indexOf(':')
                bridgePath = stringSlice(dbPath.join('/'), bridgeIndex + 1).split('/')
                dbPath = stringSlice(dbPath.join('/'), 0, bridgeIndex).split('/').filter(i => i !== '')
                lastItem = dbPath.slice(-1)[0]
            }

            obj[dbPath[0]] = obj[dbPath[0]].filter(i => {
                if (i[propName].toString() === lastItem.toString()) {
                    if (notUndefined(bridgePath)) {
                        _delete(bridgePath, i)
                        return i
                    }
                    return;
                }
                
                if (propName === lastItem.toString()) {
                    _delete(dbPath.slice(1), i)
                    return i
                }
                
                return i
            })
        } else {
            // if it is a normal array with no arrays or objects
            obj[dbPath[0]] = obj[dbPath[0]].filter(i => {
                if (typeof i === 'object') return i;
                return i !== dbPath.slice(-1)[0]
            })
        }
        return;
    } else if (isObject(obj[dbPath[0]])) {

        // in case of deleting prop but not the parent root, if there are not more childern
        // in the parent prop value then delete the parent property.
        const internalProps = (
            // props on a localdb collection object.
            !Object.keys(obj).includes('data') || !Object.keys(obj).includes('id')
        )
        if (dbPath.length === 2 && (!Object.keys(obj).includes(dbPath[1]) && internalProps)) {
            delete obj[dbPath[0]][dbPath[1]]

            if (Object.keys(obj[dbPath[0]]).length === 0) {
                return delete obj[dbPath[0]]
            }
            return;
        }
        if (dbPath.length > 1) {
            return _delete(dbPath.slice(1), obj[dbPath[0]])
        }
    }
    return delete obj[dbPath[0]]
}
