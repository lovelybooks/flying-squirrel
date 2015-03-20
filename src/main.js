'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('./Ref');
var backendUtils = require('./backend');
var frontendUtils = require('./frontend');
var schemaUtils = require('./schemaUtils');


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

    this.prepareBatcherForResource = function prepareBatcherForResource(resource) {
        console.assert(_.isString(resource), 'Resource should be a string');

        var handler = this.resourceHandlers[resource];
        var handlerInfo = this.resourceHandlersInfo[resource];
        console.assert(handlerInfo, 'Invalid handler ' + resource);
        console.assert(_.isFunction(handler), 'Handler for ' + resource + ' not found');

        var batchCallback = function (arrayOfArgArrays) {
            var batched = backendUtils.batchArgs(arrayOfArgArrays, handlerInfo);
            return Promise.all(_.map(batched.arrayOfArgArrays, function (args) {
                console.log('Fetching from ' + resource, args);
                console.assert(args.length === handlerInfo.args.length,
                            'Invalid arg count for ' + resource + ': ' + JSON.stringify(args));
                console.log('calling ' + resource + ' with ' + JSON.stringify(args));
                return handler.apply(null, args);
            })).then(function(handlerResult) {

                _.each(arrayOfArgArrays, function(args, i) {
                    var result = handlerResult[i];
                    var problems = schemaUtils.checkResourceResult(resource, handlerInfo, args, result);
                    _.each(problems, function(problem) {
                        console.error('FlyingSquirrel: Problem with resource ' + resource + ': ' + problem);
                    });
                });

                return {
                    handlerResult: handlerResult,
                    batchMapping: batched.mapping,
                };
            });
        };
        this.resourceBatchers[resource] = new frontendUtils.PromiseBatcher(batchCallback);
    }.bind(this);

    this.fetchResource = function fetchResource(resource, args) {
        console.assert(_.isArray(args), 'Args should be an array');

        if (!_.has(this.resourceBatchers, resource)) {
            this.prepareBatcherForResource(resource);
        }
        var batcher = this.resourceBatchers[resource];
        console.assert(_.isObject(batcher));

        var argsKey = JSON.stringify(args);
        return batcher.get(args).then(function (batch) {
            // Getting my response from the batch
            return batch.handlerResult[batch.batchMapping[argsKey]];
        }).then(function (result) {
            var handlerInfo = this.resourceHandlersInfo[resource];
            var problems = schemaUtils.checkResourceResult(resource, handlerInfo, args, result);
            if (problems.length > 0) {
                throw new Error('Problem with batch for ' + resource + ': ' + problems);
            }
            return result;
        }.bind(this));
    }.bind(this);

    this.fetch = function fetch(ref) {
        var fetchResource = this.fetchResource.bind(this);
        var schema = this.schema;

        // We use Promise.resolve().then(...) so that exceptions from fetchRef will reject the Promise.
        return Promise.resolve().then(function () {
            return backendUtils.fetchRef(schema, ref, fetchResource, {});
        });
    }.bind(this);
}


function Client (schema, fetchRefsCallback) {
    this.schema = schema;
    this.fetchRefsCallback = fetchRefsCallback;
    this.store = {};
    this.batcher = new frontendUtils.PromiseBatcher(function (arrayOfArraysOfRefs) {
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
