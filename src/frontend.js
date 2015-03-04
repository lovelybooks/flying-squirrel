/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var createInterceptor = require('./createInterceptor');
var schemaUtils = require('./schemaUtils');

var frontend = {

    // This Backend collects references, sends requests to endpoints, and handles their responses.
    createHttpBackend: function createHttpBackend(schemaObj, httpGet) {
        console.assert(_.isFunction(httpGet));
        var backend = {
            get: function (refs) {
                var filteredRefs = schemaUtils.filterRefs(schemaObj, refs);
                return httpGet('/?refs=' + filteredRefs.join(',')).then(function (result) {
                    _.merge(backend.store, result);
                    return backend.store;
                });
            },
            store: {},
        };
        return backend;
    },

    generateApiProxy: function generateApiProxy(schema, dataSource) {

        var store = {};

        function IO(callback) {

            function iterate() {
                // console.log('iterate!');
                var newRefsPromises = [];
                var mock = createInterceptor(schema, store, function (ref, subSchema) {
                    var type = schemaUtils.determineType(subSchema);
                    if (_.endsWith(ref, '.*')) {
                        var oneUp = ref.substring(0, ref.length - 2);
                        newRefsPromises.push(dataSource.get(oneUp));
                    } else if (type === 'reference' || type === 'object') {
                        newRefsPromises.push(dataSource.get(ref));
                    }
                });
                var error;
                try {
                    callback(mock);
                } catch (e) {
                    error = e;
                }
                if (newRefsPromises.length) {
                    // Ah, the callback needs more data!
                    // console.log('Ah, the callback needs more data!');
                    if (error) {
                        console.log('by the way... ', error);
                    }
                    // we'll fetch the data and try again
                    return Promise.all(newRefsPromises).then(iterate);
                } else {
                    // No more data requests. We finish.
                    // console.log('No more data requests. We finish.');

                    if (error) {
                        throw error; // aww... we failed. Looks like a bug in the callback.
                    } else {
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
