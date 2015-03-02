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
        expect(spy).toHaveBeenCalledWith('topics');
        expect(spy).toHaveBeenCalledWith('topics.199');
        expect(spy).toHaveBeenCalledWith('topics.199.name');
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

        it('should detect data we don\'t have yet (for simple accessor)', function () {
            expect(interceptor.config.imagesUrl).toEqual('http://example.com/images/');
            expect(spy).toHaveBeenCalledWith('config');
            expect(spy).toHaveBeenCalledWith('config.imagesUrl');
        });

        it('should detect data we don\'t have yet (for collection item)', function () {
            expect(interceptor.topics.get(199)).not.toBeNull();
            expect(spy).toHaveBeenCalledWith('topics.199');
        });

        it('should detect data we don\'t have yet (for deeply-nested object)', function () {
            expect(interceptor.topics.get(123).openingEntry.text).toEqual("Sample entry from schema");
            expect(spy).not.toHaveBeenCalledWith('topics');
            expect(spy).not.toHaveBeenCalledWith('topics.123');
            expect(spy).toHaveBeenCalledWith('topics.123.openingEntry');
            expect(spy).toHaveBeenCalledWith('topics.123.openingEntry.text');
        });

        it('should work the same for both fetched and non-fetched data', function () {
            expect(interceptor.topics.get(123).entries.get(1).text).toEqual("Sample entry from store");
            expect(spy).not.toHaveBeenCalled();
            expect(interceptor.topics.get(199).entries.get(1).text).toEqual("Sample entry from schema");
            expect(spy).toHaveBeenCalledWith('topics.199.entries.1.text');
        });

        it('has inconsistent API that should be refactored', function () {
            var s1 = interceptor.topics.get(123).entries.get(1).text;
            var s2 = dataStoreExample.topics[123].entries[1].get(dataStoreExample).text;
            expect(s1).toEqual(s2);
        });
    });
});
