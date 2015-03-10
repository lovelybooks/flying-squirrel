/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var createInterceptor = require('./createInterceptor');
var schemaUtils = require('./schemaUtils');

var frontend = {

    generateApiProxy: function generateApiProxy(schema, dataSource) {

        var store = {};

        function IO(callback) {

            function iterate() {
                var newRefs = [];
                var mock = createInterceptor(schema, store, function (ref) {
                    newRefs.push(ref);
                });
                var callbackError, callbackReturnValue;
                try {
                    callbackReturnValue = callback(mock);
                } catch (e) {
                    callbackError = e;
                }
                if (newRefs.length) {
                    // Ah, the callback needs more data!
                    // console.log('Ah, the callback needs more data!', JSON.stringify(newRefs, null, 4));
                    // console.log('Filtered:', JSON.stringify(schemaUtils.filterRefs(schema, newRefs), null, 4));
                    if (callbackError) {
                        console.log('by the way... ', callbackError);
                    }
                    // we'll fetch the data and try again
                    return dataSource.get(schemaUtils.filterRefs(schema, newRefs)).then(function (newStoreData) {
                        console.assert(_.isObject(newStoreData));
                        // TODO: assert that the new store really contains the data we requested
                        _.merge(store, newStoreData);
                        return iterate();
                    });
                } else {
                    // No more data requests. We finish.
                    // console.log('No more data requests. We finish.');

                    if (callbackError) {
                        throw callbackError; // aww... we failed. Looks like a bug in the callback.
                    } else {
                        return callbackReturnValue;
                        // TODO var cleanData = {}; // just data, no mocks
                        // TODO return callback(cleanData);
                    }
                }
            }

            return iterate();
        }

        return {
            IO: IO,
            __store: store,
        };
    },
};

module.exports = frontend;
