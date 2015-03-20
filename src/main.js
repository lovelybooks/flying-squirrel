'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('./Ref');
var backendUtils = require('./backend');
var frontendUtils = require('./frontend');
var schemaUtils = require('./schemaUtils');
var Batcher = require('./Batcher');


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
            var batched = backendUtils.batchArgs(arrayOfArgArrays, handlerInfo);
            return Promise.all(_.map(batched.arrayOfArgArrays, function (args) {
                console.log('Fetching from ' + resource, args);
                console.assert(args.length === handlerInfo.args.length,
                            'Invalid arg count for ' + resource + ': ' + JSON.stringify(args));
                console.log('calling ' + resource + ' with ' + JSON.stringify(args));

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
            return backendUtils.fetchRef(schema, ref, fetchResource, {});
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

    this.IO = function (callback) {
        var IO = frontendUtils.generateApiProxy(this.schema, this.batcher.get.bind(this.batcher), this.store);
        return IO(callback);
    }.bind(this);
}

var FlyingSquirrel = {
    Server: Server,
    Client: Client,
    Ref: Ref,
};

module.exports = FlyingSquirrel;
