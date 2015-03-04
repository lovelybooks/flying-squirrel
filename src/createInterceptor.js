/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('./Ref');

function determineType(schemaObj) {
    if (_.isArray(schemaObj)) {
        return 'collection';
    } else if (schemaObj instanceof Ref) {
        return 'reference';
    } else if (_.isObject(schemaObj)) {
        console.assert(_.isPlainObject(schemaObj));
        return 'object';
    } else {
        console.assert(!_.isUndefined(schemaObj));
        return 'primitive';
    }
}

// A constructor for our objects (this name will show up in the debugger)
function Interceptor() {}

function createInterceptor(schemaObj, storeObj, newRefCallback) {
    console.assert(_.isObject(schemaObj));
    console.assert(_.isObject(storeObj));
    console.assert(_.isFunction(newRefCallback));

    function createSubInterceptorForReference(schemaSubObj, storeSubObj, path) {
        console.assert(schemaSubObj instanceof Ref);
        console.assert(!storeSubObj || storeSubObj instanceof Ref);
        return returnValueForGetter(
            schemaSubObj.get(schemaObj)[0], // UGLY
            storeSubObj ? storeSubObj.get(storeObj) : undefined,
            path
        );
    }

    function createSubInterceptorForCollection(schemaSubObj, storeSubObj, path) {
        console.assert(_.isArray(schemaSubObj));
        console.assert(schemaSubObj.length === 1);
        return {
            keys: function () {
                if (_.isObject(storeSubObj)) {
                    return _.keys(storeSubObj); // TODO: does it work as expected for arrays too?
                } else {
                    // NOTE: we don't call the newRefCallback. It will be called when this item
                    // will be accessed.
                    return ['*']; // hacky: the getter on this key should return item from schema
                }
            },
            getAll: function() {
                return _.map(this.keys(), this.get.bind(this));
            },
            get: function(id) {
                return returnValueForGetter(
                    schemaSubObj[0],
                    _.isObject(storeSubObj) ? storeSubObj[id] : undefined,
                    path + '.' + id
                );
            },
        };
    }

    function createSubInterceptorForObject(schemaSubObj, storeSubObj, path) {
        if (path) {
            path += '.';
        } else {
            path = ''; // Special case for the root path.
        }
        var subInterceptor = new Interceptor();
        _.each(_.keys(schemaSubObj), function (fieldName) {

            // For each field in subInterceptor, we define a getter that calls the newRefCallback
            // whenever we need to use data from schema (i.e. we don't have the data in the store).
            Object.defineProperty(subInterceptor, fieldName, {
                get: function () {
                    return returnValueForGetter(
                        schemaSubObj[fieldName],
                        storeSubObj && storeSubObj[fieldName],
                        path + fieldName
                    );
                },
            });
        });
        return subInterceptor;
    }

    function returnValueForGetter(valueFromSchema, valueFromStore, path) {
        // console.log(path, determineType(valueFromSchema));
        if (_.isUndefined(valueFromStore)) {
            // If we don't have a valueFromStore, we'll need to get it.
            newRefCallback(path, valueFromSchema);
        }

        if (valueFromSchema instanceof Ref) {
            return createSubInterceptorForReference(valueFromSchema, valueFromStore, path);
        } else if (_.isArray(valueFromSchema)) {
            return createSubInterceptorForCollection(valueFromSchema, valueFromStore, path);
        } else if (_.isObject(valueFromSchema)) {
            return createSubInterceptorForObject(valueFromSchema, valueFromStore, path);
        } else {
            return valueFromStore || valueFromSchema; // primitive value
        }
    }

    return createSubInterceptorForObject(schemaObj, storeObj, null);
}

module.exports = createInterceptor;
