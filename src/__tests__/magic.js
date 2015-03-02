/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('../Ref');
var createInterceptor = require('../createInterceptor');


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
