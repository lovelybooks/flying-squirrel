/*jshint jasmine: true */
'use strict';

var _ = require('lodash');

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
                        __keys: ['12', '15'],
                    },
                },
                '124': {
                    id: 124,
                    name: 'another one, from Store',
                    entries: {
                        __keys: ['12', '15', '17'],
                    },
                },
            },
            entries: {
                __keys: ['12', '15', '17'],
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
            pathSpy = jasmine.createSpy('getRef(path)');
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

        it('should detect data we don\'t have yet (for collections)', function () {
            expect(interceptor.topics.get(199).entries.getAll()).not.toBeNull();
            expect(pathSpy).toHaveBeenCalledWith('topics.199.entries.*');
        });

        it('should detect data we don\'t have yet (for partly-fetched collections)', function () {
            expect(interceptor.topics.getAll()).not.toBeNull();
            expect(pathSpy).toHaveBeenCalledWith('topics.*');
        });

        it('should detect data we don\'t have yet (for objects in partly-fetched collections)', function () {
            var allEntries = interceptor.entries.getAll();
            expect(allEntries).not.toBeNull();
            expect(_.map(allEntries, function(entry) {
                return entry.author && entry.author.name;
            })).toEqual([null, 'Frodo', 'Winnie Pooh']);
            expect(pathSpy).toHaveBeenCalledWith('entries.17'); // this is the only entry missing
            expect(pathSpy).toHaveBeenCalledWith('entries.17.author');
            expect(pathSpy).not.toHaveBeenCalledWith('entries.12.author');
            expect(pathSpy).not.toHaveBeenCalledWith('entries.15');
            expect(pathSpy).not.toHaveBeenCalledWith('entries.*');
        });

        it('should detect data we don\'t have yet (for collection items)', function () {
            expect(interceptor.topics.get(199)).not.toBeNull();
            expect(pathSpy).toHaveBeenCalledWith('topics.199');
            expect(pathSpy).not.toHaveBeenCalledWith('topics.*');
        });

        it('should detect data we don\'t have yet (for references)', function () {
            expect(interceptor.topics.get(123).openingEntry.text).toEqual('Sample entry from schema');
            expect(pathSpy).not.toHaveBeenCalledWith('topics');
            expect(pathSpy).not.toHaveBeenCalledWith('topics.123');
            expect(pathSpy).toHaveBeenCalledWith('topics.123.openingEntry');
            expect(pathSpy).toHaveBeenCalledWith('topics.123.openingEntry.text');
        });

        it('should handle collections of references correctly', function () {
            expect(interceptor.topics.get(199).entries.getAll()).not.toBeNull();
            expect(pathSpy).toHaveBeenCalledWith('topics.199.entries.*');
            expect(pathSpy).not.toHaveBeenCalledWith('entries.*');
            pathSpy.calls.reset();
            expect(interceptor.topics.get(199).entries.get(567)).not.toBeNull();
            // Note that the library will not even check if topics.199.entries.567 exists. (TODO: maybe do something about it)
            expect(pathSpy).not.toHaveBeenCalledWith('topics.199.entries.567');
            expect(pathSpy).toHaveBeenCalledWith('entries.567');
            pathSpy.calls.reset();
            expect(_.map(interceptor.topics.get(199).entries.getAll(), 'author')).not.toBeNull();
            expect(pathSpy).toHaveBeenCalledWith('topics.199.entries.*.author');
            expect(pathSpy).not.toHaveBeenCalledWith('entries.*.author');
        });

        it('should work the same for both fetched and non-fetched data', function () {
            expect(interceptor.topics.get(123).entries.get(15).text).toEqual('Sample entry from store');
            expect(pathSpy).not.toHaveBeenCalled();
            expect(interceptor.topics.get(199).entries.get(19).text).toEqual('Sample entry from schema');
            expect(pathSpy).toHaveBeenCalledWith('entries.19.text');
        });

        it('should know that references use the same key as the objects in referenced collection', function () {
            expect(interceptor.topics.get(199).entries.get(15).text).toEqual(interceptor.entries.get(15).text);
        });

        it('should maintain the references when iterating or indexing', function () {
            var allEntriesFromTopic = interceptor.topics.get(124).entries.getAll();
            expect(allEntriesFromTopic[2].author.name).toEqual('Winnie Pooh');
            expect(pathSpy).not.toHaveBeenCalledWith('topics.124.entries');
            expect(pathSpy).not.toHaveBeenCalledWith('topics.124.entries.2.author');
            expect(pathSpy).not.toHaveBeenCalledWith('topics.124.entries.17.author');
            expect(pathSpy).not.toHaveBeenCalledWith('entries.2.author');
            expect(pathSpy).toHaveBeenCalledWith('entries.17.author');
        });

        it('has inconsistent API that should be refactored', function () {
            expect(
                interceptor.topics.get(123).entries.getAll()[1].text
            ).toEqual(
                dataStoreExample.entries[dataStoreExample.topics[123].entries.__keys[1]].text
            );
        });
    });
});
