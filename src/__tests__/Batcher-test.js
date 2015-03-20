/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Batcher = require('../Batcher');

describe('Batcher', function () {

    it('should resolve the promise when it receives a response', function (done) {
        var callback = function (requests) {
            expect(requests).toEqual([123]);
            return Promise.resolve({hello: 'world'});
        };
        var batcher = new Batcher(callback);
        batcher.get(123).then(function (response) {
            expect(response).toEqual({hello: 'world'});
            done();
        }).catch(console.error);
    });

    it('should group requests and resolve each promise with the same result', function (done) {
        var callbackSpy = jasmine.createSpy('batchCallback')
                .and.returnValue(Promise.resolve('some result'));
        var batcher = new Batcher(callbackSpy);
        Promise.all([
            batcher.get(1),
            batcher.get(2),
            batcher.get('aaa'),
        ]).then(function (results) {
            _.each(results, function (result) {
                expect(result).toEqual('some result');
            });
            expect(callbackSpy.calls.count()).toBe(1);
            expect(callbackSpy).toHaveBeenCalledWith([1, 2, 'aaa']);
            done();
        }).catch(console.error);
    });

    it('should run postprocessCallback on the result, if specified', function (done) {
        var callbackSpy = jasmine.createSpy('batchCallback').and.callFake(function (requests) {
            var allRequestedIds = _.unique(_.flatten(requests));
            return Promise.resolve(_.map(allRequestedIds, function (id) {
                return {id: id};
            }));
        });
        var postprocessSpy = jasmine.createSpy('postprocessCallback').and.callFake(function(request, batchResult) {
            return _.map(request, function(id) {
                return _.find(batchResult, {id: id});
            });
        });
        var batcher = new Batcher(callbackSpy, postprocessSpy);
        Promise.all([
            batcher.get([1, 2]).then(function (result) {
                expect(result).toEqual([{id: 1}, {id: 2}]);
            }),
            batcher.get([1, 3]).then(function (result) {
                expect(result).toEqual([{id: 1}, {id: 3}]);
            }),
        ]).then(function () {
            expect(callbackSpy).toHaveBeenCalledWith([[1, 2], [1, 3]]);
            expect(postprocessSpy).toHaveBeenCalledWith([1, 2], [{id: 1}, {id: 2}, {id: 3}]);
            expect(postprocessSpy).toHaveBeenCalledWith([1, 3], [{id: 1}, {id: 2}, {id: 3}]);
            done();
        }).catch(console.error);
    });
});
