/**
* Meadow Provider - SQLite (via better-sqlite3)
*
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

		/**
		 * Get the better-sqlite3 database instance from the connection provider.
		 *
		 * The connection provider (meadow-connection-sqlite) stores the database
		 * instance on .db after connectAsync() completes.
		 */
		var getDB = function ()
		{
			if (typeof (_Fable.MeadowSQLiteProvider) == 'object' && _Fable.MeadowSQLiteProvider.connected)
			{
				return _Fable.MeadowSQLiteProvider.db;
			}

			return false;
		};

		var getProvider = function ()
		{
			if (typeof (_Fable.MeadowSQLiteProvider) == 'object')
			{
				return _Fable.MeadowSQLiteProvider;
			}

			return false;
		};

		/**
		 * Replace NOW() with SQLite-compatible datetime('now') in query bodies.
		 *
		 * The FoxHound SQLite dialect generates NOW() for date stamps, but SQLite
		 * does not support NOW().  We replace it at the provider level so the
		 * dialect can stay consistent with the other providers.
		 */
		var fixDateFunctions = function (pQueryBody)
		{
			if (typeof (pQueryBody) !== 'string')
			{
				return pQueryBody;
			}
			// Replace NOW() and NOW(3) with SQLite's datetime function
			return pQueryBody.replace(/NOW\(\d*\)/g, "datetime('now')");
		};

		/**
		 * Convert FoxHound named parameters (:name) to better-sqlite3 format.
		 *
		 * better-sqlite3 uses @name, $name, or :name for named parameters,
		 * but expects them passed as an object.  FoxHound generates :name syntax
		 * which better-sqlite3 supports natively.
		 */

		/**
		 * Coerce query parameter values so they are safe for better-sqlite3.
		 *
		 * better-sqlite3 only accepts numbers, strings, bigints, buffers and null.
		 * Booleans (e.g. Deleted: false) must be converted to integers.
		 * Undefined values must be converted to null.
		 */
		var coerceParameters = function (pParams)
		{
			if (typeof (pParams) !== 'object' || pParams === null)
			{
				return pParams;
			}
			var tmpKeys = Object.keys(pParams);
			for (var i = 0; i < tmpKeys.length; i++)
			{
				var tmpValue = pParams[tmpKeys[i]];
				if (Array.isArray(tmpValue))
				{
					// SQLite (better-sqlite3) cannot bind arrays.
					// For single-element arrays (e.g. from FBL~Field~LT~10),
					// unwrap to the scalar value.
					if (tmpValue.length === 1)
					{
						pParams[tmpKeys[i]] = tmpValue[0];
					}
				}
				else if (typeof (tmpValue) === 'boolean')
				{
					pParams[tmpKeys[i]] = tmpValue ? 1 : 0;
				}
				else if (typeof (tmpValue) === 'undefined')
				{
					pParams[tmpKeys[i]] = null;
				}
			}
			return pParams;
		};

		/**
		 * Filter a named-parameters object down to only those keys whose
		 * `:name` form appears in the SQL body.
		 *
		 * node:sqlite is strict about unknown named parameters — passing
		 * a key the prepared statement doesn't reference throws
		 * `Unknown named parameter '<name>'`.  better-sqlite3 was lenient
		 * about extras, so this regressed silently when
		 * meadow-connection-sqlite switched to node:sqlite.  It matters
		 * whenever Meadow.rawQueries.loadQuery installs an override SQL
		 * whose placeholders are a strict subset of meadow's auto-
		 * generated params (filter columns, soft-delete tracking,
		 * AutoGUID conflict-check), but the filter is cheap and applied
		 * uniformly — also protects any future case where the auto-built
		 * SQL and the params dict drift apart.
		 *
		 * Approach mirrors `convertNamedToPositional` in the PostgreSQL
		 * provider: walk the SQL with /:([A-Za-z_][A-Za-z0-9_]*)/g, keep
		 * names that exist in the params dict, leave the literal alone
		 * otherwise (handles `::typecast`-style sequences without
		 * tripping).  Over-matches inside string literals are harmless
		 * because we only ever *keep* params — never invent them.
		 */
		var filterUsedNamedParams = function (pQueryBody, pNamedParams)
		{
			if (typeof (pNamedParams) !== 'object' || pNamedParams === null)
			{
				return pNamedParams;
			}
			if (typeof (pQueryBody) !== 'string')
			{
				return pNamedParams;
			}

			var tmpUsed = {};
			var tmpPattern = /:([A-Za-z_][A-Za-z0-9_]*)/g;
			var tmpMatch;
			while ((tmpMatch = tmpPattern.exec(pQueryBody)) !== null)
			{
				var tmpName = tmpMatch[1];
				if (Object.prototype.hasOwnProperty.call(pNamedParams, tmpName))
				{
					tmpUsed[tmpName] = pNamedParams[tmpName];
				}
			}
			return tmpUsed;
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

			pQuery.setDialect('SQLite').buildCreateQuery();

			var tmpQueryBody = fixDateFunctions(pQuery.query.body);
			coerceParameters(pQuery.query.parameters);
			// Filter to keys actually referenced as :name in the SQL —
			// node:sqlite is strict about unknown named parameters, and
			// meadow auto-generates filter/Deleted/AutoGUID params that
			// a rawQueries override may not reference.
			var tmpBindParams = filterUsedNamedParams(tmpQueryBody, pQuery.query.parameters);

			if (pQuery.logLevel > 0)
			{
				_Fable.log.trace(tmpQueryBody, pQuery.query.parameters);
			}

			try
			{
				var tmpDB = getDB();
				if (!tmpDB)
				{
					tmpResult.error = new Error('No SQLite database connection available.');
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpStatement = tmpDB.prepare(tmpQueryBody);
				var tmpInfo = tmpStatement.run(tmpBindParams);

				tmpResult.error = null;
				tmpResult.value = false;
				try
				{
					tmpResult.value = Number(tmpInfo.lastInsertRowid);
				}
				catch (pErrorGettingRowcount)
				{
					_Fable.log.warn('Error getting insert ID during create query', { Body: tmpQueryBody, Parameters: pQuery.query.parameters });
				}

				tmpResult.executed = true;
			}
			catch (pError)
			{
				tmpResult.error = pError;
				tmpResult.value = false;
				tmpResult.executed = true;
			}
			return fCallback();
		};

		var Read = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('SQLite').buildReadQuery();

			var tmpQueryBody = fixDateFunctions(pQuery.query.body);
			coerceParameters(pQuery.query.parameters);
			// Filter to keys actually referenced as :name in the SQL —
			// node:sqlite is strict about unknown named parameters, and
			// meadow auto-generates filter/Deleted/AutoGUID params that
			// a rawQueries override may not reference.
			var tmpBindParams = filterUsedNamedParams(tmpQueryBody, pQuery.query.parameters);

			if (pQuery.logLevel > 0)
			{
				_Fable.log.trace(tmpQueryBody, pQuery.query.parameters);
			}

			try
			{
				var tmpDB = getDB();
				if (!tmpDB)
				{
					tmpResult.error = new Error('No SQLite database connection available.');
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpStatement = tmpDB.prepare(tmpQueryBody);
				var tmpRows = tmpStatement.all(tmpBindParams);

				tmpResult.error = null;
				tmpResult.value = tmpRows;
				tmpResult.executed = true;
			}
			catch (pError)
			{
				tmpResult.error = pError;
				tmpResult.value = false;
				tmpResult.executed = true;
			}
			return fCallback();
		};

		var Update = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('SQLite').buildUpdateQuery();

			var tmpQueryBody = fixDateFunctions(pQuery.query.body);
			coerceParameters(pQuery.query.parameters);
			// Filter to keys actually referenced as :name in the SQL —
			// node:sqlite is strict about unknown named parameters, and
			// meadow auto-generates filter/Deleted/AutoGUID params that
			// a rawQueries override may not reference.
			var tmpBindParams = filterUsedNamedParams(tmpQueryBody, pQuery.query.parameters);

			if (pQuery.logLevel > 0)
			{
				_Fable.log.trace(tmpQueryBody, pQuery.query.parameters);
			}

			try
			{
				var tmpDB = getDB();
				if (!tmpDB)
				{
					tmpResult.error = new Error('No SQLite database connection available.');
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpStatement = tmpDB.prepare(tmpQueryBody);
				var tmpInfo = tmpStatement.run(tmpBindParams);

				tmpResult.error = null;
				tmpResult.value = tmpInfo;
				tmpResult.executed = true;
			}
			catch (pError)
			{
				tmpResult.error = pError;
				tmpResult.value = false;
				tmpResult.executed = true;
			}
			return fCallback();
		};

		var Delete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('SQLite').buildDeleteQuery();

			var tmpQueryBody = fixDateFunctions(pQuery.query.body);
			coerceParameters(pQuery.query.parameters);
			// Filter to keys actually referenced as :name in the SQL —
			// node:sqlite is strict about unknown named parameters, and
			// meadow auto-generates filter/Deleted/AutoGUID params that
			// a rawQueries override may not reference.
			var tmpBindParams = filterUsedNamedParams(tmpQueryBody, pQuery.query.parameters);

			if (pQuery.logLevel > 0)
			{
				_Fable.log.trace(tmpQueryBody, pQuery.query.parameters);
			}

			try
			{
				var tmpDB = getDB();
				if (!tmpDB)
				{
					tmpResult.error = new Error('No SQLite database connection available.');
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpStatement = tmpDB.prepare(tmpQueryBody);
				var tmpInfo = tmpStatement.run(tmpBindParams);

				tmpResult.error = null;
				tmpResult.value = false;
				try
				{
					tmpResult.value = tmpInfo.changes;
				}
				catch (pErrorGettingRowcount)
				{
					_Fable.log.warn('Error getting affected rowcount during delete query', { Body: tmpQueryBody, Parameters: pQuery.query.parameters });
				}
				tmpResult.executed = true;
			}
			catch (pError)
			{
				tmpResult.error = pError;
				tmpResult.value = false;
				tmpResult.executed = true;
			}
			return fCallback();
		};

		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('SQLite').buildUndeleteQuery();

			var tmpQueryBody = fixDateFunctions(pQuery.query.body);
			coerceParameters(pQuery.query.parameters);
			// Filter to keys actually referenced as :name in the SQL —
			// node:sqlite is strict about unknown named parameters, and
			// meadow auto-generates filter/Deleted/AutoGUID params that
			// a rawQueries override may not reference.
			var tmpBindParams = filterUsedNamedParams(tmpQueryBody, pQuery.query.parameters);

			if (pQuery.logLevel > 0)
			{
				_Fable.log.trace(tmpQueryBody, pQuery.query.parameters);
			}

			try
			{
				var tmpDB = getDB();
				if (!tmpDB)
				{
					tmpResult.error = new Error('No SQLite database connection available.');
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpStatement = tmpDB.prepare(tmpQueryBody);
				var tmpInfo = tmpStatement.run(tmpBindParams);

				tmpResult.error = null;
				tmpResult.value = false;
				try
				{
					tmpResult.value = tmpInfo.changes;
				}
				catch (pErrorGettingRowcount)
				{
					_Fable.log.warn('Error getting affected rowcount during undelete query', { Body: tmpQueryBody, Parameters: pQuery.query.parameters });
				}
				tmpResult.executed = true;
			}
			catch (pError)
			{
				tmpResult.error = pError;
				tmpResult.value = false;
				tmpResult.executed = true;
			}
			return fCallback();
		};

		var Count = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('SQLite').buildCountQuery();

			var tmpQueryBody = fixDateFunctions(pQuery.query.body);
			coerceParameters(pQuery.query.parameters);
			// Filter to keys actually referenced as :name in the SQL —
			// node:sqlite is strict about unknown named parameters, and
			// meadow auto-generates filter/Deleted/AutoGUID params that
			// a rawQueries override may not reference.
			var tmpBindParams = filterUsedNamedParams(tmpQueryBody, pQuery.query.parameters);

			if (pQuery.logLevel > 0)
			{
				_Fable.log.trace(tmpQueryBody, pQuery.query.parameters);
			}

			try
			{
				var tmpDB = getDB();
				if (!tmpDB)
				{
					tmpResult.error = new Error('No SQLite database connection available.');
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpStatement = tmpDB.prepare(tmpQueryBody);
				var tmpRows = tmpStatement.all(tmpBindParams);

				tmpResult.executed = true;
				tmpResult.error = null;
				tmpResult.value = false;
				try
				{
					tmpResult.value = tmpRows[0].RowCount;
				}
				catch (pErrorGettingRowcount)
				{
					_Fable.log.warn('Error getting rowcount during count query', { Body: tmpQueryBody, Parameters: pQuery.query.parameters });
				}
			}
			catch (pError)
			{
				tmpResult.error = pError;
				tmpResult.value = false;
				tmpResult.executed = true;
			}
			return fCallback();
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
