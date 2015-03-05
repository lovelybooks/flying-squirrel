'use strict';

var _ = require('lodash');
var Ref = require('./Ref');

var schemaUtils = {

    generateResourcesList: function generateResourcesList(schema) {
        var resourcesList = [];

        function copyAndAppend(array, element) {
            var newArray = _.clone(array);
            newArray.push(element);
            return newArray;
        }

        function traverse(subSchema, path, inCollections) {
            switch (schemaUtils.determineType(subSchema)) {
                case 'collection':
                    resourcesList.push({
                        ref: path.join('.'),
                        type: 'collection',
                        inCollections: inCollections,
                    });
                    if (!(subSchema[0] instanceof Ref)) {
                        // We provide endpoints for objects (but not refs) inside the collection.
                        traverse(
                            subSchema[0],
                            copyAndAppend(path, '{}'),
                            copyAndAppend(inCollections, _.last(path))
                        );
                    }
                    return;
                case 'reference':
                    resourcesList.push({
                        ref: path.join('.'),
                        type: 'reference',
                        inCollections: inCollections,
                    });
                    return;
                case 'object':
                    if (path.length) { // No endpoint for the root object.
                        resourcesList.push({
                            ref: path.join('.'),
                            type: 'object',
                            inCollections: inCollections,
                        });
                    }
                    _.each(subSchema, function(value, key) {
                        traverse(value, copyAndAppend(path, key), inCollections);
                    });
                    return;
            }
        }

        traverse(schema, [], []);

        return resourcesList;
    },

    checkResourceHandlers: function checkResourceHandlers(schema, resourceHandlers) {
        var problems = [];
        var expectedResourcesList = schemaUtils.generateResourcesList(schema);

        _.each(expectedResourcesList, function (expectedResource) {
            if (!_.has(resourceHandlers, expectedResource.ref)) {
                var message = 'Missing handler for ' + expectedResource.ref + '. ';
                var expectedArgs = _.map(expectedResource.inCollections, function (collectionName) {
                    return collectionName + 'Ids (a list of integers)';
                });
                if (expectedResource.type === 'collection') {
                    expectedArgs.push('criteria (object)');
                }
                message += 'It should accept arguments: ' + expectedArgs.join(', ') + ' ';
                var returnType = {
                    'collection': 'list',
                    'object': 'object',
                    'reference': 'integer',
                }[expectedResource.type];
                _.each(expectedResource.inCollections, function () {
                    returnType = 'list of ' + returnType.replace(/(?= )|$/, 's');
                });
                message += 'and return a Promise of ' + returnType;
                problems.push(message);
            }
        });
        var unknownHandlers = _.difference(_.functions(resourceHandlers), _.map(expectedResourcesList, 'ref'));
        _.each(unknownHandlers, function (unknownHandler) {
            problems.push('Unexpected handler for: ' + unknownHandler);
        });
        return problems;
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
        switch (schemaUtils.determineType(subSchema)) {
            case 'collection':
                return subSchema[0]; // NOTE: we ignore the key.
            case 'reference':
                return schemaUtils.descendInSchema(schema, subSchema.get(schema)[0], key);
            case 'object':
                return subSchema[key];
            default:
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
