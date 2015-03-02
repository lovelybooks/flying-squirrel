/*jshint jasmine: true */
'use strict';

function Ref(ref) {
    this.ref = ref;
}

Ref.prototype.get = function(object) {
    var chain = this.ref.split('.');
    for (var i=0; i<chain.length; i++) {
        var key = chain[i];
        object = object[key];
        if (!object) {
            return undefined;
        }
    }
    return object;
};

// TODO: refactor: implement set using get(path[:-1])
Ref.prototype.set = function(object, value) {
    var chain = this.ref.split('.');
    var key;
    for (var i=0; i<chain.length-1; i++) {
        key = chain[i];
        object = object[key];
        if (!object) {
            throw this.ref + ' doesn\'t exist in ' + object;
        }
    }
    key = chain[chain.length - 1];
    object[key] = value;
};

module.exports = Ref;
