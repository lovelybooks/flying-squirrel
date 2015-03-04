/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('../Ref');



///// TODO: THese functions should really be in some common utils class
function determineType(schemaObj) {
    if (_.isArray(schemaObj)) {
        return 'collection';
    } else if (schemaObj instanceof Ref) {
        return 'reference';
    } else if (_.isObject(schemaObj)) {
        console.assert(_.isPlainObject(schemaObj));
        return 'object';
    } else {
        console.assert(!_.isUndefined(schemaObj));
        return 'primitive';
    }
}
function descendInSchema(schema, subSchema, key) {
    var type = determineType(subSchema);
    if (type === 'collection') {
        return subSchema[0]; // NOTE: we ignore the key.
    } else if (type === 'reference') {
        return descendInSchema(schema, subSchema.get(schema)[0], key);
    } else if (type === 'object') {
        return subSchema[key];
    } else {
        throw 'descendInSchema: Cannot descend to "' + key + '" key in primitive value';
    }
}
function getTypeDeep(schema, ref) {
    var path = ref.split('.');
    var subSchema = schema;
    _.each(path, function(key) {
        subSchema = descendInSchema(schema, subSchema, key);
        if (subSchema == null) {
            throw 'getTypeDeep: Invalid ref: ' + ref;
        }
    });
    return determineType(subSchema);
}





var dbResourceHandlers = {
    'topics': function (criteria) {
        // collection
        // Promise of [{id:12}, {id:14}, {id:15}, ...]
    },
    'topics.{}': function (topicIds) {
        // object in collection
        // Promise of [{id:14, name:'topic name', type:'review'}, ...]
    },
    'topics.{}.openingEntry': function (topicIds) {
        // reference
        // Promise of [123, ...]
    },
    'topics.{}.entries': function (topicIds) {
        // collection of references
        // Promise of [[123, 128, 131, 132, 133, 138], ...]
        // These numbers should be entry ids, usable with the 'entries.{}' resource.
    },
    'entries': function (criteria) {
        // collection of objects
        // Promise of [{id:123}, {id:131}, {id:133}, ...]
    },
    'entries.{}': function (entryIds) {
        // object in collection
        // Promise of [{id:123, text:'Hello world, this is my first post'}, ...]
    },
    'entries.{}.author': function (entryIds) {
        // reference
        // Promise of [1337, ...]
    },
    'users': function (criteria) {
        // collection of objects
        // Promise of [{id:1234}, {id:1321}, {id:1330}, ...]
    },
    'users.{}': function (userIds) {
        // object in collection
        // Promise of [{id:1337, name:'James Bond'}, ...]
    },
}

function getResource(resource, args) {
    console.assert(args.length === (resource.match(/\{\}/g) || []).length);
    var promiseOrResult = dbResourceHandlers[resource].apply(null, args);
    return Promise.resolve(promiseOrResult); // We always return a Promise.
}

// writes the data to store and returns a new ref (if we are not finished yet) or null
function getRef(schema, ref, getResource, store) {
    console.assert(_.isObject(store));
    console.assert(_.isFunction(getResource));
    console.assert(getTypeDeep(schema, ref) !== 'primitive');

    var path = ref.split('.');
    var subSchema = schema;
    var callbackArgs = [];
    var newPath = [];
    var subSchemaType = null;
    var subStore = store;
    var key;
    for (var i=0; i<path.length; i++) {
        key = path[i];
        subSchema = descendInSchema(schema, subSchema, key);

        // Handling collection items.
        if (subSchemaType === 'collection') { // collection item!
            newPath.push('{}');
            callbackArgs.push([key]); // TODO list handling somewhere else
        } else {
            newPath.push(key);
        }

        // Resolving reference.
        subSchemaType = determineType(subSchema);
        if (subSchemaType === 'reference') {
            return getResource(newPath.join('.'), callbackArgs).then(function(referencedIds) {
                var referencedId = referencedIds[0];
                subStore[key] = referencedId;
                var dereferencedPath = _.flatten([subSchema.ref, referencedId, _.slice(path, i+1)]);
                // console.log('Resolving ref: ' + ref + ' → ' + dereferencedPath.join('.'));
                return getRef(schema, dereferencedPath.join('.'), getResource, store);
            });
        }

        // Updating subStore.
        if (i !== path.length - 1) {
            if (!subStore[key]) {
                subStore[key] = {};
            }
            subStore = subStore[key];
            console.assert(_.isObject(subStore));
        }
    };

    // Fetching something from collection
    return getResource(newPath.join('.'), callbackArgs).then(function(xs) {
        subStore[key] = xs[0];
    });
}

