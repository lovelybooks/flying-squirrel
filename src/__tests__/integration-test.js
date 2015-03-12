/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var FlyingSquirrel = require('../main.js');

describe('FlyingSquirrel integration test (for main.js)', function () {
    var schema = {
        topics: [{
            id: 123,
            name: 'Example topic',
            entries: [new FlyingSquirrel.Ref('entries')],
            openingEntry: new FlyingSquirrel.Ref('entries'),
            participants: [new FlyingSquirrel.Ref('users')],
            creator: new FlyingSquirrel.Ref('users'),
        }],
        entries: [{
            id: 123,
            text: 'Hello world',
            author: new FlyingSquirrel.Ref('users'),
        }],
        users: [{
            id: 123,
            name: 'Winnie Pooh',
            avatar: {
                url: 'http://example.com/pooh.jpg',
            }
        }],
    };

    it('works for Server', function (done) {
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
                expect(topicIds).toEqual(['123']);
                return [789];
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
                expect(entryIds).toEqual(['789']);
                return [1337];
            },
            'users': function (criteria) {
                // collection of objects
                // Promise of [{id:1234}, {id:1321}, {id:1330}, ...]
            },
            'users.{}': function (userIds) {
                // object in collection
                // Promise of [{id:1337, name:'James Bond'}, ...]
                return [{id:1337, name:'James Bond'}];
            },
        };

        // Disabling console output for this test.
        spyOn(console, 'log');
        spyOn(console, 'warn');
        // TODO test console output, too!

        var server = new FlyingSquirrel.Server(schema, dbResourceHandlers);
        expect(console.warn).toHaveBeenCalled();
        server.fetch('topics.123.openingEntry.author').then(function (store) {
            expect(store.users[1337]).toEqual({id:1337, name:'James Bond'});
            done();
        });
    });

    it('works for Client', function (done) {


        // Disabling console output for this test.
        // spyOn(console, 'log');
        // spyOn(console, 'warn');
        // TODO test console output, too!
        var mockedResponse = {
            topics: {
                '1070937897': {
                    'entries': ['1070942045', '1088602332'],
                }
            },
            entries: {
                '1070942045': {author: 1070934875},
                '1088602332': {author: 1082193591},
            },
            users: {
                '1082193591': {id: 1082193591, name: 'emmah9'},
                '1070934875': {id: 1070934875, name: 'Nick03'},
            },
        };

        var getRefsSpy = jasmine.createSpy('getRefs').and.callFake(function(refs) {
            // console.log('fetchRefsCallback', JSON.stringify(refs, null, 4));
            expect(refs).toContain('topics.1070937897.entries.*.author');
            // TODO: expect(refs).toEqual(['topics.1070937897.entries.*.author']);
            return Promise.resolve(mockedResponse);
        });
        var client = new FlyingSquirrel.Client(schema, getRefsSpy);
        client.IO(function (data) {
            return {
                names: _.map(data.topics.get(1070937897).entries.getAll(), function (entry) {
                    return entry.author.name;
                }),
            };
        }).then(function (result) {
            expect(result.names).toEqual(['Nick03', 'emmah9']);
            expect(getRefsSpy.calls.count()).toBe(1);
            done();
        }).catch(function (err) {
            expect(false).toBe(true, err);
            done();
        });
    });
});
