/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('../Ref');


// Mocking console.assert for tests
console.assert = function(condition, message) {
    message = message || 'Assertion failed';
    expect(condition).toBeTruthy(message);
};


// Use cases for this schema:
// 1. generate endpoints (server-side)
// 2. generate mocks for the frontend (inspectCallback)
// 3. validate data from user on both sides
// 4. assert that data caming from each side is consistent with the other
// 5. generate mocks for unit tests
// 6. Caching the models client-side (maybe also in localStorage)


function generateEndpointsList(schemaObj) {
    var endpointsList = [];

    function traverse(obj, prefix) {
        prefix = prefix || '';
        _.each(obj, function(value, key) {
            if (_.isArray(value)) {
                endpointsList.push({path: prefix + key, type: 'collection'});
                if (value[0] instanceof Ref) {
                    return; // No endpoints for individual references in collection
                }
                endpointsList.push({path: prefix + key + '/0', type: 'item'});
            } if (value instanceof Ref) {
                endpointsList.push({path: prefix + key, type: 'item (ref)'});
            }
            if (_.isObject(value)) {
                traverse(value, prefix + key + '/');
            }
        });
    }

    traverse(schemaObj, '/');

    return endpointsList;
}

describe('generateEndpointsList', function() {
    it('should generate a list of endpoints', function() {
        var dataModelDef = {
            topics: [{
                name: 'Example topic',
                entries: [new Ref('entries')],
                openingEntry: new Ref('entries'),
            }],
            entries: [{
                text: 'Hello world',
            }],
        };
        var endpointsList = generateEndpointsList(dataModelDef);
        expect(_.map(endpointsList, 'path')).toEqual([
            '/topics',
            '/topics/0',
            '/topics/0/entries',
            '/topics/0/openingEntry',
            '/entries',
            '/entries/0',
        ]);
    });
});


var createInterceptor = require('../createInterceptor');

describe('createInterceptor', function () {

    var dataModelDef = {
        topics: [{
            id: 123,
            name: 'Example topic',
            entries: [new Ref('entries')],
            openingEntry: new Ref('entries'),
            participants: [new Ref('users')],
            creator: new Ref('users'),
        }],
        entries: [{
            id: 1,
            text: 'Sample entry from schema',
            author: new Ref('users'),
            topic: new Ref('topics'),
        }],
        users: [{
            id: 1,
            name: 'Winnie Pooh',
            avatar: {
                url: 'http://example.com/pooh.jpg',
            }
        }],
        config: {
            imagesUrl: 'http://example.com/images/',
        },
    };

    it ('should work with empty store', function () {
        var spy = jasmine.createSpy();
        var interceptor = createInterceptor(dataModelDef, {}, spy);
        expect(spy).not.toHaveBeenCalled();
        expect(interceptor.topics.get(199).name).toEqual('Example topic');
        expect(spy).toHaveBeenCalledWith('topics');
        expect(spy).toHaveBeenCalledWith('topics.199');
        expect(spy).toHaveBeenCalledWith('topics.199.name');
        expect(spy.calls.count()).toBe(3);
    });

    describe('with a pre-filled store', function () {

        var dataStoreExample = {
            topics: {
                '123': {
                    id: 123,
                    name: 'Example topic from Store',
                    entries: [
                        new Ref('entries.12'),
                        new Ref('entries.15'),
                    ],
                }
            },
            entries: {
                '12': {
                    text: 'uuuu uuuu uuuuu uuuu uuuuuuuu uuuuuu uuu uuu!',
                },
                '15': {
                    text: 'Sample entry from store',
                    author: new Ref('users.42'),
                },
            },
            users: {
                '42': {
                    name: 'Frodo',
                },
            },
        };
        var spy, interceptor;

        beforeEach(function() {
            spy = jasmine.createSpy();
            interceptor = createInterceptor(dataModelDef, dataStoreExample, spy);
            expect(spy).not.toHaveBeenCalled();
        });

        it('should handle stored data correctly', function () {
            expect(interceptor.topics.get(123).name).toEqual("Example topic from Store");
            expect(spy).not.toHaveBeenCalled();
        });

        it('should detect data we don\'t have yet (for simple accessor)', function () {
            expect(interceptor.config.imagesUrl).toEqual('http://example.com/images/');
            expect(spy).toHaveBeenCalledWith('config');
            expect(spy).toHaveBeenCalledWith('config.imagesUrl');
        });

        it('should detect data we don\'t have yet (for collection item)', function () {
            expect(interceptor.topics.get(199)).not.toBeNull();
            expect(spy).toHaveBeenCalledWith('topics.199');
        });

        it('should detect data we don\'t have yet (for deeply-nested object)', function () {
            expect(interceptor.topics.get(123).openingEntry.text).toEqual("Sample entry from schema");
            expect(spy).not.toHaveBeenCalledWith('topics');
            expect(spy).not.toHaveBeenCalledWith('topics.123');
            expect(spy).toHaveBeenCalledWith('topics.123.openingEntry');
            expect(spy).toHaveBeenCalledWith('topics.123.openingEntry.text');
        });

        it('should work the same for both fetched and non-fetched data', function () {
            expect(interceptor.topics.get(123).entries.get(1).text).toEqual("Sample entry from store");
            expect(spy).not.toHaveBeenCalled();
            expect(interceptor.topics.get(199).entries.get(1).text).toEqual("Sample entry from schema");
            expect(spy).toHaveBeenCalledWith('topics.199.entries.1.text');
        });

        it('has inconsistent API that should be refactored', function () {
            var s1 = interceptor.topics.get(123).entries.get(1).text;
            var s2 = dataStoreExample.topics[123].entries[1].get(dataStoreExample).text;
            expect(s1).toEqual(s2);
        });
    });
});



