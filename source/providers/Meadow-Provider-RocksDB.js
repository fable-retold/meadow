// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/

/**
* Meadow RocksDB Provider
*
* Implements Meadow's CRUD interface for RocksDB key-value storage.
* Processes FoxHound filter arrays directly with an in-memory filter engine.
* No FoxHound dialect dependency required.
*
* Key Design:
*   GUID mode (default): M-E-{Scope}-{GUID}
*   ID mode:             M-EBI-{Scope}-{ID}
*   Sequence counter:    M-SEQ-{Scope}
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

		if (_Fable.settings.RocksDB)
		{
			_GlobalLogLevel = _Fable.settings.RocksDB.GlobalLogLevel || 0;
		}

		// Key mode configuration: 'GUID' (default) or 'ID'
		var _KeyMode = (_Fable.settings.RocksDB && _Fable.settings.RocksDB.KeyMode === 'ID') ? 'ID' : 'GUID';

		// Schema state (set by Meadow via setSchema)
		var _Scope = 'Unknown';
		var _Schema = [];
		var _DefaultIdentifier = 'ID';
		var _DefaultGUIdentifier = 'GUID';

		/**
		 * Set the schema information (called by Meadow.updateProviderState)
		 */
		var setSchema = function (pScope, pSchema, pDefaultIdentifier, pDefaultGUIdentifier)
		{
			_Scope = pScope || 'Unknown';
			_Schema = Array.isArray(pSchema) ? pSchema : [];
			_DefaultIdentifier = pDefaultIdentifier || ('ID' + _Scope);
			_DefaultGUIdentifier = pDefaultGUIdentifier || ('GUID' + _Scope);
		};


		// ============================================================
		// Schema Helpers
		// ============================================================

		/**
		 * Find a schema entry by column name.
		 */
		var findSchemaEntry = function (pColumnName)
		{
			for (var i = 0; i < _Schema.length; i++)
			{
				if (_Schema[i].Column === pColumnName)
				{
					return _Schema[i];
				}
			}
			return { Column: pColumnName, Type: 'Default' };
		};

		/**
		 * Strip table prefix from a column name (e.g., "FableTest.Name" -> "Name")
		 */
		var stripTablePrefix = function (pColumnName)
		{
			if (typeof pColumnName !== 'string') return pColumnName;
			var tmpDotIndex = pColumnName.indexOf('.');
			if (tmpDotIndex > -1)
			{
				return pColumnName.substring(tmpDotIndex + 1);
			}
			return pColumnName;
		};


		// ============================================================
		// Key Generation
		// ============================================================

		/**
		 * Build the RocksDB key for a record
		 */
		var buildRecordKey = function (pScope, pRecord)
		{
			if (_KeyMode === 'GUID' && _DefaultGUIdentifier && pRecord[_DefaultGUIdentifier])
			{
				return 'M-E-' + pScope + '-' + pRecord[_DefaultGUIdentifier];
			}
			else
			{
				return 'M-EBI-' + pScope + '-' + pRecord[_DefaultIdentifier];
			}
		};

		/**
		 * Build prefix for scanning all records of a scope
		 */
		var buildScanPrefix = function (pScope)
		{
			return (_KeyMode === 'GUID') ? 'M-E-' + pScope + '-' : 'M-EBI-' + pScope + '-';
		};

		/**
		 * Build the auto-increment counter key
		 */
		var buildSequenceKey = function (pScope)
		{
			return 'M-SEQ-' + pScope;
		};


		// ============================================================
		// Database Access
		// ============================================================

		/**
		 * Get the RocksDB database instance from the connection service.
		 */
		var getDB = function ()
		{
			if (typeof (_Fable.MeadowRocksDBProvider) == 'object' && _Fable.MeadowRocksDBProvider.connected)
			{
				return _Fable.MeadowRocksDBProvider.db;
			}
			return false;
		};

		var getProvider = function ()
		{
			if (typeof (_Fable.MeadowRocksDBProvider) == 'object')
			{
				return _Fable.MeadowRocksDBProvider;
			}
			return false;
		};


		// ============================================================
		// Auto-Increment Sequence
		// ============================================================

		/**
		 * Get the next auto-increment sequence value for an entity scope.
		 */
		var getNextSequence = function (pDB, pScope, fCallback)
		{
			var tmpSeqKey = buildSequenceKey(pScope);
			pDB.get(tmpSeqKey, function (pError, pValue)
			{
				var tmpNext = 1;
				if (!pError && pValue)
				{
					tmpNext = parseInt(pValue.toString(), 10) + 1;
				}
				pDB.put(tmpSeqKey, String(tmpNext), function (pPutError)
				{
					return fCallback(pPutError, tmpNext);
				});
			});
		};


		// ============================================================
		// Document Building (replaces MongoDB dialect logic)
		// ============================================================

		/**
		 * Build the create document from the query's marshalled records.
		 * Handles AutoIdentity, AutoGUID, CreateDate, UpdateDate, etc.
		 */
		var buildCreateDocument = function (pQuery)
		{
			var tmpRecords = pQuery.parameters.query.records;
			if (!Array.isArray(tmpRecords) || tmpRecords.length < 1)
			{
				return false;
			}

			var tmpDocument = {};
			var tmpRecord = tmpRecords[0];

			for (var tmpColumn in tmpRecord)
			{
				if (!tmpRecord.hasOwnProperty(tmpColumn))
				{
					continue;
				}

				var tmpSchemaEntry = findSchemaEntry(tmpColumn);

				// Skip delete columns on create (unless delete tracking is disabled)
				if (!pQuery.parameters.query.disableDeleteTracking)
				{
					if (tmpSchemaEntry.Type === 'DeleteDate' ||
						tmpSchemaEntry.Type === 'DeleteIDUser')
					{
						continue;
					}
				}

				switch (tmpSchemaEntry.Type)
				{
					case 'AutoIdentity':
						if (pQuery.parameters.query.disableAutoIdentity)
						{
							tmpDocument[tmpColumn] = tmpRecord[tmpColumn];
						}
						else
						{
							tmpDocument[tmpColumn] = '$$AUTOINCREMENT';
						}
						break;
					case 'AutoGUID':
						if (pQuery.parameters.query.disableAutoIdentity)
						{
							tmpDocument[tmpColumn] = tmpRecord[tmpColumn];
						}
						else if (tmpRecord[tmpColumn] &&
								tmpRecord[tmpColumn].length >= 5 &&
								tmpRecord[tmpColumn] !== '0x0000000000000000')
						{
							tmpDocument[tmpColumn] = tmpRecord[tmpColumn];
						}
						else
						{
							tmpDocument[tmpColumn] = pQuery.parameters.query.UUID;
						}
						break;
					case 'UpdateDate':
					case 'CreateDate':
						if (pQuery.parameters.query.disableAutoDateStamp)
						{
							tmpDocument[tmpColumn] = tmpRecord[tmpColumn];
						}
						else
						{
							tmpDocument[tmpColumn] = new Date().toISOString();
						}
						break;
					case 'DeleteIDUser':
					case 'UpdateIDUser':
					case 'CreateIDUser':
						if (pQuery.parameters.query.disableAutoUserStamp)
						{
							tmpDocument[tmpColumn] = tmpRecord[tmpColumn];
						}
						else
						{
							tmpDocument[tmpColumn] = pQuery.parameters.query.IDUser;
						}
						break;
					case 'Deleted':
						if (pQuery.parameters.query.disableDeleteTracking)
						{
							tmpDocument[tmpColumn] = tmpRecord[tmpColumn];
						}
						else
						{
							tmpDocument[tmpColumn] = 0;
						}
						break;
					default:
						tmpDocument[tmpColumn] = tmpRecord[tmpColumn];
						break;
				}
			}

			return tmpDocument;
		};

		/**
		 * Build the update $set fields from the query's marshalled records.
		 * Skips identity, create, and delete columns.
		 */
		var buildUpdateFields = function (pQuery)
		{
			var tmpRecords = pQuery.parameters.query.records;
			if (!Array.isArray(tmpRecords) || tmpRecords.length < 1)
			{
				return false;
			}

			var tmpUpdateDoc = {};
			var tmpRecord = tmpRecords[0];

			for (var tmpColumn in tmpRecord)
			{
				if (!tmpRecord.hasOwnProperty(tmpColumn))
				{
					continue;
				}

				var tmpSchemaEntry = findSchemaEntry(tmpColumn);

				// Skip columns that shouldn't be updated
				switch (tmpSchemaEntry.Type)
				{
					case 'AutoIdentity':
					case 'AutoGUID':
					case 'CreateDate':
					case 'CreateIDUser':
					case 'DeleteDate':
					case 'DeleteIDUser':
						continue;
				}

				switch (tmpSchemaEntry.Type)
				{
					case 'UpdateDate':
						if (!pQuery.parameters.query.disableAutoDateStamp)
						{
							tmpUpdateDoc[tmpColumn] = new Date().toISOString();
						}
						break;
					case 'UpdateIDUser':
						if (!pQuery.parameters.query.disableAutoUserStamp)
						{
							tmpUpdateDoc[tmpColumn] = pQuery.parameters.query.IDUser;
						}
						break;
					default:
						tmpUpdateDoc[tmpColumn] = tmpRecord[tmpColumn];
						break;
				}
			}

			return tmpUpdateDoc;
		};

		/**
		 * Build the soft-delete field updates.
		 */
		var buildDeleteSetters = function (pQuery)
		{
			if (pQuery.parameters.query.disableDeleteTracking)
			{
				return false;
			}

			var tmpHasDeletedField = false;
			var tmpSetters = {};

			for (var i = 0; i < _Schema.length; i++)
			{
				var tmpSchemaEntry = _Schema[i];
				switch (tmpSchemaEntry.Type)
				{
					case 'Deleted':
						tmpSetters[tmpSchemaEntry.Column] = 1;
						tmpHasDeletedField = true;
						break;
					case 'DeleteDate':
						tmpSetters[tmpSchemaEntry.Column] = new Date().toISOString();
						break;
					case 'UpdateDate':
						tmpSetters[tmpSchemaEntry.Column] = new Date().toISOString();
						break;
					case 'DeleteIDUser':
						tmpSetters[tmpSchemaEntry.Column] = pQuery.parameters.query.IDUser;
						break;
					default:
						continue;
				}
			}

			if (!tmpHasDeletedField || Object.keys(tmpSetters).length === 0)
			{
				return false;
			}

			return tmpSetters;
		};

		/**
		 * Build the undelete field updates.
		 */
		var buildUndeleteSetters = function (pQuery)
		{
			var tmpHasDeletedField = false;
			var tmpSetters = {};

			for (var i = 0; i < _Schema.length; i++)
			{
				var tmpSchemaEntry = _Schema[i];
				switch (tmpSchemaEntry.Type)
				{
					case 'Deleted':
						tmpSetters[tmpSchemaEntry.Column] = 0;
						tmpHasDeletedField = true;
						break;
					case 'UpdateDate':
						tmpSetters[tmpSchemaEntry.Column] = new Date().toISOString();
						break;
					case 'UpdateIDUser':
						tmpSetters[tmpSchemaEntry.Column] = pQuery.parameters.query.IDUser;
						break;
					default:
						continue;
				}
			}

			if (!tmpHasDeletedField || Object.keys(tmpSetters).length === 0)
			{
				return false;
			}

			return tmpSetters;
		};


		// ============================================================
		// In-Memory Filter Engine
		// ============================================================

		/**
		 * Build the filter array from query parameters, adding Deleted=0 if needed.
		 */
		var buildFilterArray = function (pQuery, pDisableDeleteTracking)
		{
			var tmpFilter = Array.isArray(pQuery.parameters.filter) ? pQuery.parameters.filter.slice() : [];

			// Auto-add Deleted filter if applicable
			var tmpDisableDeleteTracking = pDisableDeleteTracking || pQuery.parameters.query.disableDeleteTracking;
			if (!tmpDisableDeleteTracking)
			{
				for (var i = 0; i < _Schema.length; i++)
				{
					if (_Schema[i].Type === 'Deleted')
					{
						// Check if a Deleted filter already exists
						var tmpHasDeletedParam = false;
						for (var x = 0; x < tmpFilter.length; x++)
						{
							if (stripTablePrefix(tmpFilter[x].Column) === _Schema[i].Column)
							{
								tmpHasDeletedParam = true;
								break;
							}
						}
						if (!tmpHasDeletedParam)
						{
							tmpFilter.push({
								Column: _Schema[i].Column,
								Operator: '=',
								Value: 0,
								Connector: 'AND',
								Parameter: 'Deleted'
							});
						}
						break;
					}
				}
			}

			return tmpFilter;
		};

		/**
		 * Evaluate a single filter entry against a record.
		 */
		var evaluateFilterEntry = function (pEntry, pRecord)
		{
			var tmpColumn = stripTablePrefix(pEntry.Column);
			var tmpValue = pRecord[tmpColumn];
			var tmpExpected = pEntry.Value;

			switch (pEntry.Operator)
			{
				case '=':
					// eslint-disable-next-line eqeqeq
					return tmpValue == tmpExpected;
				case '!=':
					// eslint-disable-next-line eqeqeq
					return tmpValue != tmpExpected;
				case '>':
					return tmpValue > tmpExpected;
				case '>=':
					return tmpValue >= tmpExpected;
				case '<':
					return tmpValue < tmpExpected;
				case '<=':
					return tmpValue <= tmpExpected;
				case 'LIKE':
					// Convert SQL LIKE pattern to regex: % -> .*, _ -> .
					var tmpPattern = String(tmpExpected).replace(/%/g, '.*').replace(/_/g, '.');
					try
					{
						var tmpRegex = new RegExp('^' + tmpPattern + '$', 'i');
						return tmpRegex.test(String(tmpValue || ''));
					}
					catch (pError)
					{
						return false;
					}
				case 'IN':
					if (!Array.isArray(tmpExpected))
					{
						return false;
					}
					for (var i = 0; i < tmpExpected.length; i++)
					{
						// eslint-disable-next-line eqeqeq
						if (tmpValue == tmpExpected[i])
						{
							return true;
						}
					}
					return false;
				case 'NOT IN':
					if (!Array.isArray(tmpExpected))
					{
						return true;
					}
					for (var n = 0; n < tmpExpected.length; n++)
					{
						// eslint-disable-next-line eqeqeq
						if (tmpValue == tmpExpected[n])
						{
							return false;
						}
					}
					return true;
				case 'IS NULL':
					return (tmpValue === null || tmpValue === undefined);
				case 'IS NOT NULL':
					return (tmpValue !== null && tmpValue !== undefined);
				case '(':
				case ')':
					// Parenthetical grouping handled by evaluateFilterArray
					return true;
				default:
					// Unknown operator, treat as equality
					// eslint-disable-next-line eqeqeq
					return tmpValue == tmpExpected;
			}
		};

		/**
		 * Evaluate a FoxHound filter array against a record.
		 * Supports AND/OR connectors and parenthetical grouping.
		 */
		var evaluateFilterArray = function (pFilterArray, pRecord)
		{
			if (!pFilterArray || pFilterArray.length === 0)
			{
				return true;
			}

			// Stack-based processing for parenthetical groups
			var tmpStack = [[]]; // Stack of condition result arrays

			for (var i = 0; i < pFilterArray.length; i++)
			{
				var tmpEntry = pFilterArray[i];

				if (tmpEntry.Operator === '(')
				{
					tmpStack.push([]);
				}
				else if (tmpEntry.Operator === ')')
				{
					var tmpGroupResults = tmpStack.pop();
					var tmpGroupResult = resolveConditionGroup(tmpGroupResults);
					tmpStack[tmpStack.length - 1].push({
						result: tmpGroupResult,
						connector: tmpEntry.Connector || 'AND'
					});
				}
				else
				{
					var tmpResult = evaluateFilterEntry(tmpEntry, pRecord);
					tmpStack[tmpStack.length - 1].push({
						result: tmpResult,
						connector: tmpEntry.Connector || 'AND'
					});
				}
			}

			return resolveConditionGroup(tmpStack[0]);
		};

		/**
		 * Resolve a group of condition results using AND/OR logic.
		 */
		var resolveConditionGroup = function (pConditions)
		{
			if (!pConditions || pConditions.length === 0)
			{
				return true;
			}

			// Start with the first condition's result
			var tmpResult = pConditions[0].result;

			for (var i = 1; i < pConditions.length; i++)
			{
				var tmpConnector = pConditions[i].connector || 'AND';
				if (tmpConnector === 'OR')
				{
					tmpResult = tmpResult || pConditions[i].result;
				}
				else
				{
					tmpResult = tmpResult && pConditions[i].result;
				}
			}

			return tmpResult;
		};


		// ============================================================
		// Prefix Scanning
		// ============================================================

		/**
		 * Scan all records with a given prefix and collect them.
		 */
		var scanPrefix = function (pDB, pPrefix, fCallback)
		{
			var tmpResults = [];
			var tmpIterator = pDB.iterator({
				gte: pPrefix,
				lt: pPrefix + '\uffff',
				keyAsBuffer: false,
				valueAsBuffer: false
			});

			function readNext()
			{
				tmpIterator.next(function (pError, pKey, pValue)
				{
					if (pError)
					{
						return tmpIterator.end(function ()
						{
							return fCallback(pError, tmpResults);
						});
					}
					if (pKey === undefined)
					{
						// End of iteration
						return tmpIterator.end(function ()
						{
							return fCallback(null, tmpResults);
						});
					}

					try
					{
						var tmpRecord = JSON.parse(pValue.toString());
						tmpRecord._rocksdb_key = pKey.toString();
						tmpResults.push(tmpRecord);
					}
					catch (pParseError)
					{
						_Fable.log.error('RocksDB: Failed to parse record at key [' + pKey + ']: ' + pParseError);
					}
					readNext();
				});
			}
			readNext();
		};


		// ============================================================
		// Sorting and Pagination
		// ============================================================

		/**
		 * Sort records in-memory using the FoxHound sort array.
		 */
		var applySort = function (pRecords, pSortArray)
		{
			if (!Array.isArray(pSortArray) || pSortArray.length === 0)
			{
				return pRecords;
			}

			pRecords.sort(function (pA, pB)
			{
				for (var s = 0; s < pSortArray.length; s++)
				{
					var tmpCol = stripTablePrefix(pSortArray[s].Column);
					var tmpDir = (pSortArray[s].Direction === 'Descending') ? -1 : 1;
					var tmpValA = pA[tmpCol];
					var tmpValB = pB[tmpCol];

					if (tmpValA === undefined || tmpValA === null) tmpValA = '';
					if (tmpValB === undefined || tmpValB === null) tmpValB = '';

					if (tmpValA < tmpValB) return -1 * tmpDir;
					if (tmpValA > tmpValB) return 1 * tmpDir;
				}
				return 0;
			});

			return pRecords;
		};

		/**
		 * Apply pagination (skip + limit).
		 */
		var applyPagination = function (pRecords, pBegin, pCap)
		{
			var tmpStart = (pBegin !== false && pBegin > 0) ? pBegin : 0;
			if (pCap)
			{
				return pRecords.slice(tmpStart, tmpStart + pCap);
			}
			if (tmpStart > 0)
			{
				return pRecords.slice(tmpStart);
			}
			return pRecords;
		};


		// ============================================================
		// Read Records Helper (scan + filter + sort + paginate)
		// ============================================================

		/**
		 * Read matching records for a Read or Count operation.
		 */
		var readMatchingRecords = function (pDB, pScope, pFilterArray, pSortArray, pBegin, pCap, fCallback)
		{
			var tmpPrefix = buildScanPrefix(pScope);
			scanPrefix(pDB, tmpPrefix, function (pScanError, pRecords)
			{
				if (pScanError)
				{
					return fCallback(pScanError, []);
				}

				// Apply filter
				var tmpFiltered = [];
				for (var i = 0; i < pRecords.length; i++)
				{
					if (evaluateFilterArray(pFilterArray, pRecords[i]))
					{
						tmpFiltered.push(pRecords[i]);
					}
				}

				// Apply sort
				tmpFiltered = applySort(tmpFiltered, pSortArray);

				// Apply pagination
				tmpFiltered = applyPagination(tmpFiltered, pBegin, pCap);

				return fCallback(null, tmpFiltered);
			});
		};


		// ============================================================
		// Marshal
		// ============================================================

		var marshalRecordFromSourceToObject = function (pObject, pRecord)
		{
			for (var tmpColumn in pRecord)
			{
				// Skip internal RocksDB key tracking field
				if (tmpColumn === '_rocksdb_key')
				{
					continue;
				}
				pObject[tmpColumn] = pRecord[tmpColumn];
			}
		};


		// ============================================================
		// CRUD Operations
		// ============================================================

		var Create = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace('RocksDB Create', { scope: _Scope });
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No RocksDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpDocument = buildCreateDocument(pQuery);
			if (!tmpDocument)
			{
				tmpResult.error = new Error('No RocksDB document generated for Create.');
				tmpResult.executed = true;
				return fCallback();
			}

			// Check for $$AUTOINCREMENT sentinel
			var tmpAutoIncrementColumn = false;
			for (var tmpKey in tmpDocument)
			{
				if (tmpDocument[tmpKey] === '$$AUTOINCREMENT')
				{
					tmpAutoIncrementColumn = tmpKey;
					break;
				}
			}

			var doInsert = function (pAutoIncrementValue)
			{
				if (tmpAutoIncrementColumn && pAutoIncrementValue)
				{
					tmpDocument[tmpAutoIncrementColumn] = pAutoIncrementValue;
				}

				var tmpRecordKey = buildRecordKey(_Scope, tmpDocument);
				var tmpRecordValue = JSON.stringify(tmpDocument);

				tmpDB.put(tmpRecordKey, tmpRecordValue, function (pPutError)
				{
					if (pPutError)
					{
						tmpResult.error = pPutError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpResult.error = null;
					tmpResult.value = pAutoIncrementValue || tmpDocument[_DefaultIdentifier];
					tmpResult.executed = true;
					return fCallback();
				});
			};

			if (tmpAutoIncrementColumn)
			{
				getNextSequence(tmpDB, _Scope, function (pSeqError, pSeqValue)
				{
					if (pSeqError)
					{
						tmpResult.error = pSeqError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}
					doInsert(pSeqValue);
				});
			}
			else
			{
				doInsert();
			}
		};


		var Read = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace('RocksDB Read', { scope: _Scope, filter: pQuery.parameters.filter });
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No RocksDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpFilterArray = buildFilterArray(pQuery);
			var tmpSortArray = pQuery.parameters.sort || false;
			var tmpBegin = pQuery.parameters.begin;
			var tmpCap = pQuery.parameters.cap;

			readMatchingRecords(tmpDB, _Scope, tmpFilterArray, tmpSortArray, tmpBegin, tmpCap, function (pReadError, pRecords)
			{
				if (pReadError)
				{
					tmpResult.error = pReadError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				}

				// Strip internal keys before returning
				for (var i = 0; i < pRecords.length; i++)
				{
					delete pRecords[i]._rocksdb_key;
				}

				tmpResult.error = null;
				tmpResult.value = pRecords;
				tmpResult.executed = true;
				return fCallback();
			});
		};


		var Update = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace('RocksDB Update', { scope: _Scope, filter: pQuery.parameters.filter });
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No RocksDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpUpdateFields = buildUpdateFields(pQuery);
			if (!tmpUpdateFields || Object.keys(tmpUpdateFields).length === 0)
			{
				tmpResult.error = null;
				tmpResult.value = 0;
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpFilterArray = buildFilterArray(pQuery);

			// Read all matching records (no sort/pagination needed for update)
			readMatchingRecords(tmpDB, _Scope, tmpFilterArray, false, false, false, function (pReadError, pRecords)
			{
				if (pReadError)
				{
					tmpResult.error = pReadError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				}

				if (pRecords.length === 0)
				{
					tmpResult.error = null;
					tmpResult.value = 0;
					tmpResult.executed = true;
					return fCallback();
				}

				// Build batch of updates
				var tmpBatchOps = [];
				for (var i = 0; i < pRecords.length; i++)
				{
					var tmpRecord = pRecords[i];
					var tmpRecordKey = tmpRecord._rocksdb_key;

					// Apply update fields
					for (var tmpCol in tmpUpdateFields)
					{
						if (tmpUpdateFields.hasOwnProperty(tmpCol))
						{
							tmpRecord[tmpCol] = tmpUpdateFields[tmpCol];
						}
					}

					// Remove internal key before storing
					delete tmpRecord._rocksdb_key;

					tmpBatchOps.push({
						type: 'put',
						key: tmpRecordKey,
						value: JSON.stringify(tmpRecord)
					});
				}

				tmpDB.batch(tmpBatchOps, function (pBatchError)
				{
					if (pBatchError)
					{
						tmpResult.error = pBatchError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpResult.error = null;
					// Return as an object (Meadow-Update behavior checks typeof === 'object')
					tmpResult.value = { changes: pRecords.length };
					tmpResult.executed = true;
					return fCallback();
				});
			});
		};


		var Delete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace('RocksDB Delete', { scope: _Scope, filter: pQuery.parameters.filter });
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No RocksDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpDeleteSetters = buildDeleteSetters(pQuery);
			var tmpFilterArray = buildFilterArray(pQuery);

			if (tmpDeleteSetters)
			{
				// Soft delete — update matched records with delete fields
				readMatchingRecords(tmpDB, _Scope, tmpFilterArray, false, false, false, function (pReadError, pRecords)
				{
					if (pReadError)
					{
						tmpResult.error = pReadError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					if (pRecords.length === 0)
					{
						tmpResult.error = null;
						tmpResult.value = 0;
						tmpResult.executed = true;
						return fCallback();
					}

					var tmpBatchOps = [];
					for (var i = 0; i < pRecords.length; i++)
					{
						var tmpRecord = pRecords[i];
						var tmpRecordKey = tmpRecord._rocksdb_key;
						for (var tmpCol in tmpDeleteSetters)
						{
							if (tmpDeleteSetters.hasOwnProperty(tmpCol))
							{
								tmpRecord[tmpCol] = tmpDeleteSetters[tmpCol];
							}
						}
						delete tmpRecord._rocksdb_key;
						tmpBatchOps.push({
							type: 'put',
							key: tmpRecordKey,
							value: JSON.stringify(tmpRecord)
						});
					}

					tmpDB.batch(tmpBatchOps, function (pBatchError)
					{
						if (pBatchError)
						{
							tmpResult.error = pBatchError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						}

						tmpResult.error = null;
						tmpResult.value = pRecords.length;
						tmpResult.executed = true;
						return fCallback();
					});
				});
			}
			else
			{
				// Hard delete — remove matched records from RocksDB
				readMatchingRecords(tmpDB, _Scope, tmpFilterArray, false, false, false, function (pReadError, pRecords)
				{
					if (pReadError)
					{
						tmpResult.error = pReadError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					if (pRecords.length === 0)
					{
						tmpResult.error = null;
						tmpResult.value = 0;
						tmpResult.executed = true;
						return fCallback();
					}

					var tmpBatchOps = [];
					for (var i = 0; i < pRecords.length; i++)
					{
						tmpBatchOps.push({
							type: 'del',
							key: pRecords[i]._rocksdb_key
						});
					}

					tmpDB.batch(tmpBatchOps, function (pBatchError)
					{
						if (pBatchError)
						{
							tmpResult.error = pBatchError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						}

						tmpResult.error = null;
						tmpResult.value = pRecords.length;
						tmpResult.executed = true;
						return fCallback();
					});
				});
			}
		};


		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace('RocksDB Undelete', { scope: _Scope, filter: pQuery.parameters.filter });
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No RocksDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpUndeleteSetters = buildUndeleteSetters(pQuery);
			if (!tmpUndeleteSetters)
			{
				// No Deleted column in schema — nothing to undelete
				tmpResult.error = null;
				tmpResult.value = 0;
				tmpResult.executed = true;
				return fCallback();
			}

			// Build filter with delete tracking disabled so we can find Deleted=1 records
			var tmpFilterArray = buildFilterArray(pQuery, true);

			readMatchingRecords(tmpDB, _Scope, tmpFilterArray, false, false, false, function (pReadError, pRecords)
			{
				if (pReadError)
				{
					tmpResult.error = pReadError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				}

				if (pRecords.length === 0)
				{
					tmpResult.error = null;
					tmpResult.value = 0;
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpBatchOps = [];
				for (var i = 0; i < pRecords.length; i++)
				{
					var tmpRecord = pRecords[i];
					var tmpRecordKey = tmpRecord._rocksdb_key;
					for (var tmpCol in tmpUndeleteSetters)
					{
						if (tmpUndeleteSetters.hasOwnProperty(tmpCol))
						{
							tmpRecord[tmpCol] = tmpUndeleteSetters[tmpCol];
						}
					}
					delete tmpRecord._rocksdb_key;
					tmpBatchOps.push({
						type: 'put',
						key: tmpRecordKey,
						value: JSON.stringify(tmpRecord)
					});
				}

				tmpDB.batch(tmpBatchOps, function (pBatchError)
				{
					if (pBatchError)
					{
						tmpResult.error = pBatchError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpResult.error = null;
					tmpResult.value = pRecords.length;
					tmpResult.executed = true;
					return fCallback();
				});
			});
		};


		var Count = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
			{
				_Fable.log.trace('RocksDB Count', { scope: _Scope, filter: pQuery.parameters.filter });
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No RocksDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpFilterArray = buildFilterArray(pQuery);

			// Scan and count (no sort/pagination needed for count)
			readMatchingRecords(tmpDB, _Scope, tmpFilterArray, false, false, false, function (pReadError, pRecords)
			{
				if (pReadError)
				{
					tmpResult.error = pReadError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				}

				tmpResult.error = null;
				tmpResult.value = pRecords.length;
				tmpResult.executed = true;
				return fCallback();
			});
		};


		// ============================================================
		// Provider Export
		// ============================================================

		var tmpNewProvider = (
			{
				marshalRecordFromSourceToObject: marshalRecordFromSourceToObject,

				Create: Create,
				Read: Read,
				Update: Update,
				Delete: Delete,
				Undelete: Undelete,
				Count: Count,

				setSchema: setSchema,

				getProvider: getProvider,
				providerCreatesSupported: true,

				new: createNew
			});


		return tmpNewProvider;
	}

	return createNew();
};

module.exports = new MeadowProvider();
