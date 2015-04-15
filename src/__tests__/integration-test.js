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
        // TODO make them spies and assert they were called just once
        var resourceHandlers = jasmine.createSpyObj('resourceHandlers', [
            'topics.{}.openingEntry',
            'entries.{}.author',
            'users.{}',
        ]);

        resourceHandlers['topics.{}.openingEntry'].and.returnValue([789]);
        resourceHandlers['entries.{}.author'].and.returnValue([1337]);
        resourceHandlers['users.{}'].and.returnValue([{id:1337, name:'James Bond'}]);


        // Disabling console output for this test. (Comment it out if you're debugging this test.)
        spyOn(console, 'debug');
        spyOn(console, 'log');

        // Creating the server objec: We expect a lot of warnings about missing handlers.
        spyOn(console, 'warn');
        var server = new FlyingSquirrel.Server(schema, resourceHandlers);
        expect(console.warn.calls.count()).toBeGreaterThan(5);
        console.warn.and.callThrough();

        Promise.all([
            server.fetch('topics.123.openingEntry.author'),
            server.fetch('topics.123.openingEntry.author')
        ]).then(function (result) {
            expect(resourceHandlers['topics.{}.openingEntry'].calls.allArgs()).toEqual([[['123']]]);
            expect(resourceHandlers['entries.{}.author'].calls.allArgs()).toEqual([[['789']]]);
            expect(resourceHandlers['users.{}'].calls.allArgs()).toEqual([[['1337']]]);

            var store = result[0];
            expect(store.users[1337]).toEqual({id:1337, name:'James Bond'});
            done();
        }).catch(function(err) {
            fail(err);
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

        Promise.resolve().then(function () {

            // First, we test the real IO()
            return client.IO(function (data) {
                return {
                    names: _.map(data.topics.get(1070937897).entries.getAll(), function (entry) {
                        return entry.author.name;
                    }),
                };
            }).then(function (result) {
                expect(result.names).toEqual(['Nick03', 'emmah9']);
                expect(getRefsSpy.calls.count()).toBe(1);
            }).catch(fail);

        }).then(function () {

            // And now we'll test the mock!
            client.mockingEnabled = true;
            client.store = {
                topics: {
                    1: {name: 'omg mock'},
                },
            };

            getRefsSpy.calls.reset();

            return client.IO(function (data) {
                return {
                    autoMockedName: data.topics.get(123).name,
                    handMockedName: data.topics.get(1).name,
                };
            }).then(function (result) {
                expect(result.autoMockedName).toEqual('Example topic');
                expect(result.handMockedName).toEqual('omg mock');
                expect(getRefsSpy.calls.count()).toBe(0);
            }).catch(fail);

        }).then(done);
        
    });
});
