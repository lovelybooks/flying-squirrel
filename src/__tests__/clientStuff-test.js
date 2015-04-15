/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('../Ref');
var clientStuff = require('../clientStuff');


describe('clientStuff', function () {

    describe('generateApiProxy, a.k.a. IO()', function() {
        var generateApiProxy = clientStuff.generateApiProxy;

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
        var dataSourceCallback, IO;

        beforeEach(function () {
            dataSourceCallback = jasmine.createSpy('dataSourceCallback').and.returnValue(
                new Promise(function() { /* never resolved */ })
            );
            IO = generateApiProxy(schema, dataSourceCallback, {});
        });

        it('should work with a simple callback', function (done) {
            IO(function (data) {
                return data.topics.get(123);
            });
            setTimeout(function () {
                expect(dataSourceCallback).toHaveBeenCalled();
                // TODO expect promise to be resolved
                done();
            });
        });

        it('should work with a complex callback', function (done) {
            IO(function (data) {
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
            dataSourceCallback.and.returnValue(Promise.resolve({topics:{'123':{name: 'LOL'}}}));
            var ioCallbackCalls = 0;
            IO(function (data) {
                data.topics.get(123);
                ioCallbackCalls++;
                throw 'omg';
            }).catch(function (err) {
                expect(err).toEqual('omg');
                expect(ioCallbackCalls).toBe(2);
                expect(dataSourceCallback.calls.count()).toBe(1);
                done();
            });
        });

        it('should fail if the callback throws without accessing data', function (done) {
            spyOn(console, 'log');
            IO(function (data) { // jshint ignore:line
                throw 'omg';
            }).catch(function (err) {
                expect(err).toEqual('omg');
                done();
            });
        });

        it('should return whatever the callback returned (simple, static value)', function (done) {
            IO(function (data) { // jshint ignore:line
                return 'unicorn';
            }).then(function (value) {
                expect(value).toEqual('unicorn');
                done();
            });
        });

        it('should return whatever the callback returned (value from backend)', function (done) {
            dataSourceCallback.and.returnValue(Promise.resolve({topics:{'123':{name: 'LOL'}}}));
            IO(function (data) { // jshint ignore:line
                return data.topics.get(123);
            }).then(function (topic) {
                expect(topic.name).toEqual('LOL');
                // expect(topic).toEqual({name: 'LOL'}); // TODO: for now, Interceptor is returned
                done();
            });
        });

        it('should read data from the store', function (done) {
            var store = {users: {'7': {name: 'James Bond'}}};
            IO = generateApiProxy(schema, dataSourceCallback, store);
            IO(function (data) { // jshint ignore:line
                return data.users.get(7).name;
            }).then(function (value) {
                expect(value).toEqual('James Bond');
                done();
            });
        });

        it('should write data to the store', function (done) {
            var store = {};
            IO = generateApiProxy(schema, dataSourceCallback, store);
            dataSourceCallback.and.returnValue(Promise.resolve({topics:{'123':{name: 'LOL'}}}));
            IO(function (data) { // jshint ignore:line
                return data.topics.get(123);
            }).then(function () {
                expect(store.topics[123]).toEqual({name: 'LOL'});
                done();
            });
        });

        it('should throw an error if the data is used outside the callback', function (done) {
            var store = {};
            IO = generateApiProxy(schema, dataSourceCallback, store);
            var stolenData;
            IO(function (data) { // jshint ignore:line
                stolenData = data;
                return 'hello';
            }).then(function () {
                expect(function () {
                    stolenData.topics.get(123);
                }).toThrow();
                done();
            });
        });

        it('should ask for the data repeatedly', function (done) {
            var resolve;
            dataSourceCallback.and.callFake(function () {
                return new Promise(function (_resolve) {
                    resolve = _resolve;
                });
            });
            var callbackCallCount = 0;
            IO(function (data) { // jshint ignore:line
                callbackCallCount++;
                if (callbackCallCount === 1) {
                    return data.topics.get(10);
                } else {
                    return data.topics.get(123);
                }
            }).then(function (topic) {
                expect(topic.name).toEqual('topic 123');
                done();
            });
            setTimeout(function () {
                expect(dataSourceCallback).toHaveBeenCalledWith(['topics.10']);
                resolve({topics:{'10':{name: 'topic 10'}}});
                setTimeout(function () {
                    expect(dataSourceCallback).toHaveBeenCalledWith(['topics.123']);
                    resolve({topics:{'123':{name: 'topic 123'}}});
                }, 1);
            }, 1);
        });

    });
});
