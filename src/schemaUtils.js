'use strict';

var _ = require('lodash');
var Ref = require('./Ref');

var schemaUtils = {
    generateEndpointsList: function generateEndpointsList(schema) {
        var endpointsList = [];

        function traverse(subSchema, prefix) {
            prefix = prefix || '';
            _.each(subSchema, function(value, key) {
                if (_.isArray(value)) {
                    endpointsList.push({path: prefix + key, type: 'collection'});
                    if (value[0] instanceof Ref) {
                        return; // No endpoints for individual references in collection
                    }
                    endpointsList.push({path: prefix + key + '/0', type: 'item'});
                } if (value instanceof Ref) {
                    endpointsList.push({path: prefix + key, type: 'item (ref)'});
                }
                if (_.isObject(value)) {
                    traverse(value, prefix + key + '/');
                }
            });
        }

        traverse(schema, '/');

        return endpointsList;
    },

    determineType: function determineType(schemaObj) {
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
    },

    descendInSchema: function descendInSchema(schema, subSchema, key) {
        var type = schemaUtils.determineType(subSchema);
        if (type === 'collection') {
            return subSchema[0]; // NOTE: we ignore the key.
        } else if (type === 'reference') {
            return schemaUtils.descendInSchema(schema, subSchema.get(schema)[0], key);
        } else if (type === 'object') {
            return subSchema[key];
        } else {
            throw 'descendInSchema: Cannot descend to "' + key + '" key in primitive value';
        }
    },

    getTypeDeep: function getTypeDeep(schema, ref) {
        var path = ref.split('.');
        var subSchema = schema;
        _.each(path, function(key) {
            subSchema = schemaUtils.descendInSchema(schema, subSchema, key);
            if (subSchema == null) {
                throw 'getTypeDeep: Invalid ref: ' + ref;
            }
        });
        return schemaUtils.determineType(subSchema);
    },

    filterRefs: function filterRefs(schema, refs) {
        console.assert(_.isArray(refs), 'filterRefs: ref array expected');
        var refsMap = {};
        _.each(refs, function (ref) {
            refsMap[ref] = true;
        });
        function refUp(ref) {
            return _.dropRight(ref.split('.')).join('.');
        }
        _.each(_.keys(refsMap), function (ref) {
            if (schemaUtils.getTypeDeep(schema, ref) === 'primitive') {
                delete refsMap[ref];
            } else {
                var up = refUp(ref);
                if (up in refsMap) {
                    delete refsMap[up];
                }
            }
        });
        return _.keys(refsMap);
    }
};

module.exports = schemaUtils;
