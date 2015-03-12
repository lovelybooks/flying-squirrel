/*jshint jasmine: true */
'use strict';

var _ = require('lodash');
var Ref = require('../Ref');
var schemaUtils = require('../schemaUtils');

describe('schemaUtils', function () {

    describe('getResourcesInfo', function() {
        var schema = {
            topics: [{
                name: 'Example topic',
                entries: [new Ref('entries')],
                openingEntry: new Ref('entries'),
            }],
            entries: [{
                text: 'Hello world',
            }],
        };
        it('generates a list of resources for schema', function() {
            expect(_.sortBy(_.keys(schemaUtils.getResourcesInfo(schema)))).toEqual([
                'entries',
                'entries.{}',
                'topics',
                'topics.{}',
                'topics.{}.entries',
                'topics.{}.openingEntry',
            ]);
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
                inCollections: ['topics'],
                referenceTo: 'entries',
            }));
            expect(resourcesInfo['topics.{}.entries']).toEqual(jasmine.objectContaining({
                type: 'collection',
                collectionOf: 'reference',
            }));
            expect(resourcesInfo['entries.{}']).toEqual(jasmine.objectContaining({
                inCollections: ['entries'],
            }));
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
            expect(checkResourceHandlers(schema, myHandlers).length).toEqual(0);
        });
        it('detects missing resources', function() {
            delete myHandlers.entries;
            expect(checkResourceHandlers(schema, myHandlers).length).toEqual(1);
        });
        it('detects unexpected resources', function() {
            myHandlers.unexpected = function () {};
            expect(checkResourceHandlers(schema, myHandlers).length).toEqual(1);
        });
        it('detects invalid resource handlers', function() {
            myHandlers.entries = function (foo, bar, baz) {};
            expect(checkResourceHandlers(schema, myHandlers).length).toEqual(1);
        });
    });

    describe('getTypeDeep', function () {
        var getTypeDeep = schemaUtils.getTypeDeep;
        var schema = {
            topics: [{
                name: 'Example topic',
                entries: [new Ref('entries')],
            }],
            entries: [{
                text: 'Hello world',
            }],
        };
        it('returns types for refs in schema', function () {
            expect(getTypeDeep(schema, 'topics')).toEqual('collection');
            expect(getTypeDeep(schema, 'topics.123')).toEqual('object');
            expect(getTypeDeep(schema, 'topics.123.entries')).toEqual('collection');
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
        var schema = {
            topics: [{
                name: 'Example topic',
                entries: [new Ref('entries')],
            }],
            entries: [{
                text: 'Hello world',
            }],
        };
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
        var schema = {
            topics: [{
                name: 'Example topic',
                entries: [new Ref('entries')],
                stats: {
                    viewCount: 23,
                },
            }],
            entries: [{
                text: 'Hello world',
            }],
        };
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
