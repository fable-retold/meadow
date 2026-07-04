// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libValidator = require('is-my-json-valid');

/**
* @class MeadowSchema
*/
var MeadowSchema = function()
{
	function createNew(pOriginalJsonSchema, pOriginalSchema)
	{
		/* ^ An Example Meadow Schema Object
		    [
		    	{ "Column": "IDAnimal", "Type":"AutoIdentity" },
		    	{ "Column": "GUIDAnimal", "Type":"AutoGUID" },
		    	{ "Column": "Created", "Type":"CreateDate" },
		    	{ "Column": "CreatingIDUser", "Type":"CreateIDUser" },
		    	{ "Column": "Modified", "Type":"UpdateDate" },
		    	{ "Column": "ModifyingIDUser", "Type":"UpdateIDUser" },
		    	{ "Column": "Deleted", "Type":"Deleted" },
		    	{ "Column": "DeletingIDUser", "Type":"DeleteIDUser" },
		    	{ "Column": "DeleteDate", "Type":"DeleteDate" }
		    ]
		*/
		/* #### The Meadow Schema
		 *
		 * Meadow uses this description object to create queries, broker data and generate interfaces.
		 */
		var _Schema = false;

		/* ^ An Example JSONSchema Object:
		    	{
		    		"$schema": "http://json-schema.org/draft-04/schema#",
		    		"title": "Product",
		    		"description": "A product from Acme's catalog",
		    		"type": "object",
		    		"properties": {
		    			"id": {
		    				"description": "The unique identifier for a product",
		    				"type": "integer"
		    			},
		    			"name": {
		    				"description": "Name of the product",
		    				"type": "string"
		    			},
		    			"price": {
		    				"type": "number",
		    				"minimum": 0,
		    				"exclusiveMinimum": true
		    			},
		    			"tags": {
		    				"type": "array",
		    				"items": {
		    					"type": "string"
		    				},
		    				"minItems": 1,
		    				"uniqueItems": true
		    			}
		    		},
		    		"required": ["id", "name", "price"]
		    	}
		*/
		/* #### A JSONSchema Description
		 *
		 * http://json-schema.org/examples.html
		 *
		 * http://json-schema.org/latest/json-schema-core.html
		 */
		var _JsonSchema = false;

		/* #### An "empty" ORM object
		 * This is the basis for being filled out by the marshalling code.
		 */
		var _Default = false;

		// The cached validator, which uses the JSONSchema
		var _Validate = false;

		// The authorizers available to this meadow object
		var _Authorizers = {};


		/**
		* Set the Meadow schema
		*
		* Our schemas are really instructions for *what* to do *when*.  We track:
		*   - Column
		*   - Type _(e.g. AutoIdentity, AutoGUID, CreateDate, CreateIDUser, UpdateDate, UpdateIDUser, DeleteDate, Deleted, DeleteIDUser)_
		*   - Optionally Special Instractions
		*
		* @method setSchema
		*/
		var setSchema = function(pSchema)
		{
			_Schema = (typeof(pSchema) === 'object') ? pSchema : (
			{
				title: 'Unknown',
				type: 'object',
				required: []
			});
		};
		setSchema(pOriginalSchema);

		/**
		* Set the JSONSchema
		*
		* @method setJsonSchema
		*/
		var setJsonSchema = function(pJsonSchema)
		{
			_JsonSchema = (typeof(pJsonSchema) === 'object') ? pJsonSchema : (
			{
				title: 'Unknown',
				type: 'object',
				required: []
			});
			_Validate = libValidator(_JsonSchema, { greedy:true, verbose:true });
		};
		setJsonSchema(pOriginalJsonSchema);

		/**
		* Set the Default ORM object
		*
		* @method setDefault
		*/
		var setDefault = function(pDefault)
		{
			_Default = (typeof(pDefault) === 'object') ? pDefault : {};
		};
		setDefault();

		/**
		* Set the authorizer set
		*
		* @method setAuthorizer
		* @return {Object} This is chainable.
		*/
		var setAuthorizer = function(pAuthorizer)
		{
			_Authorizers = (typeof(pAuthorizer) === 'object') ? pAuthorizer : {};
		};

		/**
		* Validate an object against the current schema
		*
		* @method validateObject
		*/
		var validateObject = function(pObject)
		{
			var tmpValidation = { Valid:_Validate(pObject) };

			// Stuff the errors in if it is invalid
			if (!tmpValidation.Valid)
			{
				tmpValidation.Errors = _Validate.errors;
			}

			return tmpValidation;
		};


		var tmpNewMeadowSchemaObject = (
		{
			setSchema: setSchema,
			setJsonSchema: setJsonSchema,
			setDefault: setDefault,
			setAuthorizer: setAuthorizer,
			validateObject: validateObject,

			new: createNew
		});

		/**
		 * The Meadow Schema
		 *
		 * @property schema
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowSchemaObject, 'schema',
			{
				get: function() { return _Schema; },
				enumerable: true
			});


		/**
		 * The JsonSchema
		 *
		 * @property jsonSchema
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowSchemaObject, 'jsonSchema',
			{
				get: function() { return _JsonSchema; },
				enumerable: true
			});


		/**
		 * Default Object
		 *
		 * @property defaultObject
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowSchemaObject, 'defaultObject',
			{
				get: function() { return _Default; },
				enumerable: true
			});


		/**
		 * Authorizer
		 *
		 * @property defaultObject
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowSchemaObject, 'authorizer',
			{
				get: function() { return _Authorizers; },
				enumerable: true
			});


		return tmpNewMeadowSchemaObject;
	}

	return createNew();
};

module.exports = new MeadowSchema();
