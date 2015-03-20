/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var createInterceptor = require('./createInterceptor');
var schemaUtils = require('./schemaUtils');


var frontend = {

    generateApiProxy: function generateApiProxy(schema, dataSourceCallback, store) {

        console.assert(_.isObject(schema));
        console.assert(_.isFunction(dataSourceCallback));
        console.assert(_.isObject(store));

        var refsWeAlreadyFetched = {};

        return function IO(callback) {

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

                    var filteredNewRefs = schemaUtils.filterRefs(schema, newRefs);

                    _.each(filteredNewRefs, function(newRef) {
                        if (refsWeAlreadyFetched[newRef]) {
                            throw ('FlyingSquirrel internal error: ref ' + newRef +
                                ' was fetched, but it looks like it isn\'t present in the store');
                        }
                        refsWeAlreadyFetched[newRef] = true;
                    });

                    // Ah, the callback needs more data!
                    // console.log('Ah, the callback needs more data!', JSON.stringify(newRefs, null, 4));
                    // console.log('Filtered:', JSON.stringify(schemaUtils.filterRefs(schema, newRefs), null, 4));
                    if (callbackError) {
                        console.log('by the way... ', callbackError, callbackError.stack);
                    }
                    // we'll fetch the data and try again
                    return dataSourceCallback(filteredNewRefs).then(function (newStoreData) {
                        console.assert(_.isObject(newStoreData), 'got non-object from data source');

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

            // NOTE: the call to iterate is wrapped in a promise so that exceptions are not thrown
            // but the promise is rejected instead.
            return Promise.resolve().then(iterate);
        };
    },
};

module.exports = frontend;
