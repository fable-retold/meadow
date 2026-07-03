// ##### Part of the **[retold](https://stevenvelozo.github.io/retold/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var MeadowProvider = function ()
{
	function createNew(pFable)
	{
		// If a valid Fable object isn't passed in, return a constructor
		if (typeof (pFable) !== 'object')
		{
			return { new: createNew };
		}
		var _Fable = pFable;
		var _GlobalLogLevel = 0;
		if (_Fable.settings.PostgreSQL)
		{
			_GlobalLogLevel = _Fable.settings.PostgreSQL.GlobalLogLevel || 0;
		}

		/**
		 * Convert named parameters (:paramName) to positional ($N) parameters
		 * for the pg library.
		 *
		 * @param {String} pQueryBody - SQL query body with :paramName placeholders
		 * @param {Object} pNamedParams - Object of parameter name -> value mappings
		 * @return {Object} { text: String, values: Array }
		 */
		var convertNamedToPositional = function (pQueryBody, pNamedParams)
		{
			var tmpValues = [];
			var tmpParamIndex = 0;
			// Track which named params we've already mapped to a positional index
			var tmpParamMap = {};

			// Postgres booleans are stored as SMALLINT (0/1) for cross-engine SQL consistency, so coerce a
			// JS boolean value to 1/0 before binding (mirrors the SQLite provider). Without this, node-pg
			// binds true/false and the SMALLINT column rejects it.
			var coerceBoolean = function (pV) { return (typeof pV === 'boolean') ? (pV ? 1 : 0) : pV; };

			// Match :paramName patterns (word characters after a colon)
			// but not inside quoted strings and not ::type casts
			var tmpText = pQueryBody.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, function (pMatch, pParamName)
			{
				if (!pNamedParams.hasOwnProperty(pParamName))
				{
					// Not a known parameter; leave it as-is (could be a ::typecast)
					return pMatch;
				}

				if (tmpParamMap.hasOwnProperty(pParamName))
				{
					// Reuse the same positional index for duplicate references
					return '$' + tmpParamMap[pParamName];
				}

				tmpParamIndex++;
				tmpParamMap[pParamName] = tmpParamIndex;

				var tmpValue = pNamedParams[pParamName];
				if (Array.isArray(tmpValue))
				{
					// IN clause: expand array into $N, $N+1, ...
					var tmpPlaceholders = [];
					for (var i = 0; i < tmpValue.length; i++)
					{
						if (i > 0)
						{
							tmpParamIndex++;
						}
						tmpValues.push(coerceBoolean(tmpValue[i]));
						tmpPlaceholders.push('$' + tmpParamIndex);
					}
					return tmpPlaceholders.join(', ');
				}
				else
				{
					tmpValues.push(coerceBoolean(tmpValue));
					return '$' + tmpParamIndex;
				}
			});

			return { text: tmpText, values: tmpValues };
		};

		/**
		 * Build a connection pool, shared within this provider.
		 */
		var getSQLPool = function ()
		{
			// New-style default connection pool provider
			if (typeof (_Fable.MeadowPostgreSQLProvider) == 'object' && _Fable.MeadowPostgreSQLProvider.connected)
			{
				return _Fable.MeadowPostgreSQLProvider.pool;
			}

			return false;
		};

		var getProvider = function ()
		{
			// New-style default connection pool provider
			if (typeof (_Fable.MeadowPostgreSQLProvider) == 'object')
			{
				return _Fable.MeadowPostgreSQLProvider;
			}

			return false;
		};

		// The Meadow marshaller passes in the Schema as the third parameter for JSON/JSONProxy deserialization.
		var marshalRecordFromSourceToObject = function (pObject, pRecord, pSchema)
		{
			// Build lookups for JSON columns (only if schema is provided)
			var tmpJsonColumns = {};
			var tmpProxyColumns = {};
			if (Array.isArray(pSchema))
			{
				for (var s = 0; s < pSchema.length; s++)
				{
					if (pSchema[s].Type === 'JSON')
					{
						tmpJsonColumns[pSchema[s].Column] = true;
					}
					else if (pSchema[s].Type === 'JSONProxy' && pSchema[s].StorageColumn)
					{
						tmpProxyColumns[pSchema[s].StorageColumn] = pSchema[s].Column;
					}
				}
			}

			for (var tmpColumn in pRecord)
			{
				if (tmpJsonColumns[tmpColumn])
				{
					// JSON type: parse string from DB into object on the same column name
					try
					{
						pObject[tmpColumn] = (typeof pRecord[tmpColumn] === 'string')
							? JSON.parse(pRecord[tmpColumn])
							: (pRecord[tmpColumn] || {});
					}
					catch (pParseError)
					{
						pObject[tmpColumn] = {};
					}
				}
				else if (tmpProxyColumns.hasOwnProperty(tmpColumn))
				{
					// JSONProxy: storage column -> parse and assign to virtual column name
					var tmpVirtualColumn = tmpProxyColumns[tmpColumn];
					try
					{
						pObject[tmpVirtualColumn] = (typeof pRecord[tmpColumn] === 'string')
							? JSON.parse(pRecord[tmpColumn])
							: (pRecord[tmpColumn] || {});
					}
					catch (pParseError)
					{
						pObject[tmpVirtualColumn] = {};
					}
					// Do NOT copy the storage column to the output object
				}
				else
				{
					pObject[tmpColumn] = pRecord[tmpColumn];
				}
			}
		};

		var Create = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('PostgreSQL').buildCreateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpConverted = convertNamedToPositional(pQuery.query.body, pQuery.query.parameters);

			getSQLPool().query(
				tmpConverted.text,
				tmpConverted.values,
				function (pError, pDBResult)
				{
					tmpResult.error = pError;
					tmpResult.value = false;
					try
					{
						// RETURNING * gives us the full row; find the AutoIdentity column
						if (pDBResult && pDBResult.rows && pDBResult.rows.length > 0)
						{
							var tmpSchema = Array.isArray(pQuery.query.schema) ? pQuery.query.schema : [];
							var tmpIDColumn = false;
							for (var i = 0; i < tmpSchema.length; i++)
							{
								if (tmpSchema[i].Type === 'AutoIdentity')
								{
									tmpIDColumn = tmpSchema[i].Column;
									break;
								}
							}
							if (tmpIDColumn && pDBResult.rows[0].hasOwnProperty(tmpIDColumn))
							{
								tmpResult.value = pDBResult.rows[0][tmpIDColumn];
							}
							else
							{
								// Fall back to the first column of the first row
								var tmpFirstKey = Object.keys(pDBResult.rows[0])[0];
								tmpResult.value = pDBResult.rows[0][tmpFirstKey];
							}
						}
					}
					catch (pErrorGettingID)
					{
						_Fable.log.warn('Error getting insert ID during create query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
					}

					tmpResult.executed = true;
					return fCallback();
				}
			);
		};

		// This is a synchronous read, good for a few records.
		var Read = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('PostgreSQL').buildReadQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpConverted = convertNamedToPositional(pQuery.query.body, pQuery.query.parameters);

			getSQLPool().query(
				tmpConverted.text,
				tmpConverted.values,
				function (pError, pDBResult)
				{
					tmpResult.error = pError;
					tmpResult.value = pDBResult ? pDBResult.rows : [];
					tmpResult.executed = true;
					return fCallback();
				}
			);
		};

		var Update = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('PostgreSQL').buildUpdateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpConverted = convertNamedToPositional(pQuery.query.body, pQuery.query.parameters);

			getSQLPool().query(
				tmpConverted.text,
				tmpConverted.values,
				function (pError, pDBResult)
				{
					tmpResult.error = pError;
					tmpResult.value = pDBResult ? pDBResult.rows : [];
					tmpResult.executed = true;
					return fCallback();
				}
			);
		};

		var Delete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('PostgreSQL').buildDeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpConverted = convertNamedToPositional(pQuery.query.body, pQuery.query.parameters);

			getSQLPool().query(
				tmpConverted.text,
				tmpConverted.values,
				function (pError, pDBResult)
				{
					tmpResult.error = pError;
					tmpResult.value = false;
					try
					{
						tmpResult.value = pDBResult ? pDBResult.rowCount : 0;
					}
					catch (pErrorGettingRowcount)
					{
						_Fable.log.warn('Error getting affected rowcount during delete query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
					}
					tmpResult.executed = true;
					return fCallback();
				}
			);
		};

		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('PostgreSQL').buildUndeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpConverted = convertNamedToPositional(pQuery.query.body, pQuery.query.parameters);

			getSQLPool().query(
				tmpConverted.text,
				tmpConverted.values,
				function (pError, pDBResult)
				{
					tmpResult.error = pError;
					tmpResult.value = false;
					try
					{
						tmpResult.value = pDBResult ? pDBResult.rowCount : 0;
					}
					catch (pErrorGettingRowcount)
					{
						_Fable.log.warn('Error getting affected rowcount during undelete query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
					}
					tmpResult.executed = true;
					return fCallback();
				}
			);
		};

		var Count = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('PostgreSQL').buildCountQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpConverted = convertNamedToPositional(pQuery.query.body, pQuery.query.parameters);

			getSQLPool().query(
				tmpConverted.text,
				tmpConverted.values,
				function (pError, pDBResult)
				{
					tmpResult.executed = true;
					tmpResult.error = pError;
					tmpResult.value = false;
					try
					{
						// PostgreSQL COUNT(*) returns bigint, which the pg library delivers as a string
				tmpResult.value = parseInt(pDBResult.rows[0].rowcount, 10);
					}
					catch (pErrorGettingRowcount)
					{
						_Fable.log.warn('Error getting rowcount during count query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
					}
					return fCallback();
				}
			);
		};

		var tmpNewProvider = (
			{
				marshalRecordFromSourceToObject: marshalRecordFromSourceToObject,

				Create: Create,
				Read: Read,
				Update: Update,
				Delete: Delete,
				Undelete: Undelete,
				Count: Count,

				getProvider: getProvider,
				providerCreatesSupported: false,

				new: createNew
			});


		return tmpNewProvider;
	}

	return createNew();
};

module.exports = new MeadowProvider();
