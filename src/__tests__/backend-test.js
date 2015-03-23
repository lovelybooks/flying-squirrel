/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('../Ref');
var backendUtils = require('../backend');


describe('backend stuff', function () {

    describe('fetchRef', function () {
        var fetchRef = backendUtils.fetchRef;
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
        var getResourceSpy, store;
        beforeEach(function () {
            getResourceSpy = jasmine.createSpy('getResource');
            jasmine.clock().install();
            store = {};
            spyOn(console, 'log'); // Disabling console output. TODO: make output configurable
        });
        afterEach(function () {
            jasmine.clock().tick(1);
            jasmine.clock().uninstall();
        });

        it('calls getResource to get data', function () {
            getResourceSpy.and.returnValue(Promise.resolve([{}]));
            fetchRef(schema, 'entries.1234', getResourceSpy, store);
            expect(getResourceSpy).toHaveBeenCalledWith('entries.{}', [['1234']]);
        });
        it('resolves the promise', function () {
            var done = false;
            getResourceSpy.and.returnValue(Promise.resolve([{}]));
            fetchRef(schema, 'entries.1234', getResourceSpy, store).then(function () {
                done = true;
            });
            jasmine.clock().tick(1);
            expect(done).toBe(true);
        });
        it('puts the data in store', function () {
            getResourceSpy.and.returnValue(Promise.resolve([{text: 'hello'}]));
            fetchRef(schema, 'entries.1234', getResourceSpy, store);
            jasmine.clock().tick(1);
            expect(store.entries[1234]).toEqual({text: 'hello'});
        });
        it('works with references', function () {
            getResourceSpy.and.returnValue(Promise.resolve([777]));
            fetchRef(schema, 'entries.1234.author', getResourceSpy, store);
            jasmine.clock().tick(1);
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
            function startTestingFetchRef(ref) {
                fetchRef(schema, ref, getResourceSpy, store);
                jasmine.clock().tick(1);
            }
            function expectResouceRequest(resource, args) {
                expect(getResourceSpy).toHaveBeenCalledWith(resource, args);
                jasmine.clock().tick(1);
            }
            function respondWith(response) {
                resolve(response);
                jasmine.clock().tick(1);
            }

            it('works with deep references (topics.123.openingEntry.author)', function () {
                startTestingFetchRef('topics.123.openingEntry.author');
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
            it('works with \'*\' for collections of refs (topics.123.entries.*)', function () {
                startTestingFetchRef('topics.123.entries.*');
                expectResouceRequest('topics.{}.entries', [['123'], {}]);
                respondWith([[12, 14, 16]]); // Returning list for each requested topic
                expectResouceRequest('entries.{}', [['12', '14', '16']]);
                respondWith([
                    {id: 12, text: 'foo'},
                    {id: 14, text: 'bar'},
                    {id: 16, text: 'baz'},
                ]);
                expect(_.keys(store.topics[123].entries)).toEqual(['0', '1', '2']);
                expect(_.values(store.topics[123].entries)).toEqual([12, 14, 16]);
                expect(_.sortBy(_.keys(store.entries))).toEqual(['12', '14', '16']);
                expect(store.entries[16].text).toEqual('baz');
            });
            it('works with \'*\' for collections of objects (entries.*)', function () {
                startTestingFetchRef('entries.*');
                expectResouceRequest('entries', [{}]);
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
            it('works with \'*\' for stuff inside collections (entries.*.author)', function () {
                startTestingFetchRef('entries.*.author');
                expectResouceRequest('entries', [{}]);
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
            it('handles null references nicely (meaning: no referenced object)', function () {
                startTestingFetchRef('entries.12,14.author');
                expectResouceRequest('entries.{}.author', [['12', '14']]);
                respondWith([102, null]);
                expectResouceRequest('users.{}', [['102']]);
                respondWith([{id: 102, name: 'Superman'}]);
                expect(store.entries[12].author).toEqual(102);
                expect(store.entries[14].author).toBe(null);
                expect(store.users[102].name).toEqual('Superman');
            });
            it('handles null objects nicely (meaning: object not found in collection)', function () {
                startTestingFetchRef('entries.12,14.author');
                expectResouceRequest('entries.{}.author', [['12', '14']]);
                respondWith([102, null]);
                expectResouceRequest('users.{}', [['102']]);
                respondWith([{id: 102, name: 'Superman'}]);
                expect(store.entries[12].author).toEqual(102);
                expect(store.entries[14].author).toBe(null);
                expect(store.users[102].name).toEqual('Superman');
            });
            it('handles empty collections nicely', function () {
                startTestingFetchRef('topics.123.entries.*.author');
                expectResouceRequest('topics.{}.entries', [['123'], {}]);
                getResourceSpy.calls.reset();
                respondWith([[]]);
                jasmine.clock().tick(10);
                expect(getResourceSpy).not.toHaveBeenCalled(); // We expect no more requests.
                expect(store.topics[123].entries).toEqual({});
                expect(_.keys(store.topics).length).toBe(1);
                expect(_.keys(store.entries).length).toBe(0);
            });
            it('doesn\'t ask twice for the same thing', function () {
                startTestingFetchRef('entries.12,14.author');
                expectResouceRequest('entries.{}.author', [['12', '14']]);
                respondWith([102, 102]);
                expectResouceRequest('users.{}', [['102']]);
            });
        });
    });

    describe('batchArgs', function () {
        var batchArgs = backendUtils.batchArgs;

        var handlerInfo;
        beforeEach(function () {
            handlerInfo = {
                type: 'reference',
                inCollections: ['entries'],
                args: ['entriesIds (a list of integers)'],
                returnType: ['list', 'integer'],
                referenceTo: 'users',
            };
        });

        it('should collapse the arguments', function () {
            // NOTE: ['123'] is the argument for resource, so [[['123']]] is an arrayOfArgArrays
            expect(batchArgs([[['123']]           ], handlerInfo).arrayOfArgArrays).toEqual([[['123']]]);
            expect(batchArgs([[['123']], [['123']]], handlerInfo).arrayOfArgArrays).toEqual([[['123']]]);
            expect(batchArgs([[['123']], [['456']]], handlerInfo).arrayOfArgArrays).toEqual([[['123', '456']]]);
        });
        it('should handle the mapping back to individual results', function () {
            var batched = batchArgs([[['123']], [['456']]], handlerInfo);
            var batchResult = [[{foo: 'aaa'}, {foo: 'zzz'}]];
            expect(batched.getIndividualResult(batchResult, [['123']])).toEqual([{foo: 'aaa'}]);
            expect(batched.getIndividualResult(batchResult, [['456']])).toEqual([{foo: 'zzz'}]);
        });
        it('should handle the mapping back to individual results - path 2', function () {
            handlerInfo.inCollections = [];
            var batched = batchArgs([[['123']]], handlerInfo);
            var batchResult = [[{foo: 'aaa'}]];
            expect(batched.getIndividualResult(batchResult, [['123']])).toEqual([{foo: 'aaa'}]);
        });
    });
});
