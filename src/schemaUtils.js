'use strict';

var _ = require('lodash');
var Ref = require('./Ref');


// Helper function. Source: http://stackoverflow.com/questions/1007981
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
    var fnStr = func.toString().replace(STRIP_COMMENTS, '');
    var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    if (result === null) {
        result = [];
    }
    return result;
}


var schemaUtils = {

    getResourcesInfo: function getResourcesInfo(schema) {
        var resourcesInfo = {};

        function copyAndAppend(array, element) {
            var newArray = _.clone(array);
            newArray.push(element);
            return newArray;
        }

        function addResource(subSchema, path, inCollections) {
            console.assert(_.filter(path, _.matches('{}')).length === inCollections.length);
            var type = schemaUtils.determineType(subSchema);
            var newResourceInfo = {
                type: type,
                inCollections: inCollections,
                args: _.map(inCollections, function (collectionName) {
                    return collectionName + 'Ids (a list of integers)';
                }),
                returnType: _.map(inCollections, _.constant('list')).concat({
                    'collection': 'list',
                    'object': 'object',
                    'reference': 'integer',
                }[type]),
            };

            if (type === 'collection') {
                newResourceInfo.collectionOf = schemaUtils.determineType(subSchema[0]);
                newResourceInfo.args.push('criteria (object)');
            } else if (type === 'reference') {
                newResourceInfo.referenceTo = subSchema.ref;
            }
            resourcesInfo[path.join('.')] = newResourceInfo;
        }

        function traverse(subSchema, path, inCollections) {
            switch (schemaUtils.determineType(subSchema)) {
                case 'collection':
                    addResource(subSchema, path, inCollections);
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
                    addResource(subSchema, path, inCollections);
                    return;
                case 'object':
                    if (path.length) { // No endpoint for the root object.
                        addResource(subSchema, path, inCollections);
                    }
                    _.each(subSchema, function(value, key) {
                        traverse(value, copyAndAppend(path, key), inCollections);
                    });
                    return;
            }
        }

        traverse(schema, [], []);

        // console.log(JSON.stringify(resourcesInfo, null, 4));

        return resourcesInfo;
    },

    formatNestedType: function formatNestedType (types) {
        return _.reduceRight(types, function (accumulatedType, newOuterType) {
            if (_.contains(['list', 'array', 'collection'], newOuterType)) {
                accumulatedType = accumulatedType.replace(/(?= )|$/, 's'); // plural form
            }
            return newOuterType + ' of ' + accumulatedType;
        });
    },

    // TODO tests for this function
    checkResourceHandlers: function checkResourceHandlers(schema, resourceHandlers) {
        var problems = [];
        var resourcesInfo = schemaUtils.getResourcesInfo(schema);

        _.each(resourcesInfo, function (resource, ref) {
            var missingOrInvalid;
            if (!_.has(resourceHandlers, ref)) {
                missingOrInvalid = 'Missing';
            } else if (getParamNames(resourceHandlers[ref]).length !== resource.args.length) {
                missingOrInvalid = 'Invalid';
            }
            if (missingOrInvalid) {
                problems.push(
                    missingOrInvalid + ' handler for ' + ref + '. ' +
                    'It should accept arguments: ' + resource.args.join(', ') + ' and return a ' +
                    schemaUtils.formatNestedType(['Promise'].concat(resource.returnType))
                );
            }
        });
        var unknownHandlers = _.difference(_.functions(resourceHandlers), _.keys(resourcesInfo));
        _.each(unknownHandlers, function (unknownHandler) {
            problems.push('Unexpected handler for: ' + unknownHandler);
        });
        return problems;
    },

    // TODO tests for this function
    checkResourceResult: function checkResourceResult(resourceName, handlerInfo, result) {
        var subResult = result;
        _.each(handlerInfo.inCollections, function () {
            subResult = subResult[0];
        });
        var problemMessage = null;
        if (handlerInfo.type === 'reference' && !_.isNumber(subResult)) {
            problemMessage = 'reference (integer) expected';
        }
        if (handlerInfo.type === 'object' && (!_.isObject(subResult) || _.isArray(subResult))) {
            problemMessage = 'object expected';
        }
        if (handlerInfo.type === 'collection' && !_.isArray(subResult)) {
            problemMessage = 'list (array) expected';
        }
        if (problemMessage) {
            problemMessage = schemaUtils.formatNestedType(_.map(handlerInfo.inCollections, _.constant('list')).concat(problemMessage));
            return [
                'Wrong result type from resource handler ' + resourceName + ': ' + problemMessage +
                ', got: ' + JSON.stringify(result, null, 4)
            ];
        }
        return [];
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
        function refUp(ref) {
            return _.dropRight(ref.split('.')).join('.'); // UGLY
        }
        _.each(refs, function (ref) {
            var type = schemaUtils.getTypeDeep(schema, ref);
            if (type === 'primitive') {
                refsMap[refUp(ref)] = true;
            } else if (type === 'object' || type === 'reference') {
                refsMap[ref] = true;
            }
        });
        return _.keys(refsMap);
    }
};

module.exports = schemaUtils;
