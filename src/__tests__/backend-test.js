/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('../Ref');
var backendUtils = require('../backend');

// example handlers
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


describe('backend stuff', function () {
    var getRef = backendUtils.getRef;
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
        var tick = jasmine.clock().tick;
        var getResourceSpy, store;
        beforeEach(function () {
            getResourceSpy = jasmine.createSpy('getResource').and.returnValue(Promise.resolve());
            jasmine.clock().install();
            store = {};
            spyOn(console, 'log'); // Disabling console output. TODO: make output configurable
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
        describe('advanced tests', function () {
            var resolve;
            beforeEach(function () {
                getResourceSpy.and.callFake(function () {
                    return new Promise(function (_resolve) {
                        resolve = _resolve;
                    });
                });
            });
            function expectResouceRequest(resource, args) {
                expect(getResourceSpy).toHaveBeenCalledWith(resource, args);
                tick(1);
            }
            function respondWith(response) {
                resolve(response);
                tick(1);
            }
            it('works with deep references', function () {
                getRef(schema, 'topics.123.openingEntry.author', getResourceSpy, store);
                tick(1);
                expectResouceRequest('topics.{}.openingEntry', [['123']]);
                respondWith([1234]);
                expectResouceRequest('entries.{}.author', [['1234']]);
                respondWith([777]);
                expectResouceRequest('users.{}', [['777']]);
                respondWith([{name: 'James Bond'}]);
                expect(store.topics[123].openingEntry).toEqual(1234);
                expect(store.entries[1234].author).toEqual(777);
                expect(store.users[777]).toEqual({name: 'James Bond'});
            });
            it('works with \'*\' for collections of refs', function () {
                getRef(schema, 'topics.123.entries.*', getResourceSpy, store);
                tick(1);
                expectResouceRequest('topics.{}.entries', [['123']]);
                respondWith([12, 14, 16]);
                expectResouceRequest('entries.{}', [['12', '14', '16']]);
                respondWith([
                    {id: 12, text: 'foo'},
                    {id: 14, text: 'bar'},
                    {id: 16, text: 'baz'},
                ]);
                expect(_.values(store.topics[123].entries)).toEqual([12, 14, 16]);
                expect(_.sortBy(_.keys(store.entries))).toEqual(['12', '14', '16']);
                expect(store.entries[16].text).toEqual('baz');
            });
            it('works with \'*\' for collections of objects', function () {
                getRef(schema, 'entries.*', getResourceSpy, store);
                expectResouceRequest('entries', []);
                respondWith([12, 14, 16]);
                expectResouceRequest('entries.{}', [['12', '14', '16']]);
                respondWith([
                    {id: 12, text: 'foo'},
                    {id: 14, text: 'bar'},
                    {id: 16, text: 'baz'},
                ]);
                expect(_.sortBy(_.keys(store.entries))).toEqual(['12', '14', '16']);
                expect(store.entries[16].text).toEqual('baz');
            });
            it('works with \'*\' for stuff inside collections', function () {
                getRef(schema, 'entries.*.author', getResourceSpy, store);
                tick(1);
                expectResouceRequest('entries', []);
                respondWith([12, 14, 16]);
                expectResouceRequest('entries.{}.author', [['12', '14', '16']]);
                respondWith([102, 104, 106]);
                expectResouceRequest('users.{}', [['102', '104', '106']]);
                respondWith([
                    {id: 102, name: 'Superman'},
                    {id: 104, name: 'Spiderman'},
                    {id: 106, name: 'Batman'},
                ]);
                expect(store.entries[12]).toEqual({author: 102});
                expect(store.entries[14]).toEqual({author: 104});
                expect(store.entries[16]).toEqual({author: 106});
                expect(_.size(store.entries)).toEqual(3);
                expect(_.sortBy(_.keys(store.users))).toEqual(['102', '104', '106']);
                expect(store.users[106].name).toEqual('Batman');
            });
        });
    });
});
