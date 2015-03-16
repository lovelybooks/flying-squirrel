/*jshint jasmine: true */
'use strict';

var createInterceptor = require('../createInterceptor');
var Ref = require('../Ref');


describe('createInterceptor', function () {

    var dataModelDef = {
        topics: [{
            id: 123,
            name: 'Example topic',
            entries: [new Ref('entries')],
            openingEntry: new Ref('entries'),
            participants: [new Ref('users')],
            creator: new Ref('users'),
        }],
        entries: [{
            id: 1,
            text: 'Sample entry from schema',
            author: new Ref('users'),
            topic: new Ref('topics'),
        }],
        users: [{
            id: 1,
            name: 'Winnie Pooh',
            avatar: {
                url: 'http://example.com/pooh.jpg',
            }
        }],
        config: {
            imagesUrl: 'http://example.com/images/',
        },
    };

    it ('should work with empty store', function () {
        var spy = jasmine.createSpy();
        var interceptor = createInterceptor(dataModelDef, {}, spy);
        expect(spy).not.toHaveBeenCalled();
        expect(interceptor.topics.get(199).name).toEqual('Example topic');
        expect(spy).toHaveBeenCalledWith('topics', jasmine.any(Object));
        expect(spy).toHaveBeenCalledWith('topics.199', jasmine.any(Object));
        expect(spy).toHaveBeenCalledWith('topics.199.name', jasmine.any(String));
        expect(spy.calls.count()).toBe(3);
    });

    it('should provide the callback with relevant Ref in schema', function () {
        var spy = jasmine.createSpy();
        var interceptor = createInterceptor(dataModelDef, {}, spy);
        interceptor.entries.get(123).author.name; // jshint ignore:line
        expect(spy).toHaveBeenCalledWith('entries.123.author', dataModelDef.entries[0].author);
        expect(spy).toHaveBeenCalledWith('entries.123.author', dataModelDef.users[0]);
        expect(spy).toHaveBeenCalledWith('entries.123.author.name', jasmine.any(String));
    });

    it('should provide the callback with relevant collection def', function () {
        var spy = jasmine.createSpy();
        var interceptor = createInterceptor(dataModelDef, {}, spy);
        interceptor.topics.getAll()[0].name; // jshint ignore:line
        expect(spy).toHaveBeenCalledWith('topics', dataModelDef.topics);
        expect(spy).toHaveBeenCalledWith('topics.*', dataModelDef.topics[0]);
        expect(spy).toHaveBeenCalledWith('topics.*.name', jasmine.any(String));
    });


    describe('with a pre-filled store', function () {

        var dataStoreExample = {
            topics: {
                '123': {
                    id: 123,
                    name: 'Example topic from Store',
                    entries: {
                        '0': 12,
                        '1': '15',
                    },
                },
            },
            entries: {
                '12': {
                    text: 'uuuu uuuu uuuuu uuuu uuuuuuuu uuuuuu uuu uuu!',
                    author: null,
                },
                '15': {
                    text: 'Sample entry from store',
                    author: 42,
                },
            },
            users: {
                '42': {
                    name: 'Frodo',
                },
            },
        };
        var pathSpy, interceptor;

        beforeEach(function() {
            pathSpy = jasmine.createSpy();
            interceptor = createInterceptor(dataModelDef, dataStoreExample, function (ref) {
                pathSpy(ref); // NOTE: we drop all the other arguments. They are tested in other tests.
            });
            expect(pathSpy).not.toHaveBeenCalled();
        });

        it('should handle stored data correctly', function () {
            expect(interceptor.topics.get(123).name).toEqual('Example topic from Store');
            expect(interceptor.entries.get(12).author).toBe(null);
            expect(pathSpy).not.toHaveBeenCalled();
        });

        it('should detect data we don\'t have yet (for primitives and objects)', function () {
            expect(interceptor.config.imagesUrl).toEqual('http://example.com/images/');
            expect(pathSpy).toHaveBeenCalledWith('config');
            expect(pathSpy).toHaveBeenCalledWith('config.imagesUrl');
        });

        it('should detect data we don\'t have yet (for collection items)', function () {
            expect(interceptor.topics.get(199)).not.toBeNull();
            expect(pathSpy).toHaveBeenCalledWith('topics.199');
        });

        it('should detect data we don\'t have yet (for references)', function () {
            expect(interceptor.topics.get(123).openingEntry.text).toEqual('Sample entry from schema');
            expect(pathSpy).not.toHaveBeenCalledWith('topics');
            expect(pathSpy).not.toHaveBeenCalledWith('topics.123');
            expect(pathSpy).toHaveBeenCalledWith('topics.123.openingEntry');
            expect(pathSpy).toHaveBeenCalledWith('topics.123.openingEntry.text');
        });

        it('should work the same for both fetched and non-fetched data', function () {
            expect(interceptor.topics.get(123).entries.get(1).text).toEqual('Sample entry from store');
            expect(pathSpy).not.toHaveBeenCalled();
            expect(interceptor.topics.get(199).entries.get(1).text).toEqual('Sample entry from schema');
            expect(pathSpy).toHaveBeenCalledWith('topics.199.entries.1.text');
        });

        it('has inconsistent API that should be refactored', function () {
            var s1 = interceptor.topics.get(123).entries.get(1).text;
            var s2 = dataStoreExample.entries[dataStoreExample.topics[123].entries[1]].text;
            expect(s1).toEqual(s2);
        });
    });
});
