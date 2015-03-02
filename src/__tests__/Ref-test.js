/*jshint jasmine: true */
'use strict';

var Ref = require('../Ref');

describe('Ref', function () {
    describe('get(obj)', function () {
        it('should get shallow references', function() {
            expect(new Ref('a').get({a:1})).toBe(1);
        });
        it('should get deep references', function() {
            expect(new Ref('a.b.c').get({a:{b:{c:1}}})).toBe(1);
        });
        it('should not throw excepions for non-existent properties', function() {
            expect(new Ref('a.b.c').get({})).toBeUndefined();
        });
    });
    describe('set(obj, value)', function () {
        it('should set shallow references', function() {
            var obj = {a:1};
            var ref = new Ref('a');
            ref.set(obj, 'bork');
            expect(ref.get(obj)).toEqual('bork');
        });
        it('should set deep references', function() {
            var obj = {a:{b:{c:1}}};
            var ref = new Ref('a.b.c');
            ref.set(obj, 'bork');
            expect(ref.get(obj)).toEqual('bork');
        });
        it('should fail if the parent property doesn\'t exist', function() {
            expect(function() {
                var obj = {};
                var ref = new Ref('a.b.c');
                ref.set(obj, 'bork');
            }).toThrow();
        });
    });
});
