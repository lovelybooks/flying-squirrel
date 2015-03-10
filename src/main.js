'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('./Ref');
var backendUtils = require('./backend');
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
    var handlerInfo = this.resourceHandlersInfo[resource];
    console.assert(handlerInfo);
    console.assert(args.length === handlerInfo.inCollections.length);
    console.assert(args.length === (resource.match(/\{\}/g) || []).length);
    console.log('Fetching from ' + resource, args);
    var promiseOrResult = this.resourceHandlers[resource].apply(null, args);
    console.assert(promiseOrResult);
    return Promise.resolve(promiseOrResult).then(function (result) {
        _.each(schemaUtils.checkResourceResult(resource, handlerInfo, result), function(problem) {
            console.warn('FlyingSquirrel: ' + problem);
        });
        return result;
    });
};
Server.prototype.fetch = function fetch(ref) {
    var store = {};
    var fetchResource = this.fetchResource.bind(this);
    return backendUtils.fetchRef(this.schema, ref, fetchResource, store).then(function() {
        return store;
    });
};

function Client (schema, fetchRefsCallback) {}

var FlyingSquirrel = {
    Server: Server,
    Client: Client,
    Ref: Ref,
};

module.exports = FlyingSquirrel;