function convertRefToEndpoint(ref) {
    return '/' + ref.replace(/\./g, '/');
}

describe('convertRefToEndpoint', function() {
    it('should map simple refs to endpoints', function() {
        expect(convertRefToEndpoint('config')).toEqual('/config');
        expect(convertRefToEndpoint('topics')).toEqual('/topics');
        expect(convertRefToEndpoint('topics.123')).toEqual('/topics/123');
        expect(convertRefToEndpoint('topics.123.openingEntry')).toEqual('/topics/123/openingEntry');
    });
});


function addResponseToStore(ref, response, store) {
    var chain = ref.split('.');
    var key;
    for (var i=0; i<chain.length-1; i++) {
        key = chain[i];
        object = object[key];
        if (!object) {
            // TODO create
        }
    }
    key = chain[chain.length - 1];
    object[key] = value;
}

describe('addResponseToStore', function () {
    var store;
    beforeEach(function() {
        store = {};
    });
    xit('should add values correctly', function () {
        addResponseToStore('config', [{imagesUrl: 'http://example.com/images'}], store);
        expect(store.config.imagesUrl).toEqual('http://example.com/images');
    });
});


function generateApiProxy(dataModelDef, dataSource) {

    var fetched = {};
    var store = {};

    var dataModelMock = {};

    function IO(callback) {

        function iterate() {
            // console.log('iterate!');
            var newRefsPromises = [];
            var mock = createInterceptor(dataModelDef, store, function (ref) {
                if (fetched[ref]) {
                    return;
                }
                // console.log('fetching ' + ref);
                dataSource.get(ref);
                newRefsPromises.push(new Promise(function(resolve, reject) {
                    setTimeout(function () {
                        // console.log('response ' + ref);
                        fetched[ref] = true;
                        resolve();
                    }, 0);
                }));
            });
            var error;
            try {
                callback(mock);
            } catch (e) {
                error = e;
            }
            if (newRefsPromises.length) {
                // Ah, the callback needs more data!
                // console.log('Ah, the callback needs more data!');
                if (error) {
                    console.log('by the way... ', error);
                }
                // we'll fetch the data and try again
                return Promise.all(newRefsPromises).then(iterate);
            } else {
                // No more data requests. We finish.
                // console.log('No more data requests. We finish.');

                if (error) {
                    throw error; // aww... we failed. Looks like a bug in the callback.
                } else {
                    var cleanData = {}; // just data, no mocks
                    return callback(cleanData);
                }
            }
        }

        return iterate();
    }

    return {
        IO: IO,
        __store: store,
    };
}

describe('generateApiProxy', function() {

    var dataModelDef = {
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
    var dataSource, API;

    beforeEach(function () {
        dataSource = {get: jasmine.createSpy('dataSource.get').and.callFake(function (ref) {
            console.log(ref);
        })};
        API = generateApiProxy(dataModelDef, dataSource);
        jasmine.clock().install();
    });

    afterEach(function () {
        jasmine.clock().uninstall();
    });

    it('should work with a simple callback', function () {
        API.IO(function (data) {
            return data.topics.get(123);
        });
        jasmine.clock().tick(5);
        expect(dataSource.get).toHaveBeenCalled();
    });

    xit('should work with a complex callback', function () {
        API.IO(function (data) {
            var topic = data.topics.get(123);
            var entryCount = topic.entries.getAll().length;
            var lastEntryAuthor = topic.entries.get(entryCount - 1).author;
            return {
                name: topic.name,
                entryTextSummaries: _.map(topic.entries.getAll(), function (entry) {
                    return entry.text.substring(0, 100);
                }),
                fiveLastEntries: _.slice(topic.entries.getAll(), entryCount - 5),
                entryCount: entryCount,
                lastEntryInfo: {
                    author: lastEntryAuthor,
                    avatar: lastEntryAuthor.avatar.url,
                },
            };
        });
        jasmine.clock().tick(5);
        expect(dataSource.get).not.toHaveBeenCalledWith('topics');
        expect(dataSource.get).toHaveBeenCalledWith('topics.123');
        expect(dataSource.get).toHaveBeenCalledWith('topics.123.entries');
        expect(dataSource.get).toHaveBeenCalledWith('topics.123.entries.9.author');
        expect(dataSource.get).toHaveBeenCalledWith('topics.123.entries.9.author.avatar');
    });

});
