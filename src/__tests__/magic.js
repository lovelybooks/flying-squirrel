/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('../Ref');
var createInterceptor = require('../createInterceptor');

var utils = require('../schemaUtils');

// Use cases for this schema:
// 1. generate endpoints (server-side)
// 2. generate mocks for the frontend (inspectCallback)
// 3. validate data from user on both sides
// 4. assert that data caming from each side is consistent with the other
// 5. generate mocks for unit tests
// 6. Caching the models client-side (maybe also in localStorage)


// This Backend collects references, sends requests to endpoints, and handles their responses.
function createHttpBackend(schemaObj, httpGet) {
    console.assert(_.isFunction(httpGet));
    var backend = {
        get: function (refs) {
            var filteredRefs = utils.filterRefs(schemaObj, refs);
            return httpGet('/?refs=' + filteredRefs.join(',')).then(function (result) {
                _.merge(backend.store, result);
                return backend.store;
            });
        },
        store: {},
    };
    return backend;
}

describe('createHttpBackend', function () {
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
    it('should call the get() method', function () {
        var spy = jasmine.createSpy().and.returnValue(new Promise(function(){}));
        var backend = createHttpBackend(schema, spy);
        expect(backend.get(['topics'])).toEqual(jasmine.any(Promise));
        expect(spy).toHaveBeenCalledWith('/?refs=topics');
        expect(backend.get(['topics.123'])).toEqual(jasmine.any(Promise));
        expect(spy).toHaveBeenCalledWith('/?refs=topics.123');
    });
    it('should filter the refs', function () {
        var spy = jasmine.createSpy().and.returnValue(new Promise(function(){}));
        var backend = createHttpBackend(schema, spy);
        expect(backend.get(['topics.123', 'topics.123.name'])).toEqual(jasmine.any(Promise));
        expect(spy).toHaveBeenCalledWith('/?refs=topics.123');
    });
    it('should put the data to store', function () {
        jasmine.clock().install();
        var respond;
        var done;
        function httpGet(path) {
            expect(path).toBeDefined();
            return Promise.resolve({
                topics: {
                    123: {name: 'Some topic title'},
                }
            });
        }
        var backend = createHttpBackend(schema, httpGet);
        backend.get(['topics.123']).then(function(store) {
            expect(store).toBe(backend.store);
            expect(backend.store.topics[123]).toBeDefined();
            done = true;
        });
        jasmine.clock().tick(1);
        expect(done).toBe(true);
        jasmine.clock().uninstall();
    });
});


function generateApiProxy(schema, dataSource) {

    var store = {};

    function IO(callback) {

        function iterate() {
            // console.log('iterate!');
            var newRefsPromises = [];
            var mock = createInterceptor(schema, store, function (ref, subSchema) {
                var type = utils.determineType(subSchema);
                if (_.endsWith(ref, '.*')) {
                    var oneUp = ref.substring(0, ref.length - 2);
                    newRefsPromises.push(dataSource.get(oneUp));
                } else if (type === 'reference' || type === 'object') {
                    newRefsPromises.push(dataSource.get(ref));
                }
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
                    // TODO var cleanData = {}; // just data, no mocks
                    // TODO return callback(cleanData);
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
    var dataSource, API;

    beforeEach(function () {
        dataSource = {
            get: jasmine.createSpy('dataSource.get').and.callFake(function () {
                return new Promise(function() {
                    // never resolved
                });
            }),
        };
        API = generateApiProxy(schema, dataSource);
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
        // TODO expect promise to be resolved
    });

    it('should work with a complex callback', function () {
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
        expect(dataSource.get).toHaveBeenCalledWith('topics.123.entries'); // from getAll()
        expect(dataSource.get).toHaveBeenCalledWith('topics.123.entries.0.author');
        expect(dataSource.get).toHaveBeenCalledWith('topics.123.entries.0.author.avatar');
    });

});
