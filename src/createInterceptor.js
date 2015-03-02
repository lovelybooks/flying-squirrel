/*jshint jasmine: true */
'use strict';

require('es6-promise').polyfill();
var _ = require('lodash');

var Ref = require('./Ref');


function createInterceptor(schemaObj, storeObj, newRefCallback) {

    console.assert(_.isObject(schemaObj));
    console.assert(_.isObject(storeObj));
    console.assert(_.isFunction(newRefCallback));

    // A constructor for our objects (this name will show up in the debugger)
    function Interceptor2() {}

    function createSubInterceptorForReference(schemaSubObj, storeSubObj, path) {
        console.assert(schemaSubObj instanceof Ref);
        schemaSubObj = schemaSubObj.get(schemaObj)[0]; // UGLY
        if (storeSubObj instanceof Ref) {
            storeSubObj = storeSubObj.get(storeObj);
        } else {
            console.assert(_.isUndefined(storeSubObj));
        }
        if (_.isUndefined(storeSubObj)) {
            newRefCallback(path);
        }
        return createSubInterceptor(schemaSubObj, storeSubObj, path);
    }

    function createSubInterceptorForCollection(schemaSubObj, storeSubObj, path) {
        console.assert(_.isArray(schemaSubObj));
        console.assert(schemaSubObj.length === 1);
        return {
            keys: function () {
                if (_.isArray(storeSubObj)) {
                    return _.keys(storeSubObj); // TODO: does it work as expected?
                } else {
                    return ['*']; // hacky: the getter on this key should return item from schema
                }
            },
            getAll: function() {
                return _.map(this.keys(), this.get.bind(this));
            },
            get: function(id) {
                var itemPath = path + '.' + id;

                var itemFromStore;
                if (_.isObject(storeSubObj)) {
                    // This can be an array or an ordinary key-value object. Both are fine.
                    itemFromStore = storeSubObj[id];
                } else {
                    // we don't allow types other than PartialCollection and array
                    console.assert(_.isUndefined(storeSubObj), storeSubObj);
                }

                var itemFromSchema = schemaSubObj[0];
                if (itemFromSchema instanceof Ref) {
                    return createSubInterceptorForReference(itemFromSchema, itemFromStore, itemPath);
                }

                if (_.isUndefined(itemFromStore)) {
                    // NOTE: itemFromStore might be undefined regardless which
                    // execution path was chosen above.
                    newRefCallback(itemPath);
                }

                // TODO: createSubInterceptor only if they are objects
                return createSubInterceptor(itemFromSchema, itemFromStore, itemPath);
            },
        };
    }

    function returnValueForGetter(valueFromSchema, valueFromStore, fieldPath) {
        if (_.isUndefined(valueFromStore)) {
            // If we don't have a valueFromStore, we'll need to get it.
            newRefCallback(fieldPath);
        } else if (!_.isObject(valueFromStore)) {
            // For primitive we return the valueFromStore...
            return valueFromStore;
            // ...but if it's an object, we'll dive deeper (see below).
        }

        if (valueFromSchema instanceof Ref) {
            return createSubInterceptorForReference(valueFromSchema, valueFromStore, fieldPath);
        } else if (_.isArray(valueFromSchema)) {
            return createSubInterceptorForCollection(valueFromSchema, valueFromStore, fieldPath);
        } else if (_.isObject(valueFromSchema)) {
            return createSubInterceptor(valueFromSchema, valueFromStore, fieldPath);
        } else {
            return valueFromSchema;
        }
    }

    function createSubInterceptor(schemaSubObj, storeSubObj, path) {
        if (path) {
            path += '.';
        } else {
            path = '';
        }
        // console.log(path + '{schema} has ' + _.keys(schemaSubObj).join(', ') + '');
        // console.log(path + '{store}  has ' + _.keys(storeSubObj).join(', ') + '');
        var subInterceptor = new Interceptor2();
        var fieldNames = _.union(_.keys(schemaSubObj), _.keys(storeSubObj));
        _.each(fieldNames, function (fieldName) {

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
    return createSubInterceptor(schemaObj, storeObj, null);
}

module.exports = createInterceptor;
