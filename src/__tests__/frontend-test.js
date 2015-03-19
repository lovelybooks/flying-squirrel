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

    describe('generateApiProxy.IO()', function() {
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
        var dataSourceCallback, API;

        beforeEach(function () {
            dataSourceCallback =  jasmine.createSpy('dataSourceCallback').and.returnValue(
                new Promise(function() { /* never resolved */ })
            );
            API = generateApiProxy(schema, dataSourceCallback);
        });

        it('should work with a simple callback', function (done) {
            API.IO(function (data) {
                return data.topics.get(123);
            });
            setTimeout(function () {
                expect(dataSourceCallback).toHaveBeenCalled();
                // TODO expect promise to be resolved
                done();
            });
        });

        it('should work with a complex callback', function (done) {
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
            setTimeout(function () {
                expect(dataSourceCallback).toHaveBeenCalledWith([
                    'topics.123',
                    'topics.123.entries.*',
                    'topics.123.entries.0',
                    'topics.123.entries.0.author',
                    'topics.123.entries.0.author.avatar',
                ]);
                expect(dataSourceCallback.calls.count()).toBe(1);
                done();
            }, 1);
        });

        it('should fail if the callback throws', function (done) {
            spyOn(console, 'log');
            dataSourceCallback.and.returnValue(Promise.resolve({topics:{'123':{title: 'OMG'}}}));
            API.IO(function (data) {
                data.topics.get(123);
                throw 'omg';
            }).catch(function (err) {
                expect(err).toEqual('omg');
                expect(dataSourceCallback.calls.count()).toBe(1);
                done();
            });
        });

        it('should fail if the callback throws without accessing data', function (done) {
            spyOn(console, 'log');
            API.IO(function (data) { // jshint ignore:line
                throw 'omg';
            }).catch(function (err) {
                expect(err).toEqual('omg');
                done();
            });
        });

        it('should return whatever the callback returned', function (done) {
            spyOn(console, 'log');
            API.IO(function (data) { // jshint ignore:line
                return 'unicorn';
            }).then(function (value) {
                expect(value).toEqual('unicorn');
                done();
            });
        });

    });
});