describe('getRef', function () {
    var schema = {
        topics: [{
            id: 123,
            name: 'Example topic',
            entries: [new Ref('entries')],
            openingEntry: new Ref('entries'),
            participants: [new Ref('users')],
            creator: new Ref('users'),
        }],
        entries: [{
            id: 123,
            text: 'Hello world',
            author: new Ref('users'),
        }],
        users: [{
            id: 123,
            name: 'Winnie Pooh',
            avatar: {
                url: 'http://example.com/pooh.jpg',
            }
        }],
    };
    var getResourceSpy, store, tick;
    beforeEach(function () {
        getResourceSpy = jasmine.createSpy('getResource').and.returnValue(Promise.resolve());
        jasmine.clock().install();
        tick = jasmine.clock().tick;
        store = {};
    });
    afterEach(function () {
        tick(1);
        jasmine.clock().uninstall();
    });
    it('calls getResource to get data', function () {
        getRef(schema, 'entries.1234', getResourceSpy, store);
        expect(getResourceSpy).toHaveBeenCalledWith('entries.{}', [['1234']]);
    });
    it('resolves the promise', function () {
        var done = false;
        getResourceSpy.and.returnValue(Promise.resolve([{}]));
        getRef(schema, 'entries.1234', getResourceSpy, store).then(function () {
            done = true;
        });
        tick(1);
        expect(done).toBe(true);
    });
    it('puts the data in store', function () {
        getResourceSpy.and.returnValue(Promise.resolve([{text: 'hello'}]));
        getRef(schema, 'entries.1234', getResourceSpy, store);
        tick(1);
        expect(store.entries[1234]).toEqual({text: 'hello'});
    });
    it('works with references', function () {
        getResourceSpy.and.returnValue(Promise.resolve([777]));
        getRef(schema, 'entries.1234.author', getResourceSpy, store);
        tick(1);
        expect(getResourceSpy).toHaveBeenCalledWith('entries.{}.author', [['1234']]);
        expect(getResourceSpy).toHaveBeenCalledWith('users.{}', [['777']]);
    });
    it('works with deep references', function () {
        var resolve;
        getResourceSpy.and.callFake(function () {
            return new Promise(function (_resolve) {
                resolve = _resolve;
            });
        });
        getRef(schema, 'topics.123.openingEntry.author', getResourceSpy, store);
        tick(1);
        expect(getResourceSpy).toHaveBeenCalledWith('topics.{}.openingEntry', [['123']]);
        tick(1);
        resolve([1234]);
        tick(1);
        expect(getResourceSpy).toHaveBeenCalledWith('entries.{}.author', [['1234']]);
        tick(1);
        resolve([777]);
        tick(1);
        expect(getResourceSpy).toHaveBeenCalledWith('users.{}', [['777']]);
        tick(1);
        resolve([{name: 'James Bond'}]);
        tick(1);
        expect(store.topics[123].openingEntry).toEqual(1234);
        expect(store.entries[1234].author).toEqual(777);
        expect(store.users[777]).toEqual({name: 'James Bond'});
    });
    it('works with collections', function () {
        getResourceSpy.and.returnValue(Promise.resolve([[12, 13, 14, 15]]));
        getRef(schema, 'topics.123.entries', getResourceSpy, store);
        tick(1);
        expect(getResourceSpy).toHaveBeenCalledWith('topics.{}.entries', [['123']]);
        tick(1);
        expect(store.topics[123].entries).toEqual([12, 13, 14, 15]);
        // TODO
    });
});


function createDbBackend(schema, getRef) {
    console.assert(_.isFunction(getRef));
    var prefix = '/?refs=';
    var store = {};
    return {
        get: function(path) {
            console.assert(_.startsWith(path, prefix), 'Invalid path: ' + path);
            var refs = path.substring(prefix.length).split(',');
            return Promise.all(_.map(refs, function (ref) {
                return getRef(schema, ref, store);
            })).then(function () {
                return store;
            });
        },
    };
}

describe('createDbBackend', function () {
    var schema = {
        topics: [{
            id: 123,
            name: 'Example topic',
            entries: [new Ref('entries')],
            openingEntry: new Ref('entries'),
            participants: [new Ref('users')],
            creator: new Ref('users'),
        }],
        entries: [{
            id: 123,
            text: 'Hello world',
            author: new Ref('users'),
        }],
        users: [{
            id: 123,
            name: 'Winnie Pooh',
            avatar: {
                url: 'http://example.com/pooh.jpg',
            }
        }],
    };
    xit('calls the given getRef() callback with correct arguments', function () {
        var spy = jasmine.createSpy().and.returnValue(new Promise(function(){}));
        var backend = createDbBackend(schema, spy);
        expect(backend.get('/?refs=entries.123.author')).toEqual(jasmine.any(Promise));
        expect(spy).toHaveBeenCalledWith(schema, 'entries.{}.author', 123);
    });
});
