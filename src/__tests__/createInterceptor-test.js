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

    describe('with a pre-filled store', function () {

        var dataStoreExample = {
            topics: {
                '123': {
                    id: 123,
                    name: 'Example topic from Store',
                    entries: [
                        new Ref('entries.12'),
                        new Ref('entries.15'),
                    ],
                }
            },
            entries: {
                '12': {
                    text: 'uuuu uuuu uuuuu uuuu uuuuuuuu uuuuuu uuu uuu!',
                },
                '15': {
                    text: 'Sample entry from store',
                    author: new Ref('users.42'),
                },
            },
            users: {
                '42': {
                    name: 'Frodo',
                },
            },
        };
        var spy, interceptor;

        beforeEach(function() {
            spy = jasmine.createSpy();
            interceptor = createInterceptor(dataModelDef, dataStoreExample, spy);
            expect(spy).not.toHaveBeenCalled();
        });

        it('should handle stored data correctly', function () {
            expect(interceptor.topics.get(123).name).toEqual("Example topic from Store");
            expect(spy).not.toHaveBeenCalled();
        });

        it('should detect data we don\'t have yet (for primitives and objects)', function () {
            expect(interceptor.config.imagesUrl).toEqual('http://example.com/images/');
            expect(spy).toHaveBeenCalledWith('config', dataModelDef.config);
            expect(spy).toHaveBeenCalledWith('config.imagesUrl', jasmine.any(String));
        });

        it('should detect data we don\'t have yet (for collection items)', function () {
            expect(interceptor.topics.get(199)).not.toBeNull();
            expect(spy).toHaveBeenCalledWith('topics.199', dataModelDef.topics[0]);
        });

        it('should detect data we don\'t have yet (for references)', function () {
            expect(interceptor.topics.get(123).openingEntry.text).toEqual("Sample entry from schema");
            expect(spy).not.toHaveBeenCalledWith('topics', jasmine.any(Object));
            expect(spy).not.toHaveBeenCalledWith('topics.123', jasmine.any(Object));
            expect(spy).toHaveBeenCalledWith('topics.123.openingEntry', dataModelDef.entries[0]);
            expect(spy).toHaveBeenCalledWith('topics.123.openingEntry.text', jasmine.any(String));
        });

        it('should work the same for both fetched and non-fetched data', function () {
            expect(interceptor.topics.get(123).entries.get(1).text).toEqual("Sample entry from store");
            expect(spy).not.toHaveBeenCalled();
            expect(interceptor.topics.get(199).entries.get(1).text).toEqual("Sample entry from schema");
            expect(spy).toHaveBeenCalledWith('topics.199.entries.1.text', jasmine.any(String));
        });

        it('has inconsistent API that should be refactored', function () {
            var s1 = interceptor.topics.get(123).entries.get(1).text;
            var s2 = dataStoreExample.topics[123].entries[1].get(dataStoreExample).text;
            expect(s1).toEqual(s2);
        });
    });
});
