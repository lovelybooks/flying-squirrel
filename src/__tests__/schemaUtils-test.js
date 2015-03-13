/*jshint jasmine: true */
'use strict';

var _ = require('lodash');
var Ref = require('../Ref');
var schemaUtils = require('../schemaUtils');

describe('schemaUtils', function () {
    var schema = {
        topics: [{
            name: 'Example topic',
            unicorns: 10,
            entries: [new Ref('entries')],
            openingEntry: new Ref('entries'),
            tags: ['tag'],
            stats: {
                viewCount: 23,
            },
        }],
        entries: [{
            text: 'Hello world',
        }],
    };

    describe('getResourcesInfo', function() {
        it('generates a list of resources for schema', function() {
            var expectedResources = [
                'entries',
                'entries.{}',
                'topics',
                'topics.{}',
                'topics.{}.entries',
                'topics.{}.openingEntry',
                'topics.{}.stats',
            ];
            var observedResources = _.keys(schemaUtils.getResourcesInfo(schema));
            _.each(expectedResources, function (resource) {
                expect(observedResources).toContain(resource);
            });
            _.each(observedResources, function (resource) {
                expect(expectedResources).toContain(resource);
            });
        });
        it('gives types of endpoints and of objects in collections', function() {
            var resourcesInfo = schemaUtils.getResourcesInfo(schema);
            expect(resourcesInfo.topics).toEqual(jasmine.objectContaining({
                type: 'collection',
                inCollections: [],
                collectionOf: 'object',
            }));
            expect(resourcesInfo['topics.{}']).toEqual(jasmine.objectContaining({
                type: 'object',
                inCollections: ['topics'],
            }));
            expect(resourcesInfo['topics.{}.openingEntry']).toEqual(jasmine.objectContaining({
                type: 'reference',
            }));
            expect(resourcesInfo['topics.{}.entries']).toEqual(jasmine.objectContaining({
                type: 'collection',
                collectionOf: 'reference',
            }));
            expect(resourcesInfo['entries.{}']).toEqual(jasmine.objectContaining({
                inCollections: ['entries'],
            }));
        });
        it('gives some additional info for the resources', function() {
            var resourcesInfo = schemaUtils.getResourcesInfo(schema);
            expect(resourcesInfo['topics.{}.openingEntry']).toEqual({
                type: 'reference',
                inCollections: ['topics'],
                args: ['topicsIds (a list of integers)'],
                returnType: ['list', 'integer'],
                referenceTo: 'entries', // for references
            });
            expect(resourcesInfo['entries.{}']).toEqual({
                type: 'object',
                inCollections: ['entries'],
                args: ['entriesIds (a list of integers)'],
                returnType: ['list', 'object'],
                primitives: ['text'], // for objects
            });
        });
    });

    describe('formatNestedType', function() {
        var formatNestedType = schemaUtils.formatNestedType;
        it('formats nested type names nicely', function() {
            expect(formatNestedType(['list'])).toEqual('list');
            expect(formatNestedType(['list', 'integer'])).toEqual('list of integers');
            expect(formatNestedType(['Promise', 'x'])).toEqual('Promise of x');
            expect(formatNestedType(['list', 'list', 'apple'])).toEqual('list of lists of apples');
            expect(formatNestedType(['collection', 'list'])).toEqual('collection of lists');
        });
    });

    describe('checkResourceHandlers', function() {
        var checkResourceHandlers = schemaUtils.checkResourceHandlers;
        var schema = {
            entries: [{
                text: 'Hello world',
            }],
        };
        var myHandlers;
        beforeEach(function () {
            myHandlers = {
                'entries': function (criteria) {}, // jshint ignore:line
                'entries.{}': function (entryIds) {}, // jshint ignore:line
            };
        });
        it('returns an empty list when all is ok', function() {
            expect(checkResourceHandlers(schema, myHandlers)).toEqual([]);
        });
        it('detects missing resources', function() {
            delete myHandlers.entries;
            var problems = checkResourceHandlers(schema, myHandlers);
            expect(problems).toEqual([jasmine.any(String)]);
            expect(problems[0]).toContain('Missing');
        });
        it('detects unexpected resources', function() {
            myHandlers.unexpected = function () {};
            var problems = checkResourceHandlers(schema, myHandlers);
            expect(problems).toEqual([jasmine.any(String)]);
            expect(problems[0]).toContain('Unexpected');
        });
        it('detects invalid resource handlers', function() {
            myHandlers.entries = function (foo, bar, baz) {}; // jshint ignore:line
            var problems = checkResourceHandlers(schema, myHandlers);
            expect(problems).toEqual([jasmine.any(String)]);
            expect(problems[0]).toContain('Invalid');
        });
    });

    describe('checkResourceResult', function () {
        var checkResourceResult = schemaUtils.checkResourceResult;
        var exampleTopic = {id: 123, name: 'Hello!', unicorns: 5, tags: ['omg']};
        var resourcesInfo;
        beforeEach(function () {
            resourcesInfo = schemaUtils.getResourcesInfo(schema);
            spyOn(console, 'warn');
        });
        it('should work for collection item endpoints (topics.{})', function () {
            var endpoint = 'topics.{}';
            var check = checkResourceResult.bind(null, endpoint, resourcesInfo[endpoint]);
            // valid examples
            expect(check([[123]], [exampleTopic]))
                .toEqual([], '1 result - ok');
            expect(check([[456]], [null]))
                .toEqual([], 'no result, but ok');
            expect(check([[123, 123]], [exampleTopic, exampleTopic]))
                .toEqual([], '2 results - ok');
            expect(check([[456, 123]], [null, exampleTopic]))
                .toEqual([], '1st result failed, 2nd ok');
            // invalid examples
            expect(check([[123]], null))
                .not.toEqual([], 'null');
            expect(check([[123]], exampleTopic))
                .not.toEqual([], 'not wrapped');
            expect(check([[123]], [[exampleTopic]]))
                .not.toEqual([], 'wrapped too much');
            expect(check([[123]], []))
                .not.toEqual([], 'empty list');
            expect(check([[123]], {'0': exampleTopic})).not.toEqual([], '{0: stuff}');
            expect(check([[123, 456]], [exampleTopic]))
                .not.toEqual([], 'too little');
            expect(check([[123]], [exampleTopic, null]))
                .not.toEqual([], 'too many');
            expect(check([[456]], [exampleTopic]))
                .not.toEqual([], 'mismatched id');
            expect(console.warn).toHaveBeenCalled();
        });
        it('should work for ref endpoints (topics.{}.openingEntry)', function () {
            var endpoint = 'topics.{}.openingEntry';
            var check = checkResourceResult.bind(null, endpoint, resourcesInfo[endpoint]);
            // valid examples
            expect(check([[123]], [14]))
                .toEqual([], '1 result - ok');
            expect(check([[456]], [null]))
                .toEqual([], 'no result, but ok');
            // invalid examples
            expect(check([[123]], null))
                .not.toEqual([], 'null');
            expect(check([[123]], 14))
                .not.toEqual([], 'not wrapped');
            expect(check([[123]], [[14]]))
                .not.toEqual([], 'wrapped too much');
            expect(check([[123]], []))
                .not.toEqual([], 'empty list');
            expect(check([[123, 456]], [14]))
                .not.toEqual([], 'too little');
            expect(check([[123]], [14, null]))
                .not.toEqual([], 'too many');
            expect(console.warn).toHaveBeenCalled();
        });
        it('should check the schema for expected fields', function () {
            var endpoint = 'topics.{}';
            var check = checkResourceResult.bind(null, endpoint, resourcesInfo[endpoint]);
            // valid examples
            expect(check([[123]], [{name: 'Hello', unicorns: 5, tags: []}]))
                .toEqual([], 'ok');
            expect(check([[123]], [{name: 'Hello', unicorns: 0, tags: null}]))
                .toEqual([], 'falsy field value is ok');
            expect(check([[123]], [{id: 123, name: 'Hello', unicorns: 5, tags: []}]))
                .toEqual([], 'id can be there or not');
            // invalid examples
            expect(check([[123]], [{id: 456, name: 'Hello', unicorns: 5}]))
                .not.toEqual([], 'mismatched id');
            expect(check([[123]], [{name: 'Hello', unicorns: {}}]))
                .not.toEqual([], 'object instead of primitive');
            expect(check([[123]], [{name: 'Hello'}]))
                .not.toEqual([], 'missing field');
            expect(check([[123]], [{name: 'Hello', unicorns: 0, foo: 'bar'}]))
                .not.toEqual([], 'unexpected field');
        });
    });

    describe('getTypeDeep', function () {
        var getTypeDeep = schemaUtils.getTypeDeep;
        it('returns types for refs in schema', function () {
            expect(getTypeDeep(schema, 'topics')).toEqual('collection');
            expect(getTypeDeep(schema, 'topics.123')).toEqual('object');
            expect(getTypeDeep(schema, 'topics.123.entries')).toEqual('collection');
            expect(getTypeDeep(schema, 'topics.123.tags')).toEqual('primitive'); // list of primitives!
            expect(getTypeDeep(schema, 'topics.123.entries.2')).toEqual('reference');
            expect(getTypeDeep(schema, 'topics.123.entries.2.text')).toEqual('primitive');
        });
        it('throws error for invalid keys', function () {
            expect(function () {
                getTypeDeep(schema, 'bork');
            }).toThrow();
            expect(function () {
                getTypeDeep(schema, 'topics.bork.bork');
            }).toThrow();
        });
    });

    describe('getRefFromStore', function () {
        var getRefFromStore = schemaUtils.getRefFromStore;
        var store = {
            topics: {
                '123': {
                    name: 'aaa',
                    entries: {'0':12, '1':14},
                },
            },
            entries: {
                '12': {text: 'text text'},
            }
        };
        it ('gets fields from store', function () {
            expect(_.keys(getRefFromStore(schema, store, 'topics'))).toEqual(_.keys(store.topics));
            expect(getRefFromStore(schema, store, 'topics.123.name')).toEqual(store.topics[123].name);
            expect(getRefFromStore(schema, store, 'topics.123.entries.0.text')).toBe(store.entries[12].text);
            // TODO: multiple ids support: topics.123,124,125
            // TODO: star support: topics.123.entries.*
        });
    });

    describe('filterRefs', function () {
        var filterRefs = schemaUtils.filterRefs;
        it('fetches objects for primitives', function () {
            expect(filterRefs(schema, ['topics.123.name'])).toEqual(['topics.123']);
        });
        it('filters out duplicate refs', function () {
            expect(filterRefs(schema, [
                'topics.123.name',
                'topics.123.name',
            ])).toEqual(['topics.123']);
        });
        it('strips primitive refs', function () {
            expect(filterRefs(schema, [
                'topics.123',
                'topics.123.name',
            ])).toEqual(['topics.123']);
        });
        it('doesn\'t remove objects if their primitives were accessed', function () {
            expect(filterRefs(schema, [
                'topics.123',
                'topics.123.name',
                'topics.123.stats',
                'topics.123.stats.viewCount',
            ])).toEqual(['topics.123', 'topics.123.stats']);
        });
    });
});
