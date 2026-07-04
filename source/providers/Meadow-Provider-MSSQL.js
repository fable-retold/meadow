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
		if (_Fable.settings.MSSQL)
		{
			_GlobalLogLevel = _Fable.settings.MSSQL.GlobalLogLevel || 0;
		}

		/**
		 * Build a connection pool, shared within this provider.
		 * This may be more performant as a shared object.
		 */
		var getSQLPool = function ()
		{
			// New-style default connection pool provider
			// There are no legacy MSSQL open source connectors.
			if (typeof (_Fable.MeadowMSSQLProvider) == 'object' && _Fable.MeadowMSSQLProvider.connected)
			{
				return _Fable.MeadowMSSQLProvider.pool;
			}
			return false;
		};

		var getProvider = function ()
		{
			if (typeof (_Fable.MeadowMSSQLProvider) == 'object' && _Fable.MeadowMSSQLProvider.connected)
			{
				return _Fable.MeadowMSSQLProvider;
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

		var getPreparedStatementFromQuery = function (pQuery)
		{
			// Create the MS SQL Prepared Statement class
			let tmpPreparedStatement = _Fable.MeadowMSSQLProvider.preparedStatement;
			// Map the Parameters to Types
			let tmpParameterTypeKeys = Object.keys(pQuery.query.parameterTypes)
			const tmpColumns = pQuery.query.schema;
			const tmpSchemaByColumn = {};
			for (let i = 0; i < tmpColumns.length; i++)
			{
				tmpSchemaByColumn[tmpColumns[i].Column] = tmpColumns[i];
			}
			for (let i = 0; i < tmpParameterTypeKeys.length; i++)
			{
				let tmpParameterType = pQuery.query.parameterTypes[tmpParameterTypeKeys[i]];
				if (_Fable.MeadowMSSQLProvider.MSSQL[tmpParameterType] === undefined)
				{
					tmpParameterType = 'VarChar';
				}
				// TODO: Decide how to filter better cleansing to this layer from the schema; we have access to proper lengths.
				//       BEFORE WE ADD THIS BEHAVIOR, DECIDE CONCISTENCY WITH OTHER PROVIDERS WHO ALLOW OVERFLOWING STRINGS
				let tmpParameterEntry = false;
				if ((tmpParameterType === 'Char') || (tmpParameterType === 'VarChar'))
				{
					tmpParameterEntry = _Fable.MeadowMSSQLProvider.MSSQL[tmpParameterType](_Fable.MeadowMSSQLProvider.MSSQL.Max);
				}
				// TODO: There is a bug with Text and schemata in ArtifactTypes at least.
				else if (tmpParameterType === 'Text')
				{
					tmpParameterEntry = _Fable.MeadowMSSQLProvider.MSSQL.VarChar(_Fable.MeadowMSSQLProvider.MSSQL.Max);
				}
				else if (tmpParameterType === 'Decimal')
				{
					const tmpSize = tmpSchemaByColumn[tmpParameterTypeKeys[i]]?.Size;
					if (tmpSize && typeof tmpSize === 'string')
					{
						let [ tmpDigitsStr, tmpDecimalDigitsStr ] = tmpSize.split(',');
						const tmpDigits = parseInt(tmpDigitsStr.trim());
						const tmpDecimalDigits = tmpDecimalDigitsStr ? parseInt(tmpDecimalDigitsStr.trim()) : 0;
						tmpParameterEntry = _Fable.MeadowMSSQLProvider.MSSQL.Decimal(tmpDigits, tmpDecimalDigits);
					}
					else
					{
						tmpParameterEntry = _Fable.MeadowMSSQLProvider.MSSQL.Decimal(18, 8);
					}
				}
				else
				{
					tmpParameterEntry = _Fable.MeadowMSSQLProvider.MSSQL[tmpParameterType];
				}
				tmpPreparedStatement.input(tmpParameterTypeKeys[i], tmpParameterEntry);
			}

			return tmpPreparedStatement;
		};

		var Create = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MSSQL').buildCreateQuery();

			// TODO: Test the query before executing
			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			let tmpPreparedStatement = getPreparedStatementFromQuery(pQuery);

			let tmpQueryBody = `${pQuery.query.body} \nSELECT SCOPE_IDENTITY() AS value;`

			if (pQuery.AllowIdentityInsert)
			{
				tmpQueryBody = `SET IDENTITY_INSERT [${pQuery.parameters.scope}] ON; \n${tmpQueryBody} \nSET IDENTITY_INSERT [${pQuery.parameters.scope}] OFF;`
			}

			tmpPreparedStatement.prepare(tmpQueryBody,
				(pPrepareError) =>
				{
					if (pPrepareError)
					{
						_Fable.log.error(`CREATE Error preparing prepared statement: ${pPrepareError}`, pPrepareError);
						tmpResult.error = pPrepareError;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpPreparedStatement.execute(pQuery.query.parameters,
						(pPreparedExecutionError, pPreparedResult) =>
						{
							// release the connection after queries are executed
							tmpPreparedStatement.unprepare(
								(pPreparedStatementUnprepareError) =>
								{
									if (pPreparedStatementUnprepareError)
									{
										_Fable.log.error(`CREATE Error unpreparing prepared statement: ${pPreparedStatementUnprepareError}`, pPreparedStatementUnprepareError);
									}

									tmpResult.error = pPreparedExecutionError;
									if (pPreparedResult
										&& Array.isArray(pPreparedResult.recordset)
										&& (pPreparedResult.recordset.length > 0)
										&& (pPreparedResult.recordset[0].value))
									{
										tmpResult.value = pPreparedResult.recordset[0].value;
									}
									tmpResult.executed = true;

									// TODO: Fix very old pattern by es6-izing this whole bash
									return fCallback();
								});
						});
				});
		};

		// This is a synchronous read, good for a few records.
		// TODO: Add a pipe-able read for huge sets
		var Read = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			// Propagate the MSSQL LegacyPagination setting (configured on
			// meadow-connection-mssql) onto the FoxHound parameters so the
			// dialect can emit a ROW_NUMBER() wrapper instead of OFFSET/FETCH
			// for customers whose database compatibility level is < 110
			// (SQL Server 2008 R2 and earlier, or older compat levels on
			// newer servers).
			if (_Fable.settings.MSSQL && _Fable.settings.MSSQL.LegacyPagination)
			{
				pQuery.parameters.legacyPagination = true;
			}

			pQuery.setDialect('MSSQL').buildReadQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			let tmpPreparedStatement = getPreparedStatementFromQuery(pQuery);
			tmpPreparedStatement.prepare(pQuery.query.body,
				(pPrepareError) =>
				{
					if (pPrepareError)
					{
						_Fable.log.error(`READ Error preparing prepared statement: ${pPrepareError}`, pPrepareError);
						tmpResult.error = pPrepareError;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpPreparedStatement.execute(pQuery.query.parameters,
						(pPreparedExecutionError, pPreparedResult) =>
						{
							// release the connection after queries are executed
							tmpPreparedStatement.unprepare(
								(pPreparedStatementUnprepareError) =>
								{
									if (pPreparedStatementUnprepareError)
									{
										_Fable.log.error(`READ Error unpreparing prepared statement: ${pPreparedStatementUnprepareError}`, pPreparedStatementUnprepareError);
									}

									//_Fable.log.info(`Prepared statement returned...`, pPreparedResult);
									tmpResult.error = pPreparedExecutionError;
									try
									{
										tmpResult.value = pPreparedResult.recordset;
									}
									catch(pMarshalError)
									{
										_Fable.log.error(`READ Error marshaling prepared statement result: ${pMarshalError}`, pMarshalError);
									}
									tmpResult.executed = true;
									return fCallback();
								});
						})
				});
		};

		var Update = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MSSQL').buildUpdateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			let tmpPreparedStatement = getPreparedStatementFromQuery(pQuery);
			tmpPreparedStatement.prepare(pQuery.query.body,
				(pPrepareError) =>
				{
					if (pPrepareError)
					{
						_Fable.log.error(`UPDATE Error preparing prepared statement: ${pPrepareError}`, pPrepareError);
						tmpResult.error = pPrepareError;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpPreparedStatement.execute(pQuery.query.parameters,
						(pPreparedExecutionError, pPreparedResult) =>
						{
							// release the connection after queries are executed
							tmpPreparedStatement.unprepare(
								(pPreparedStatementUnprepareError) =>
								{
									if (pPreparedStatementUnprepareError)
									{
										_Fable.log.error(`UPDATE Error unpreparing prepared statement: ${pPreparedStatementUnprepareError}`, pPreparedStatementUnprepareError);
									}

									//_Fable.log.info(`Prepared statement returned...`, pPreparedResult);
									tmpResult.error = pPreparedExecutionError;
									tmpResult.value = pPreparedResult;
									tmpResult.executed = true;
									return fCallback();
								});
						})
				});
		}

		var Delete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MSSQL').buildDeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			let tmpPreparedStatement = getPreparedStatementFromQuery(pQuery);
			tmpPreparedStatement.prepare(pQuery.query.body,
				(pPrepareError) =>
				{
					if (pPrepareError)
					{
						_Fable.log.error(`DELETE Error preparing prepared statement: ${pPrepareError}`, pPrepareError);
						tmpResult.error = pPrepareError;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpPreparedStatement.execute(pQuery.query.parameters,
						(pPreparedExecutionError, pPreparedResult) =>
						{
							// release the connection after queries are executed
							tmpPreparedStatement.unprepare(
								(pPreparedStatementUnprepareError) =>
								{
									if (pPreparedStatementUnprepareError)
									{
										_Fable.log.error(`DELETE Error unpreparing prepared statement: ${pPreparedStatementUnprepareError}`, pPreparedStatementUnprepareError);
									}

									//_Fable.log.info(`Prepared statement returned...`, pPreparedResult);
									tmpResult.error = pPreparedExecutionError;
									tmpResult.value = false;
									try
									{
										tmpResult.value = pPreparedResult.rowsAffected[0];
									}
									catch (pErrorGettingRowcount)
									{
										_Fable.log.warn('Error getting affected rowcount during delete query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
									}
									tmpResult.executed = true;
									return fCallback();
								});
						})
				});
		};

		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MSSQL').buildUndeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			let tmpPreparedStatement = getPreparedStatementFromQuery(pQuery);
			tmpPreparedStatement.prepare(pQuery.query.body,
				(pPrepareError) =>
				{
					if (pPrepareError)
					{
						_Fable.log.error(`UNDELETE Error preparing prepared statement: ${pPrepareError}`, pPrepareError);
						tmpResult.error = pPrepareError;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpPreparedStatement.execute(pQuery.query.parameters,
						(pPreparedExecutionError, pPreparedResult) =>
						{
							// release the connection after queries are executed
							tmpPreparedStatement.unprepare(
								(pPreparedStatementUnprepareError) =>
								{
									if (pPreparedStatementUnprepareError)
									{
										_Fable.log.error(`UNDELETE Error unpreparing prepared statement: ${pPreparedStatementUnprepareError}`, pPreparedStatementUnprepareError);
									}

									//_Fable.log.info(`Prepared statement returned...`, pPreparedResult);
									tmpResult.error = pPreparedExecutionError;
									tmpResult.value = false;
									try
									{
										tmpResult.value = pPreparedResult.rowsAffected[0];
									}
									catch (pErrorGettingRowcount)
									{
										_Fable.log.warn('Error getting affected rowcount during undelete query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
									}
									tmpResult.executed = true;
									return fCallback();
								});
						})
				});
		};

		var Count = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MSSQL').buildCountQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			let tmpPreparedStatement = getPreparedStatementFromQuery(pQuery);
			tmpPreparedStatement.prepare(pQuery.query.body,
				(pPrepareError) =>
				{
					if (pPrepareError)
					{
						_Fable.log.error(`COUNT Error preparing prepared statement: ${pPrepareError}`, pPrepareError);
						tmpResult.error = pPrepareError;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpPreparedStatement.execute(pQuery.query.parameters,
						(pPreparedExecutionError, pPreparedResult) =>
						{
							// release the connection after queries are executed
							tmpPreparedStatement.unprepare(
								(pPreparedStatementUnprepareError) =>
								{
									if (pPreparedStatementUnprepareError)
									{
										_Fable.log.error(`COUNT Error unpreparing prepared statement: ${pPreparedStatementUnprepareError}`, pPreparedStatementUnprepareError);
									}

									//_Fable.log.info(`Prepared statement returned...`, pPreparedResult);
									tmpResult.error = pPreparedExecutionError;
									tmpResult.value = false;
									try
									{
										tmpResult.value = pPreparedResult.recordset[0].Row_Count;
									}
									catch (pErrorGettingRowcount)
									{
										_Fable.log.warn('Error getting affected rowcount during count query', { Body: pQuery.query.body, Parameters: pQuery.query.parameters });
									}
									tmpResult.executed = true;
									return fCallback();
								});
						})
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
