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
		if (_Fable.settings.Oracle)
		{
			_GlobalLogLevel = _Fable.settings.Oracle.GlobalLogLevel || 0;
		}

		/**
		 * Resolve the connection provider (set up by meadow-connection-oracle
		 * and registered on Fable as MeadowOracleProvider).
		 */
		var getProvider = function ()
		{
			if (typeof (_Fable.MeadowOracleProvider) == 'object' && _Fable.MeadowOracleProvider.connected)
			{
				return _Fable.MeadowOracleProvider;
			}
			return false;
		};

		/**
		 * Propagate Oracle dialect flags (legacyPagination, quoteIdentifiers)
		 * from configuration onto the FoxHound query parameters so the dialect
		 * emits the right SQL.  Honors both fable.settings.Oracle and the live
		 * connection provider's resolved options.
		 */
		var applyOracleParameters = function (pQuery)
		{
			if (_Fable.settings.Oracle)
			{
				if (_Fable.settings.Oracle.LegacyPagination) pQuery.parameters.legacyPagination = true;
				if (_Fable.settings.Oracle.QuoteIdentifiers) pQuery.parameters.quoteIdentifiers = true;
			}
			var tmpProvider = (typeof (_Fable.MeadowOracleProvider) == 'object') ? _Fable.MeadowOracleProvider : false;
			if (tmpProvider && tmpProvider.options && tmpProvider.options.Oracle)
			{
				if (tmpProvider.options.Oracle.LegacyPagination) pQuery.parameters.legacyPagination = true;
				if (tmpProvider.options.Oracle.QuoteIdentifiers) pQuery.parameters.quoteIdentifiers = true;
			}
		};

		/**
		 * Find the AutoIdentity column on the query's schema, if any.  Used to
		 * register the RETURNING out-bind and read back the generated key.
		 */
		var findAutoIdentityColumn = function (pQuery)
		{
			var tmpSchema = Array.isArray(pQuery.query.schema) ? pQuery.query.schema : [];
			for (var i = 0; i < tmpSchema.length; i++)
			{
				if (tmpSchema[i].Type === 'AutoIdentity')
				{
					return tmpSchema[i].Column;
				}
			}
			return false;
		};

		/**
		 * Translate the dialect's string parameterTypes into an oracledb bind
		 * object.  oracledb infers scalar types from JS values, so we only need
		 * to be explicit for CLOB (large Text/JSON, which would otherwise error
		 * or truncate) and for the RETURNING out-bind.
		 */
		var buildBinds = function (pQuery, pOracleDB, pIncludeReturning)
		{
			var tmpBinds = {};
			var tmpParameters = pQuery.query.parameters || {};
			var tmpParameterTypes = pQuery.query.parameterTypes || {};
			for (var tmpName in tmpParameters)
			{
				if (tmpParameterTypes[tmpName] === 'CLOB')
				{
					tmpBinds[tmpName] = { val: tmpParameters[tmpName], type: pOracleDB.CLOB };
				}
				else
				{
					tmpBinds[tmpName] = tmpParameters[tmpName];
				}
			}
			if (pIncludeReturning)
			{
				tmpBinds.RETURNING_ID = { dir: pOracleDB.BIND_OUT, type: pOracleDB.NUMBER };
			}
			return tmpBinds;
		};

		/**
		 * Acquire a pooled connection, run a statement with autoCommit, and
		 * always release the connection.
		 */
		var executeStatement = function (pSQL, pBinds, fCallback)
		{
			var tmpProvider = getProvider();
			if (!tmpProvider)
			{
				return fCallback(new Error('Meadow Oracle provider is not connected.'));
			}
			var libOracleDB = tmpProvider.oracledb;
			tmpProvider.getConnection(function (pConnectionError, pConnection)
			{
				if (pConnectionError)
				{
					return fCallback(pConnectionError);
				}
				pConnection.execute(pSQL, pBinds, { autoCommit: true, outFormat: libOracleDB.OUT_FORMAT_OBJECT })
					.then(function (pResult)
					{
						pConnection.close()
							.then(function () { return fCallback(null, pResult); })
							.catch(function () { return fCallback(null, pResult); });
					})
					.catch(function (pError)
					{
						pConnection.close()
							.then(function () { return fCallback(pError); })
							.catch(function () { return fCallback(pError); });
					});
			});
		};

		// The Meadow marshaller passes in the Schema as the third parameter for
		// JSON/JSONProxy deserialization and (for Oracle) for remapping the
		// data-dictionary's UPPERCASE column keys back to the schema's casing.
		var marshalRecordFromSourceToObject = function (pObject, pRecord, pSchema)
		{
			var tmpJsonColumns = {};
			var tmpProxyColumns = {};
			// Map UPPER(columnName) -> canonical column name so unquoted-mode
			// rows (which come back uppercased) resolve to the schema casing.
			// In quoteIdentifiers mode names already match — the lookup is a no-op.
			var tmpColumnNameByUpper = {};
			if (Array.isArray(pSchema))
			{
				for (var s = 0; s < pSchema.length; s++)
				{
					if (pSchema[s].Column)
					{
						tmpColumnNameByUpper[pSchema[s].Column.toUpperCase()] = pSchema[s].Column;
					}
					if (pSchema[s].Type === 'JSON')
					{
						tmpJsonColumns[pSchema[s].Column] = true;
					}
					else if (pSchema[s].Type === 'JSONProxy' && pSchema[s].StorageColumn)
					{
						tmpProxyColumns[pSchema[s].StorageColumn] = pSchema[s].Column;
						tmpColumnNameByUpper[pSchema[s].StorageColumn.toUpperCase()] = pSchema[s].StorageColumn;
					}
				}
			}

			for (var tmpRawColumn in pRecord)
			{
				var tmpColumn = tmpColumnNameByUpper[tmpRawColumn.toUpperCase()] || tmpRawColumn;

				if (tmpJsonColumns[tmpColumn])
				{
					try
					{
						pObject[tmpColumn] = (typeof pRecord[tmpRawColumn] === 'string')
							? JSON.parse(pRecord[tmpRawColumn])
							: (pRecord[tmpRawColumn] || {});
					}
					catch (pParseError)
					{
						pObject[tmpColumn] = {};
					}
				}
				else if (tmpProxyColumns.hasOwnProperty(tmpColumn))
				{
					var tmpVirtualColumn = tmpProxyColumns[tmpColumn];
					try
					{
						pObject[tmpVirtualColumn] = (typeof pRecord[tmpRawColumn] === 'string')
							? JSON.parse(pRecord[tmpRawColumn])
							: (pRecord[tmpRawColumn] || {});
					}
					catch (pParseError)
					{
						pObject[tmpVirtualColumn] = {};
					}
					// Do NOT copy the storage column to the output object
				}
				else
				{
					pObject[tmpColumn] = pRecord[tmpRawColumn];
				}
			}
		};

		var Create = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			applyOracleParameters(pQuery);
			pQuery.setDialect('Oracle').buildCreateQuery();

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpProvider = getProvider();
			if (!tmpProvider)
			{
				tmpResult.error = new Error('Meadow Oracle provider is not connected.');
				tmpResult.executed = true;
				return fCallback();
			}

			// The dialect appends RETURNING <ID> INTO :RETURNING_ID when there
			// is an AutoIdentity column and auto-identity is not disabled.
			var tmpHasReturning = !pQuery.query.disableAutoIdentity && (findAutoIdentityColumn(pQuery) !== false);
			var tmpBinds = buildBinds(pQuery, tmpProvider.oracledb, tmpHasReturning);

			executeStatement(pQuery.query.body, tmpBinds, function (pError, pDBResult)
			{
				tmpResult.error = pError;
				tmpResult.value = false;
				try
				{
					if (!pError && pDBResult && pDBResult.outBinds && Array.isArray(pDBResult.outBinds.RETURNING_ID) && pDBResult.outBinds.RETURNING_ID.length > 0)
					{
						tmpResult.value = pDBResult.outBinds.RETURNING_ID[0];
					}
				}
				catch (pErrorGettingID)
				{
					_Fable.log.warn('Error getting insert ID during create query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
				}
				tmpResult.executed = true;
				return fCallback();
			});
		};

		var Read = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			applyOracleParameters(pQuery);
			pQuery.setDialect('Oracle').buildReadQuery();

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpProvider = getProvider();
			if (!tmpProvider)
			{
				tmpResult.error = new Error('Meadow Oracle provider is not connected.');
				tmpResult.value = [];
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpBinds = buildBinds(pQuery, tmpProvider.oracledb, false);

			executeStatement(pQuery.query.body, tmpBinds, function (pError, pDBResult)
			{
				tmpResult.error = pError;
				tmpResult.value = (pDBResult && pDBResult.rows) ? pDBResult.rows : [];
				tmpResult.executed = true;
				return fCallback();
			});
		};

		var Update = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			applyOracleParameters(pQuery);
			pQuery.setDialect('Oracle').buildUpdateQuery();

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpProvider = getProvider();
			if (!tmpProvider)
			{
				tmpResult.error = new Error('Meadow Oracle provider is not connected.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpBinds = buildBinds(pQuery, tmpProvider.oracledb, false);

			executeStatement(pQuery.query.body, tmpBinds, function (pError, pDBResult)
			{
				tmpResult.error = pError;
				// The Meadow Update behavior requires result.value to be an
				// object; oracledb's UPDATE result has no rows array (no
				// RETURNING), so mirror the PostgreSQL provider and expose an
				// (empty) array. The post-update Read supplies the record.
				tmpResult.value = (pDBResult && pDBResult.rows) ? pDBResult.rows : [];
				tmpResult.executed = true;
				return fCallback();
			});
		};

		var Delete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			applyOracleParameters(pQuery);
			pQuery.setDialect('Oracle').buildDeleteQuery();

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpProvider = getProvider();
			if (!tmpProvider)
			{
				tmpResult.error = new Error('Meadow Oracle provider is not connected.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpBinds = buildBinds(pQuery, tmpProvider.oracledb, false);

			executeStatement(pQuery.query.body, tmpBinds, function (pError, pDBResult)
			{
				tmpResult.error = pError;
				tmpResult.value = false;
				try
				{
					tmpResult.value = pDBResult ? pDBResult.rowsAffected : 0;
				}
				catch (pErrorGettingRowcount)
				{
					_Fable.log.warn('Error getting affected rowcount during delete query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
				}
				tmpResult.executed = true;
				return fCallback();
			});
		};

		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			applyOracleParameters(pQuery);
			pQuery.setDialect('Oracle').buildUndeleteQuery();

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpProvider = getProvider();
			if (!tmpProvider)
			{
				tmpResult.error = new Error('Meadow Oracle provider is not connected.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpBinds = buildBinds(pQuery, tmpProvider.oracledb, false);

			executeStatement(pQuery.query.body, tmpBinds, function (pError, pDBResult)
			{
				tmpResult.error = pError;
				tmpResult.value = false;
				try
				{
					tmpResult.value = pDBResult ? pDBResult.rowsAffected : 0;
				}
				catch (pErrorGettingRowcount)
				{
					_Fable.log.warn('Error getting affected rowcount during undelete query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
				}
				tmpResult.executed = true;
				return fCallback();
			});
		};

		var Count = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			applyOracleParameters(pQuery);
			pQuery.setDialect('Oracle').buildCountQuery();

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpProvider = getProvider();
			if (!tmpProvider)
			{
				tmpResult.error = new Error('Meadow Oracle provider is not connected.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpBinds = buildBinds(pQuery, tmpProvider.oracledb, false);

			executeStatement(pQuery.query.body, tmpBinds, function (pError, pDBResult)
			{
				tmpResult.executed = true;
				tmpResult.error = pError;
				tmpResult.value = false;
				try
				{
					// The COUNT column alias casing depends on quoting mode, so
					// read the first (only) column of the first row by position.
					var tmpRow = pDBResult.rows[0];
					var tmpKey = Object.keys(tmpRow)[0];
					tmpResult.value = parseInt(tmpRow[tmpKey], 10);
				}
				catch (pErrorGettingRowcount)
				{
					_Fable.log.warn('Error getting rowcount during count query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
				}
				return fCallback();
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
				providerCreatesSupported: true,

				new: createNew
			});


		return tmpNewProvider;
	}

	return createNew();
};

module.exports = new MeadowProvider();
