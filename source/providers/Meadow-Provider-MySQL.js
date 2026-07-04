// ##### Part of the **[retold](https://fable-retold.io/)** system
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
		if (_Fable.settings.MySQL)
		{
			_GlobalLogLevel = _Fable.settings.MySQL.GlobalLogLevel || 0;
		}

		/**
		 * Build a connection pool, shared within this provider.
		 * This may be more performant as a shared object.
		 */
		var getSQLPool = function ()
		{
			if (typeof (_Fable.MeadowMySQLConnectionPool) == 'object')
			{
				// This is where the old-style SQL Connection pool is.  Refactor doesn't even look for it anymore
				return _Fable.MeadowMySQLConnectionPool;
			}

			// New-style default connection pool provider
			if (typeof (_Fable.MeadowMySQLProvider) == 'object' && _Fable.MeadowMySQLProvider.connected)
			{
				return _Fable.MeadowMySQLProvider.pool;
			}

			return false;
		};

		var getProvider = function ()
		{
			if (typeof (_Fable.MeadowMySQLConnectionPool) == 'object')
			{
				// This is where the old-style SQL Connection pool is.  Refactor doesn't even look for it anymore
				return _Fable.MeadowMySQLConnectionPool;
			}

			// New-style default connection pool provider
			if (typeof (_Fable.MeadowMySQLProvider) == 'object')
			{
				return _Fable.MeadowMySQLProvider;
			}

			return false;
		}

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

			pQuery.setDialect('MySQL').buildCreateQuery();

			// TODO: Test the query before executing
			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpPool = getSQLPool();
			if (!tmpPool)
			{
				tmpResult.error = new Error('No MySQL connection pool available.');
				tmpResult.executed = true;
				return fCallback();
			}
			tmpPool.getConnection(function (pError, pDBConnection)
			{
				if (pError || !pDBConnection)
				{
					_Fable.log.error('Error getting connection from MySQL pool during create query: ' + (pError ? pError.message : 'no connection returned'), { Body: pQuery.query.body });
					tmpResult.error = pError || new Error('No connection returned from pool.');
					tmpResult.executed = true;
					return fCallback();
				}
				pDBConnection.query(
					pQuery.query.body,
					pQuery.query.parameters,
					// The MySQL library also returns the Fields as the third parameter
					function (pError, pRows)
					{
						pDBConnection.release();
						tmpResult.error = pError;
						tmpResult.value = false;
						try
						{
							tmpResult.value = pRows.insertId;
						}
						catch (pErrorGettingRowcount)
						{
							_Fable.log.warn('Error getting insert ID during create query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
						}

						tmpResult.executed = true;
						return fCallback();
					}
				);
			});
		};

		// This is a synchronous read, good for a few records.
		// TODO: Add a pipe-able read for huge sets
		var Read = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MySQL').buildReadQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpPool = getSQLPool();
			if (!tmpPool)
			{
				tmpResult.error = new Error('No MySQL connection pool available.');
				tmpResult.executed = true;
				return fCallback();
			}
			tmpPool.getConnection(function (pError, pDBConnection)
			{
				if (pError || !pDBConnection)
				{
					_Fable.log.error('Error getting connection from MySQL pool during read query: ' + (pError ? pError.message : 'no connection returned'), { Body: pQuery.query.body });
					tmpResult.error = pError || new Error('No connection returned from pool.');
					tmpResult.executed = true;
					return fCallback();
				}
				pDBConnection.query(
					pQuery.query.body,
					pQuery.query.parameters,
					// The MySQL library also returns the Fields as the third parameter
					function (pError, pRows)
					{
						pDBConnection.release();
						tmpResult.error = pError;
						tmpResult.value = pRows;
						tmpResult.executed = true;
						return fCallback();
					}
				);
			});
		};

		var Update = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MySQL').buildUpdateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpPool = getSQLPool();
			if (!tmpPool)
			{
				tmpResult.error = new Error('No MySQL connection pool available.');
				tmpResult.executed = true;
				return fCallback();
			}
			tmpPool.getConnection(function (pError, pDBConnection)
			{
				if (pError || !pDBConnection)
				{
					_Fable.log.error('Error getting connection from MySQL pool during update query: ' + (pError ? pError.message : 'no connection returned'), { Body: pQuery.query.body });
					tmpResult.error = pError || new Error('No connection returned from pool.');
					tmpResult.executed = true;
					return fCallback();
				}
				pDBConnection.query(
					pQuery.query.body,
					pQuery.query.parameters,
					// The MySQL library also returns the Fields as the third parameter
					function (pError, pRows)
					{
						pDBConnection.release();
						tmpResult.error = pError;
						tmpResult.value = pRows;
						tmpResult.executed = true;
						return fCallback();
					}
				);
			});
		}

		var Delete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MySQL').buildDeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpPool = getSQLPool();
			if (!tmpPool)
			{
				tmpResult.error = new Error('No MySQL connection pool available.');
				tmpResult.executed = true;
				return fCallback();
			}
			tmpPool.getConnection(function (pError, pDBConnection)
			{
				if (pError || !pDBConnection)
				{
					_Fable.log.error('Error getting connection from MySQL pool during delete query: ' + (pError ? pError.message : 'no connection returned'), { Body: pQuery.query.body });
					tmpResult.error = pError || new Error('No connection returned from pool.');
					tmpResult.executed = true;
					return fCallback();
				}
				pDBConnection.query
					(
						pQuery.query.body,
						pQuery.query.parameters,
						// The MySQL library also returns the Fields as the third parameter
						function (pError, pRows)
						{
							pDBConnection.release();
							tmpResult.error = pError;
							tmpResult.value = false;
							try
							{
								tmpResult.value = pRows.affectedRows;
							}
							catch (pErrorGettingRowcount)
							{
								_Fable.log.warn('Error getting affected rowcount during delete query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
							}
							tmpResult.executed = true;
							return fCallback();
						}
					);
			});
		};

		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MySQL').buildUndeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpPool = getSQLPool();
			if (!tmpPool)
			{
				tmpResult.error = new Error('No MySQL connection pool available.');
				tmpResult.executed = true;
				return fCallback();
			}
			tmpPool.getConnection(function (pError, pDBConnection)
			{
				if (pError || !pDBConnection)
				{
					_Fable.log.error('Error getting connection from MySQL pool during undelete query: ' + (pError ? pError.message : 'no connection returned'), { Body: pQuery.query.body });
					tmpResult.error = pError || new Error('No connection returned from pool.');
					tmpResult.executed = true;
					return fCallback();
				}
				pDBConnection.query
					(
						pQuery.query.body,
						pQuery.query.parameters,
						// The MySQL library also returns the Fields as the third parameter
						function (pError, pRows)
						{
							pDBConnection.release();
							tmpResult.error = pError;
							tmpResult.value = false;
							try
							{
								tmpResult.value = pRows.affectedRows;
							}
							catch (pErrorGettingRowcount)
							{
								_Fable.log.warn('Error getting affected rowcount during delete query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
							}
							tmpResult.executed = true;
							return fCallback();
						}
					);
			});
		};

		var Count = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MySQL').buildCountQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpPool = getSQLPool();
			if (!tmpPool)
			{
				tmpResult.error = new Error('No MySQL connection pool available.');
				tmpResult.executed = true;
				return fCallback();
			}
			tmpPool.getConnection(function (pError, pDBConnection)
			{
				if (pError || !pDBConnection)
				{
					_Fable.log.error('Error getting connection from MySQL pool during count query: ' + (pError ? pError.message : 'no connection returned'), { Body: pQuery.query.body });
					tmpResult.error = pError || new Error('No connection returned from pool.');
					tmpResult.executed = true;
					return fCallback();
				}
				pDBConnection.query(
					pQuery.query.body,
					pQuery.query.parameters,
					// The MySQL library also returns the Fields as the third parameter
					function (pError, pRows)
					{
						pDBConnection.release();
						tmpResult.executed = true;
						tmpResult.error = pError;
						tmpResult.value = false;
						try
						{
							tmpResult.value = pRows[0].RowCount;
						}
						catch (pErrorGettingRowcount)
						{
							_Fable.log.warn('Error getting rowcount during count query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
						}
						return fCallback();
					}
				);
			});
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
