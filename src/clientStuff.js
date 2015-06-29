/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var createInterceptor = require('./createInterceptor');
var schemaUtils = require('./schemaUtils');


var clientStuff = {

    // TODO: put newRefs and refsWeAlreadyFetched into the client object, so that
    // different calls on the same client cause just one request

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
                    callbackReturnValue = callback(interceptor); // Calling the given function.
                } catch (e) {
                    callbackError = e; // Error? Most likely we don't care.
                }

                if (newRefs.length) {
                    // Ah, the callback needs more data!
                    // Get new refs and add their data to store.

                    var filteredNewRefs = schemaUtils.filterRefs(schema, newRefs);

                    _.each(filteredNewRefs, function(newRef) {
                        if (refsWeAlreadyFetched[newRef]) {
                            throw ('FlyingSquirrel internal error: ref ' + newRef +
                                ' was fetched, but it looks like it isn\'t present in the store');
                        }
                        refsWeAlreadyFetched[newRef] = true;
                    });

                    if (callbackError) {
                        console.log('by the way... ', callbackError, callbackError.stack);
                    }

                    // We'll fetch the data and try again with the callback.
                    return dataSourceCallback(filteredNewRefs).then(function (newStoreData) {
                        if (_.isString(newStoreData)) {
                            throw newStoreData; // Looks like we got an error message.
                        }
                        console.assert(_.isObject(newStoreData), 'got non-object from data source');

                        // TODO: assert that newStoreData really contains the data we requested

                        _.merge(store, newStoreData);
                        return iterate();
                    });
                } else {
                    // No more data requests. We finish.

                    if (callbackError) { // Looks like a bug in the callback.
                        finished = 'rejected';
                        // NOTE: Exceptions from the callback are never thrown but the promise is rejected instead.
                        return Promise.reject(callbackError);
                    } else {
                        finished = 'resolved';
                        // This means returning synchronously, if it's the 1st iteration.
                        return callbackReturnValue;
                    }
                }
            }

            // NOTE: The result will be returned synchronously, if possible.
            return iterate();
        };
    },

    generateDynamicApiProxy: function generateDynamicApiProxy(schema, dataSourceCallback, store, onDataFetched) {

        console.assert(_.isObject(schema));
        console.assert(_.isFunction(dataSourceCallback));
        console.assert(_.isObject(store));
        console.assert(_.isFunction(onDataFetched));

        var refsEverRequested = {};

        var timeoutHandle;
        var waitingForData = false;

        var newRefs = [];
        var interceptor = createInterceptor(schema, store, function (ref) {
            if (refsEverRequested[ref]) {
                console.warn('FlyingSquirrel internal error: ref ' + ref +
                    ' was fetched, but it looks like it isn\'t present in the store');
                return; // Not fetching it again
            }
            // When waitingForData, the refs are ignored. The end users should request it again
            // (if it is still needed) after they receive that data.
            // TODO: maybe do some comparing of ref lists and filtering with filterRefs to optimize it.
            if (!waitingForData) {
                newRefs.push(ref);
                refsEverRequested[ref] = true;
                if (!timeoutHandle) {
                    timeoutHandle = setTimeout(handleNewRefs);
                }
            }
        });

        function handleNewRefs() {
            // Ah, the callback needs more data!
            // Get new refs and add their data to store.

            timeoutHandle = null;

            var caughtError = null;
            Promise.resolve().then(function () {
                var filteredNewRefs = schemaUtils.filterRefs(schema, newRefs);
                if (filteredNewRefs.length === 0) {
                    throw new Error('oh no, the list of refs is empty!');
                }

                // We'll fetch the data and try again with the callback.
                waitingForData = true;

                return dataSourceCallback(filteredNewRefs);
            }).then(function (newStoreData) {
                if (_.isString(newStoreData)) {
                    throw newStoreData; // Looks like we got an error message.
                }
                console.assert(_.isObject(newStoreData), 'got non-object from data source');

                // TODO: assert that newStoreData really contains the data we requested

                _.merge(store, newStoreData);
            }).catch(function (err) {
                // TODO: don't repeat the request for invalid refs

                caughtError = err;
                console.error('error in dynamic IO', err);

            }).then(function () {
                newRefs = [];
                waitingForData = false;

                onDataFetched(caughtError);
            });
        }

        return interceptor;
    }
};

module.exports = clientStuff;
