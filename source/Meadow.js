// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libFoxHound = require('foxhound');

/**
* Meadow Data Broker Library
*
* @class Meadow
*/
var Meadow = function()
{
	function createNew(pFable, pScope, pJsonSchema, pSchema)
	{
		// If a valid Fable object isn't passed in, return a constructor
		if ((typeof(pFable) !== 'object') || !('fable' in pFable))
		{
			return {new: createNew};
		}
		var _Fable = pFable;
		// Make sure there is a valid data broker set
		_Fable.settingsManager.fill({MeadowProvider:'None'});

		var _IDUser = 0;

		// The scope of this broker.
		var _Scope = (typeof(pScope) === 'string') ? pScope : 'Unknown';
		var _Domain = 'Default';

		// The schema for this broker
		var _Schema = require('./Meadow-Schema.js').new(pJsonSchema, pSchema);
		// The query for this broker
		var _Query = libFoxHound.new(_Fable).setScope(_Scope);
		// The custom query loader
		var _RawQueries = require('./Meadow-RawQuery.js').new(_Fable);

		// The core behaviors.. abstracted into their own modules to encapsulate complexity
		var _CreateBehavior = require('./behaviors/Meadow-Create.js');
		var _ReadBehavior = require('./behaviors/Meadow-Read.js');
		var _ReadsBehavior = require('./behaviors/Meadow-Reads.js');
		var _UpdateBehavior = require('./behaviors/Meadow-Update.js');
		var _DeleteBehavior = require('./behaviors/Meadow-Delete.js');
		var _UndeleteBehavior = require('./behaviors/Meadow-Undelete.js');
		var _CountBehavior = require('./behaviors/Meadow-Count.js');

		// The data provider
		var _Provider = false;
		var _ProviderName = false;

		// The default identifier for this broker.
		// This is what is used for the automated endpoint queries
		// For example the 198 in GET http://myapi.com/Widget/198
		//
		// Our development model prefers IDWidget as the column name for the default identifier.
		var _DefaultIdentifier = 'ID'+_Scope;
		var _DefaultGUIdentifier = 'GUID'+_Scope;


		/**
		 * Load a Meadow Package JSON, create a Meadow object from it.
		 */
		var _MeadowPackageLoader = require('./Meadow-PackageFileLoader.js');
		var loadFromPackage = function(pPackage)
		{
			return _MeadowPackageLoader(this, pPackage);
		};

		/**
		 * Load a Meadow Package JSON from file, create a Meadow object from it.
		 */
		var _MeadowPackageObjectLoader = require('./Meadow-PackageObjectLoader.js');
		var loadFromPackageObject = function(pPackage)
		{
			return _MeadowPackageObjectLoader(this, pPackage);
		};

		/**
		* Pass relevant state into the provider
		*
		* @method updateProviderState
		* @return {Object} Returns the current Meadow for chaining.
		*/
		var updateProviderState = ()=>
		{
			if (typeof(_Provider.setSchema) === 'function')
			{
				_Provider.setSchema(_Scope, _Schema.schema, _DefaultIdentifier, _DefaultGUIdentifier);
			}
			return this;
		};


		/**
		* Set the scope
		*
		* @method setScope
		* @return {Object} Returns the current Meadow for chaining.
		*/
		var setScope = function(pScope)
		{
			_Scope = pScope;
			_Query.setScope(pScope);
			updateProviderState();
			return this;
		};


		/**
		* Set the user ID for inserts and updates
		*
		* @method setIDUser
		* @return {Object} Returns the current Meadow for chaining.
		*/
		var setIDUser = function(pIDUser)
		{
			_IDUser = pIDUser;
			return this;
		};


		/**
		* Set the Provider for Query execution.
		*
		* This function expects a string, case sensitive, which matches the
		* provider filename
		*
		* @method setProvider
		* @param {String} pProviderName The provider for query generation.
		* @return {Object} Returns the current Meadow for chaining.
		*/
		var _PROVIDERS = (
		{
			'ALASQL': require(`./providers/Meadow-Provider-ALASQL.js`),
			'MeadowEndpoints': require(`./providers/Meadow-Provider-MeadowEndpoints.js`),
			'MySQL': require(`./providers/Meadow-Provider-MySQL.js`),
			'MSSQL': require(`./providers/Meadow-Provider-MSSQL.js`),
			'SQLite': require(`./providers/Meadow-Provider-SQLite.js`),
			'PostgreSQL': require(`./providers/Meadow-Provider-PostgreSQL.js`),
			'Oracle': require(`./providers/Meadow-Provider-Oracle.js`),
			'MongoDB': require(`./providers/Meadow-Provider-MongoDB.js`),
			'DGraph': require(`./providers/Meadow-Provider-DGraph.js`),
			'Solr': require(`./providers/Meadow-Provider-Solr.js`),
			'RocksDB': require(`./providers/Meadow-Provider-RocksDB.js`),
			'RetoldDataBeacon': require(`./providers/Meadow-Provider-RetoldDataBeacon.js`),
			'None': require(`./providers/Meadow-Provider-None.js`),
		});
		var setProvider = function(pProviderName)
		{
			if (typeof(pProviderName) !== 'string')
			{
				pProviderName = 'None';
			}

			try
			{
				_Provider = _PROVIDERS[pProviderName].new(_Fable);
				// Give the provider access to the schema object
				updateProviderState();

				_ProviderName = pProviderName;
			}
			catch (pError)
			{
				_Fable.log.error('Provider not set - require load problem', {InvalidProvider:pProviderName, error:pError});
				setProvider('None');
			}

			return this;
		};
		setProvider(_Fable.settings.MeadowProvider);

		/**
		* Set the schema to be something else
		*
		* @method setSchema
		* @return {Object} This is chainable.
		*/
		var setSchema = function(pSchema)
		{
			_Schema.setSchema(pSchema);
			updateProviderState();
			return this;
		};

		/**
		* Set the Jsonschema to be something else
		*
		* @method setJsonSchema
		* @return {Object} This is chainable.
		*/
		var setJsonSchema = function(pJsonSchema)
		{
			_Schema.setJsonSchema(pJsonSchema);
			return this;
		};

		/**
		* Set the default object to be something else
		*
		* @method setDefault
		* @return {Object} This is chainable.
		*/
		var setDefault = function(pDefault)
		{
			_Schema.setDefault(pDefault);
			return this;
		};

		/**
		* Set the authorizer set
		*
		* @method setAuthorizer
		* @return {Object} This is chainable.
		*/
		var setAuthorizer = function(pAuthorizer)
		{
			_Schema.setAuthorizer(pAuthorizer);
			return this;
		};

		/**
		* Set the domain
		*
		* @method setDomain
		* @return {Object} This is chainable.
		*/
		var setDomain = function(pDomain)
		{
			_Domain = pDomain;
			return this;
		};

		/**
		* Set the default identifier
		*
		* @method setDefaultIdentifier
		* @return {Object} This is chainable.
		*/
		var setDefaultIdentifier = function(pDefaultIdentifier)
		{
			_DefaultIdentifier = pDefaultIdentifier;
			_DefaultGUIdentifier = 'GU' + pDefaultIdentifier;
			updateProviderState();
			return this;
		};

		/**
		 * Create a record
		 */
		var doCreate = function(pQuery, fCallBack)
		{
			return _CreateBehavior(this, pQuery, fCallBack);
		};

		/**
		 * Read a record
		 */
		var doRead = function(pQuery, fCallBack)
		{
			return _ReadBehavior(this, pQuery, fCallBack);
		};

		/**
		 * Read multiple records
		 */
		var doReads = function(pQuery, fCallBack)
		{
			return _ReadsBehavior(this, pQuery, fCallBack);
		};


		/**
		 * Update a record
		 */
		var doUpdate = function(pQuery, fCallBack)
		{
			return _UpdateBehavior(this, pQuery, fCallBack);
		};


		/**
		 * Delete a record
		 */
		var doDelete = function(pQuery, fCallBack)
		{
			return _DeleteBehavior(this, pQuery, fCallBack);
		};

		/**
		 * Undelete a record
		 */
		var doUndelete = function(pQuery, fCallBack)
		{
			return _UndeleteBehavior(this, pQuery, fCallBack);
		};

		/**
		 * Count multiple records
		 */
		var doCount = function(pQuery, fCallBack)
		{
			return _CountBehavior(this, pQuery, fCallBack);
		};

		/**
		 * Get the role name for an index
		 */
		let _RoleNames;
		if (Array.isArray(_Fable.settings.MeadowRoleNames))
		{
			_RoleNames = _Fable.settings.MeadowRoleNames;
		}
		else
		{
			_RoleNames =
			[
				'Unauthenticated',
				'User',
				'Manager',
				'Director',
				'Executive',
				'Administrator',
			];
		}
		var getRoleName = function(pRoleIndex)
		{
			if (pRoleIndex < 0 || pRoleIndex >= _RoleNames.length)
			{
				return 'Unauthenticated';
			}

			return _RoleNames[pRoleIndex];
		};

		/**
		 * Take the stored representation of our object and stuff the proper values
		 * into our record, translating where necessary.
		 */
		var marshalRecordFromSourceToObject = function(pRecord)
		{
			// Create an object from the default schema object
			var tmpNewObject = _Fable.Utility.extend({}, _Schema.defaultObject);
			// Now marshal the values from pRecord into tmpNewObject, based on schema
			_Provider.marshalRecordFromSourceToObject(tmpNewObject, pRecord, _Schema.schema);
			// This turns on magical validation
			//_Fable.log.trace('Validation', {Value:tmpNewObject, Validation:_Schema.validateObject(tmpNewObject)})
			return tmpNewObject;
		};

		/**
		 * Method to log slow queries in a consistent pattern
		 */
		var logSlowQuery = function(pProfileTime, pQuery)
		{
			var tmpQuery = pQuery.query || {body: '', parameters: {}};
			var tmpFullQuery = tmpQuery.body;
			if (tmpQuery.parameters.length)
			{
				for (var tmpKey in tmpQuery.parameters)
				{
					tmpFullQuery = tmpFullQuery.replace(':' + tmpKey, tmpQuery.parameters[tmpKey]);
				}
			}

			_Fable.log.warn('Slow Read query took ' + pProfileTime + 'ms',
				{
					Provider: _ProviderName,
					Query:
					{
						Body: tmpQuery.body,
						Parameters: tmpQuery.parameters,
						FullQuery: tmpFullQuery
					}
				});
		};

		/**
		* Container Object for our Factory Pattern
		*/
		var tmpNewMeadowObject = (
		{
			doCreate: doCreate,
			doRead: doRead,
			doReads: doReads,
			doUpdate: doUpdate,
			doDelete: doDelete,
			doUndelete: doUndelete,
			doCount: doCount,

			validateObject: _Schema.validateObject,
			marshalRecordFromSourceToObject: marshalRecordFromSourceToObject,

			setProvider: setProvider,
			setIDUser: setIDUser,

			loadFromPackage: loadFromPackage,
			loadFromPackageObject: loadFromPackageObject,
			setScope: setScope,
			setDomain: setDomain,
			setSchema: setSchema,
			setJsonSchema: setJsonSchema,
			setDefault: setDefault,
			setDefaultIdentifier: setDefaultIdentifier,
			setAuthorizer: setAuthorizer,

			getRoleName: getRoleName,

			logSlowQuery: logSlowQuery,

			// Factory
			new: createNew
		});

		/**
		 * Entity Scope -- usually the name of the entity it represents
		 *
		 * @property scope
		 * @type string
		 */
		Object.defineProperty(tmpNewMeadowObject, 'scope',
			{
				get: function() { return _Scope; },
				enumerable: true
			});

		/**
		 * Entity Schema
		 *
		 * @property schema
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowObject, 'schema',
			{
				get: function() { return _Schema.schema; },
				enumerable: true
			});

		/**
		 * Entity Schema
		 *
		 * @property schema
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowObject, 'schemaFull',
			{
				get: function() { return _Schema; },
				enumerable: true
			});

		/**
		 * Default Identifier
		 *
		 * @property schema
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowObject, 'defaultIdentifier',
			{
				get: function() { return _DefaultIdentifier; },
				enumerable: true
			});

		/**
		 * Default GUIdentifier
		 *
		 * @property schema
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowObject, 'defaultGUIdentifier',
			{
				get: function() { return _DefaultGUIdentifier; },
				enumerable: true
			});

		/**
		 * Json Schema
		 *
		 * @property schema
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowObject, 'jsonSchema',
			{
				get: function() { return _Schema.jsonSchema; },
				enumerable: true
			});

		/**
		 * User Identifier
		 *
		 * Used to stamp user identity into Create/Update operations.
		 *
		 * @property userIdentifier
		 * @type string
		 */
		Object.defineProperty(tmpNewMeadowObject, 'userIdentifier',
			{
				get: function() { return _IDUser; },
				enumerable: true
			});

		/**
		 * Query (FoxHound) object
		 *
		 * This always returns a cloned query, so it's safe to get queries with a simple:
		 *   var tmpQuery = libSomeFableObject.query;
		 *
		 * and not expect leakage of basic (cap, begin, filter, dataelements) cloned values.
		 *
		 * @property query
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowObject, 'query',
			{
				get: function()
						{
							var tmpQuery = _Query.clone();
							// Set the default schema
							tmpQuery.query.schema = _Schema.schema;
							return tmpQuery;
						},
				enumerable: true
			});

		/**
		 * Raw Queries
		 *
		 * @property rawQueries
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowObject, 'rawQueries',
			{
				get: function() { return _RawQueries; },
				enumerable: true
			});

		/**
		 * Provider
		 *
		 * @property provider
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowObject, 'provider',
			{
				get: function() { return _Provider; },
				enumerable: true
			});

		/**
		 * Provider Name
		 *
		 * @property providerName
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowObject, 'providerName',
			{
				get: function() { return _ProviderName; },
				enumerable: true
			});

		// addServices removed in fable 2.x
		if (typeof(_Fable.addServices) === 'function')
		{
			_Fable.addServices(tmpNewMeadowObject);
		}
		else
		{
			// bring over addServices implementation from Fable 1.x for backward compatibility
			Object.defineProperty(tmpNewMeadowObject, 'fable',
			{
				get: function() { return _Fable; },
				enumerable: false,
			});

			Object.defineProperty(tmpNewMeadowObject, 'settings',
			{
				get: function() { return _Fable.settings; },
				enumerable: false,
			});

			Object.defineProperty(tmpNewMeadowObject, 'log',
			{
				get: function() { return _Fable.log; },
				enumerable: false,
			});
		}

		return tmpNewMeadowObject;
	}

	return createNew();
};

module.exports = new Meadow();
