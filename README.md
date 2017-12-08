# localdb: simple, light weight, file database creation

## localdb solves the problem of creating a small but powerful file database on the local Machine with node enabling people to create amazing with node.

### If you may know there is a module called level which does the same thing as localdb , I love using level for other projects and I think its amazing module but there are are three disadvantages of using level.
* One, level does not allow multiple connections from more then one instance being made across all running node processes. However, with localdb when multiple instances are creates a master slave relationship is formed between these instances on multiple running instances.
* Two, level which is dependent on another module called leveldown, has a node binary built for `NODE_MODULE_VERSION` 54 which is not great if you want to create desktop applications with electron because you would need to switch to a older and maybe un resourceful version of node to match that `NODE_MODULE_VERSION`; possibly not being able to write the latest of JavaScript.
* level is not really pushing the limits of things you can do which is pretty cool in creating distributed systems or applications. Unlike localdb it comes with with some pretty great stuff and Looking for contributors to create much more.

# How To use localdb

```bash
npm i @andre_garvin/localdb -S
```

```js
// This is simple quick start to start using localdb

const localdb = require('@andre_garvin/localdb')

// Creating a localdb instance to read/write to localdb
const db = new localdb({
    // Creates a folder called test@localdb in the current working directory
    // You can also make a path like '../test'
    __name__: 'test'
})

// Creates a collection called 'hello_world' and assigns that key with that object of data
db.create({
    __name__: 'hello_world',
    data_object: {
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
}).then(collection => {
    // returns back that collection or 'console.log' as error if occured
    console.log(collection)
}).catch(err => console.error(err))
```

```js
// fetchs that collection from the gz file
db.getCollection('hello_world').then(collection => {
    console.log(collection)
}).catch(err => {
    console.error(err)
})
```

```js
// lets say you already know a certain path on a object in the on the JSON object. This will return that specfic peice of data
db.fetchProp('/hello_world/other/stuff/be/useful').then(prop => {
    console.log(prop)
}).catch(err => {
    console.error(err)
})
```

```js
// same for updating a ceratin property on the JSON object instead of the whole thing and retruns the new colleciton from localdb
db.updateProp('/hello_world/dummy_data/newProp', {
    payload: [ 'this', 'is', 'new' ]
}).then(prop => console.log(prop)).catch(err => console.error(err))
```

```js
// same deleting a certain prop, this does not return the new collection
db.deleteProp('/hello_world/dummy_data/newProp').then(() => {
    console.log('deleted prop from hello_world')
}).catch(err => console.error(err))
```

```js
// drop a whole collection
db.teardown('hello_world').then(() => {
    console.log('deleted collection hello_world')
}).catch(err => console.error(err))
```

```js
// delete the localdb folder, this runs synchronously
db.drop()
```

# Useful localdb APIs

## inspecting localdb state
```js
// you can fetch the certain state in the localdb folder 
db.fetchState().then(state => console.log(state))
```

### There is a db.setState() but is used internally by localdb to mange that if you want to use it here you go
```js
const new_state = {
    dbs: [],
    synced: false,
    health: 'BAD',
    size: 0 
};

// this runs synchronously no callbacks or promises needed
db.setStat(new_state, {
    type: 'ADD_DB',
    payload: 'new_db_name'
})
```


## Adding middleware to localdb
```js
function logger(db, type, _collection) {
    const { __name__, collection } = _collection
    switch (type) {
        case 'crt':
            console.log(`Created new collection ['${ __name__ }']`)
            console.log(collection)
        break;
    }
}


// You can also use a promise
function change_data_promise(db, type, _collection) {
    const { __name__, collection } = _collection
    return new Promise(resolve => {
        collection = collection.map(i => i.item)
        return resolve({
            __name__,
            // you can assign adb path
            // ex => db_path: /new-collection/item_names
            data_object: collection
        })
    })
}

db.extends(logger)
db.extends(change_data_promise)

db.create({
    __name__: 'new-collection',
    data_object: [ 'person', 'cat', 'rock' ].map((id, item) => Object.assign({}, { id, item }))
})
    .then(collection => console.log(collection))
    .catch(err => console.error(err))
```

## Listen on db events such as crt, udp, del on certain collections in the localdb process cycle
```js
// this will emit the new collection before the updateProp gets it.
db.on('hello-world', payload => console.log(payload))

db.udpateProp('/hello-world/newProp', {
    payload: 'new stuff'
})
    // this will return back the new data
    .then(collection => console.log(collection))
    .catch(err => console.error(err))
```

## Want to server you data on a server ?
```js
const db = new localdb({
    // this is connecting to same file not recreating a new file
    __name__: 'test',
    SERVER: {
        PORT: 5000 // default is 8080
    }
})

// if new change are made you can refresh the route and see the new data
/*
    * You can also give a spefic route such
    http://localhost:8080/new-collection: this will return that collections data
*/
db.startServer()
    .then(() => console.log('Ruuning server on PORT 5000'))
    .catch(err => console.error(err))
```