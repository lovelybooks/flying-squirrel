/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var createInterceptor = require('./createInterceptor');
var schemaUtils = require('./schemaUtils');


var clientStuff = {

    // TODO: put newRefs and refsWeAlreadyFetched into the client object, so that
    // different calls on the same client cause just one request

    // TODO: implement additional syncMode arg (or...?)
    generateApiProxy: function generateApiProxy(schema, dataSourceCallback, store) {

        console.assert(_.isObject(schema));
        console.assert(_.isFunction(dataSourceCallback));
        console.assert(_.isObject(store));

        var refsWeAlreadyFetched = {};
        var finished = false; // will be resolved or rejected

        return function IO(callback) {

            function iterate() {
                var newRefs = [];
                var interceptor = createInterceptor(schema, store, function (ref) {
                    if (finished) {
                        throw new Error('Attempted to access ' + ref + ' in an Interceptor after the IO() promise was ' + finished);
                    }
                    newRefs.push(ref);
                });
                var callbackError, callbackReturnValue;
                try {
                    callbackReturnValue = callback(interceptor);
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
                    if (callbackError) {
                        console.log('by the way... ', callbackError, callbackError.stack);
                    }
                    // we'll fetch the data and try again
                    return dataSourceCallback(filteredNewRefs).then(function (newStoreData) {
                        if (_.isString(newStoreData)) {
                            throw newStoreData; // Looks like we got an error message.
                        }
                        console.assert(_.isObject(newStoreData), 'got non-object from data source');

                        // TODO: assert that the new store really contains the data we requested

                        _.merge(store, newStoreData);
                        return iterate();
                    });
                } else {
                    // No more data requests. We finish.

                    if (callbackError) {
                        finished = 'rejected';
                        throw callbackError; // aww... we failed. Looks like a bug in the callback.
                    } else {
                        finished = 'resolved';
                        return callbackReturnValue;
                    }
                }
            }

            // NOTE: the call to iterate is wrapped in a promise so that exceptions are not thrown
            // but the promise is rejected instead.
            return Promise.resolve().then(iterate);
        };
    },
};

module.exports = clientStuff;
