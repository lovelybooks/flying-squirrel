/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('../Ref');
var frontend = require('../frontend');

// Use cases for this schema:
// 1. generate endpoints (server-side)
// 2. generate mocks for the frontend (inspectCallback)
// 3. validate data from user on both sides
// 4. assert that data caming from each side is consistent with the other
// 5. generate mocks for unit tests
// 6. Caching the models client-side (maybe also in localStorage)

describe('frontend stuff', function () {

    describe('createHttpBackend', function () {
        var createHttpBackend = frontend.createHttpBackend;
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

    describe('generateApiProxy', function() {
        var generateApiProxy = frontend.generateApiProxy;

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
});
