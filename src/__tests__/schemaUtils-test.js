/*jshint jasmine: true */
'use strict';

var _ = require('lodash');
var Ref = require('../Ref');
var schemaUtils = require('../schemaUtils');

describe('schemaUtils', function () {

    describe('generateResourcesList', function() {
        it('generates a list of resources for schema', function() {
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
            var observedResourcesList = schemaUtils.generateResourcesList(schema);
            var expectedResourcesList = [
                {ref: 'topics',                 type: 'collection', inCollections: []},
                {ref: 'topics.{}',              type: 'object',     inCollections: ['topics']},
                {ref: 'topics.{}.entries',      type: 'collection', inCollections: ['topics']},
                {ref: 'topics.{}.openingEntry', type: 'reference',  inCollections: ['topics']},
                {ref: 'entries',                type: 'collection', inCollections: []},
                {ref: 'entries.{}',             type: 'object',     inCollections: ['entries']},
            ];
            // Checking results one-by-one (for more friendly error messages).
            _.each(expectedResourcesList, function (expectedResource) {
                var found = _.find(observedResourcesList, {ref: expectedResource.ref});
                expect(found).toEqual(expectedResource);
            });
            expect(observedResourcesList.length).toEqual(expectedResourcesList.length);
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
                'entries': function () {},
                'entries.{}': function () {},
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

    describe('filterRefs', function () {
        var filterRefs = schemaUtils.filterRefs;
        var schema = {
            topics: [{
                name: 'Example topic',
                entries: [new Ref('entries')],
            }],
            entries: [{
                text: 'Hello world',
            }],
        };
        it('filters out duplicate refs', function () {
            expect(filterRefs(schema, ['topics.123', 'topics.123'])).toEqual(['topics.123']);
        });
        it('collapses nested refs', function () {
            expect(filterRefs(schema, ['topics', 'topics.123'])).toEqual(['topics.123']);
        });
        it('strips primitive refs', function () {
            expect(filterRefs(schema, ['topics.123', 'topics.123.name'])).toEqual(['topics.123']);
        });
    });
});
