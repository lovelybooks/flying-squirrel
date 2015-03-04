/*jshint jasmine: true */
'use strict';

var _ = require('lodash');
var Ref = require('../Ref');
var sU = require('../schemaUtils');

describe('schemaUtils', function () {

    describe('generateEndpointsList', function() {
        it('generates a list of endpoints for schema', function() {
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
            var endpointsList = sU.generateEndpointsList(schema);
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

    describe('getTypeDeep', function () {
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
            expect(sU.getTypeDeep(schema, 'topics')).toEqual('collection');
            expect(sU.getTypeDeep(schema, 'topics.123')).toEqual('object');
            expect(sU.getTypeDeep(schema, 'topics.123.entries')).toEqual('collection');
            expect(sU.getTypeDeep(schema, 'topics.123.entries.2')).toEqual('reference');
            expect(sU.getTypeDeep(schema, 'topics.123.entries.2.text')).toEqual('primitive');
        });
        it('throws error for invalid keys', function () {
            expect(function () {
                sU.getTypeDeep(schema, 'bork');
            }).toThrow();
            expect(function () {
                sU.getTypeDeep(schema, 'topics.bork.bork');
            }).toThrow();
        });
    });

    describe('filterRefs', function () {
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
            expect(sU.filterRefs(schema, ['topics.123', 'topics.123'])).toEqual(['topics.123']);
        });
        it('collapses nested refs', function () {
            expect(sU.filterRefs(schema, ['topics', 'topics.123'])).toEqual(['topics.123']);
        });
        it('strips primitive refs', function () {
            expect(sU.filterRefs(schema, ['topics.123', 'topics.123.name'])).toEqual(['topics.123']);
        });
    });
});
