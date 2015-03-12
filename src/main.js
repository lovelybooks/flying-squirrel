'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('./Ref');
var backendUtils = require('./backend');
var frontendUtils = require('./frontend');
var schemaUtils = require('./schemaUtils');


function Server (schema, resourceHandlers) {
    _.each(schemaUtils.checkResourceHandlers(schema, resourceHandlers), function(problem) {
        console.warn('FlyingSquirrel: ' + problem);
    });
    var resourceHandlersInfo = schemaUtils.getResourcesInfo(schema);

    this.schema = schema;
    this.resourceHandlers = resourceHandlers;
    this.resourceHandlersInfo = resourceHandlersInfo;
}
Server.prototype.fetchResource = function fetchResource(resource, args) {
    var handler = this.resourceHandlers[resource];
    var handlerInfo = this.resourceHandlersInfo[resource];
    return Promise.resolve().then(function () {
        console.assert(_.isFunction(handler), 'Handler for ' + resource + ' not found');
        console.assert(handlerInfo);
        console.assert(args.length === handlerInfo.inCollections.length);
        console.assert(args.length === (resource.match(/\{\}/g) || []).length);
        console.log('Fetching from ' + resource + ' ' +
                _.map(args, function(arg) { return JSON.stringify(arg); }).join(', '));
        var promiseOrResult = handler.apply(null, args);
        console.assert(promiseOrResult);
        return promiseOrResult;
    }).then(function (result) {
        _.each(schemaUtils.checkResourceResult(resource, handlerInfo, args, result), function(problem) {
            console.error('FlyingSquirrel: Problem with resource ' + resource + ': ' + problem);
        });
        return result;
    });
};
Server.prototype.fetch = function fetch(ref) {
    var fetchResource = this.fetchResource.bind(this);
    var schema = this.schema;

    // We use Promise.resolve().then(...) so that exceptions from fetchRef will reject the Promise.
    return Promise.resolve().then(function () {
        return backendUtils.fetchRef(schema, ref, fetchResource, {});
    });
};

function Client (schema, fetchRefsCallback) {
    this.schema = schema;
    this.fetchRefsCallback = fetchRefsCallback;
}
Client.prototype.IO = function (callback) {
    var API = frontendUtils.generateApiProxy(this.schema, {get: this.fetchRefsCallback});
    return Promise.resolve().then(function () {
        return API.IO(callback);
    });
};

var FlyingSquirrel = {
    Server: Server,
    Client: Client,
    Ref: Ref,
};

module.exports = FlyingSquirrel;
