'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('./Ref');
var createInterceptor = require('./createInterceptor');
var serverStuff = require('./serverStuff');
var clientStuff = require('./clientStuff');
var schemaUtils = require('./schemaUtils');
var Batcher = require('./Batcher');


// TODO: move batching logic to serverStuff.js or some other file, **and unit-test it**.

function Server (schema, resourceHandlers) {
    console.assert(_.isObject(schema), 'schema should be an object');
    console.assert(_.isObject(resourceHandlers), 'resourceHandlers should be an object');

    _.each(schemaUtils.checkResourceHandlers(schema, resourceHandlers), function(problem) {
        console.warn('FlyingSquirrel: ' + problem);
    });
    var resourceHandlersInfo = schemaUtils.getResourcesInfo(schema);

    this.schema = schema;
    this.resourceHandlers = resourceHandlers;
    this.resourceHandlersInfo = resourceHandlersInfo;
    this.resourceBatchers = {};

    var that = this;

    that.fetchResourceDirectly = function fetchResourceDirectly(resource, args) {
        var handler = that.resourceHandlers[resource];
        var handlerInfo = that.resourceHandlersInfo[resource];
        console.assert(_.isFunction(handler), 'Handler for ' + resource + ' not found');

        return Promise.resolve().then(function () {
            // NOTE: Call to handler is wrapped in .then(...) because:
            // 1. any exception from the handler will reject the promise,
            // 2. the handler can return the result not wrapped in a Promise - it's ok too.
            return handler.apply(null, args);
        }).then(function (result) {
            // Validating the result received from handler.
            var problems = schemaUtils.checkResourceResult(resource, handlerInfo, args, result);
            if (problems.length > 0) {
                console.error('Problems with resource ' + resource + ': ' + problems.join(', '));
            }
            return result;
        });
    };

    that.prepareBatcherForResource = function prepareBatcherForResource(resource) {
        console.assert(_.isString(resource), 'Resource should be a string');

        var handlerInfo = that.resourceHandlersInfo[resource];
        console.assert(handlerInfo, 'Invalid handler ' + resource);

        var batchCallback = function (arrayOfArgArrays) {
            var batched = serverStuff.batchArgs(arrayOfArgArrays, handlerInfo);
            return Promise.all(_.map(batched.arrayOfArgArrays, function (args) {
                // console.log('Fetching from ' + resource + ', args: ' + JSON.stringify(args));
                console.assert(args.length === handlerInfo.args.length,
                            'Invalid arg count for ' + resource + ': ' + JSON.stringify(args));

                // Finally! calling the handler.
                return that.fetchResourceDirectly(resource, args);
            })).then(function(handlerResults) {
                return {
                    handlerResults: handlerResults,
                    getIndividualResult: batched.getIndividualResult,
                };
            });
        };

        var postprocessCallback = function postprocessCallback(args, batch) {
            var result = batch.getIndividualResult(batch.handlerResults, args);

            // result = _.map(args[0], function(id) {
            //     var index = _.find(result, {id: id});
            // });

            var problems = schemaUtils.checkResourceResult(resource, handlerInfo, args, result);
            if (problems.length > 0) {
                console.error('Problems with batch for ' + resource + ': ' + problems.join(', '));
            }

            return result;
        };

        that.resourceBatchers[resource] = new Batcher(batchCallback, postprocessCallback);
    };

    that.fetchResource = function fetchResource(resource, args) {
        console.assert(_.isFunction(resourceHandlers[resource]), 'Handler not found: ' + resource);
        console.assert(_.isArray(args), 'Args should be an array');

        if (!_.has(that.resourceBatchers, resource)) {
            that.prepareBatcherForResource(resource);
        }
        var batcher = that.resourceBatchers[resource];
        console.assert(_.isObject(batcher));

        return batcher.get(args);
    };

    that.fetch = function fetch(ref) {
        var fetchResource = that.fetchResource;
        var schema = that.schema;

        // We use Promise.resolve().then(...) so that exceptions from fetchRef will reject the Promise.
        return Promise.resolve().then(function () {
            return serverStuff.fetchRef(schema, ref, fetchResource, {}).catch(function (err) {
                console.error('Error in Squirrel.Server.fetch: ' + err);
                throw err;
            });
        });
    };

    that.fetchMany = function fetchMany(refs) {
        var mergedResults = {};

        return Promise.all(
            _.map(refs, function (ref) {
                return that.fetch(ref).then(function(result) {
                    _.merge(mergedResults, result);
                });
            })
        ).then(function () {
            return mergedResults;
        });
    };
}


function Client (schema, fetchRefsCallback) {
    this.schema = schema;
    this.fetchRefsCallback = fetchRefsCallback;
    this.store = {};
    this.batcher = new Batcher(function (arrayOfArraysOfRefs) {
        console.assert(_.isArray(arrayOfArraysOfRefs[0]));
        return fetchRefsCallback(schemaUtils.filterRefs(this.schema, _.flatten(arrayOfArraysOfRefs)));
    }.bind(this));

    // configure({
    //     schema: {},
    //     fetchRefsCallback: function (refs) {}, // before update
    //     afterUpdateCallback: function () {},
    //     useMockInsteadOfFetching: false,
    //     synchronuousResultWhenPossible: true,
    // })
    // TODO: enableMocking(store)
    // TODO: disableMocking()
    // TODO: setStore(store)
    // TODO: schemaUtils.checkStoreIntegrity(store)

    // TODO: getPendingIOs()
    // TODO: make IO return result or promise, and IOPromise to always return a promise.
    // TODO: alternatively, have IO that returns a promise and IOSync that always returns a result (possibly containing mock data)

    this.IO = function (callback) {
        if (this.mockingEnabled) {
            return callback(createInterceptor(this.schema, this.store, _.noop));
        } else {
            var dataSourceCallback = this.batcher.get.bind(this.batcher);
            var IO = clientStuff.generateApiProxy(this.schema, dataSourceCallback, this.store);
            return IO(callback);
        }
    }.bind(this);

    this.getDataForDynamicIO = function (onDataRequested, onDataFetched) {
        var client = this;
        var dataSourceCallback = function (refs) {
            onDataRequested(refs);
            return client.batcher.get(refs);
        };
        return clientStuff.generateDynamicApiProxy(this.schema, dataSourceCallback, this.store, onDataFetched);
    };

    this.getDataForMockedIO = function () {
        var neverResolvedPromise = new Promise(_.noop);
        return clientStuff.generateDynamicApiProxy(this.schema, _.constant(neverResolvedPromise), this.store, _.noop);
    };
}

var FlyingSquirrel = {
    Server: Server,
    Client: Client,
    Ref: Ref,
};

module.exports = FlyingSquirrel;
