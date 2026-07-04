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
		if (_Fable.settings.MongoDB)
		{
			_GlobalLogLevel = _Fable.settings.MongoDB.GlobalLogLevel || 0;
		}

		/**
		 * Get the MongoDB Db instance from the connection service.
		 */
		var getDB = function ()
		{
			if (typeof (_Fable.MeadowMongoDBProvider) == 'object' && _Fable.MeadowMongoDBProvider.connected)
			{
				return _Fable.MeadowMongoDBProvider.pool;
			}
			return false;
		};

		var getProvider = function ()
		{
			if (typeof (_Fable.MeadowMongoDBProvider) == 'object')
			{
				return _Fable.MeadowMongoDBProvider;
			}
			return false;
		};

		/**
		 * Deep-walk an object and replace $$NOW sentinels with new Date().
		 *
		 * @param {Object} pObj Object to process (mutated in place)
		 * @return {Object} The same object with sentinels replaced
		 */
		var replaceSentinels = function (pObj)
		{
			if (typeof pObj !== 'object' || pObj === null)
			{
				return pObj;
			}

			for (var tmpKey in pObj)
			{
				if (!pObj.hasOwnProperty(tmpKey))
				{
					continue;
				}

				if (pObj[tmpKey] === '$$NOW')
				{
					pObj[tmpKey] = new Date();
				}
				else if (typeof pObj[tmpKey] === 'object' && pObj[tmpKey] !== null)
				{
					replaceSentinels(pObj[tmpKey]);
				}
			}
			return pObj;
		};

		/**
		 * Get the next auto-increment sequence value for a collection/column pair.
		 * Uses the _meadow_counters collection with atomic findOneAndUpdate.
		 *
		 * @param {Object} pDB MongoDB Db instance
		 * @param {String} pScope Collection name
		 * @param {String} pIDColumn Identity column name
		 * @param {Function} fCallback (error, nextSequenceValue)
		 */
		var getNextSequence = function (pDB, pScope, pIDColumn, fCallback)
		{
			var tmpCounterKey = pScope + '.' + pIDColumn;
			pDB.collection('_meadow_counters').findOneAndUpdate(
				{ _id: tmpCounterKey },
				{ $inc: { seq: 1 } },
				{ upsert: true, returnDocument: 'after' }
			)
			.then(function (pResult)
			{
				return fCallback(null, pResult.seq);
			})
			.catch(function (pError)
			{
				return fCallback(pError);
			});
		};

		// The Meadow marshaller also passes in the Schema as the third parameter
		var marshalRecordFromSourceToObject = function (pObject, pRecord)
		{
			for (var tmpColumn in pRecord)
			{
				// Skip MongoDB's internal _id field
				if (tmpColumn === '_id')
				{
					continue;
				}
				pObject[tmpColumn] = pRecord[tmpColumn];
			}
		};

		var Create = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MongoDB').buildCreateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No MongoDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.mongoOperation;
			if (!tmpOp)
			{
				tmpResult.error = new Error('No MongoDB operation generated.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpCollection = tmpDB.collection(tmpOp.collection);
			var tmpDocument = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.document)));

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

			if (tmpAutoIncrementColumn)
			{
				// Get next sequence, then insert
				getNextSequence(tmpDB, tmpOp.collection, tmpAutoIncrementColumn, function (pSeqError, pSeqValue)
				{
					if (pSeqError)
					{
						tmpResult.error = pSeqError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpDocument[tmpAutoIncrementColumn] = pSeqValue;

					tmpCollection.insertOne(tmpDocument)
						.then(function (pInsertResult)
						{
							tmpResult.error = null;
							tmpResult.value = pSeqValue;
							tmpResult.executed = true;
							return fCallback();
						})
						.catch(function (pError)
						{
							tmpResult.error = pError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						});
				});
			}
			else
			{
				tmpCollection.insertOne(tmpDocument)
					.then(function (pInsertResult)
					{
						tmpResult.error = null;
						tmpResult.value = pInsertResult.insertedId;
						tmpResult.executed = true;
						return fCallback();
					})
					.catch(function (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					});
			}
		};

		var Read = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MongoDB').buildReadQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No MongoDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.mongoOperation;
			var tmpCollection = tmpDB.collection(tmpOp.collection);

			var tmpOptions = {};
			if (tmpOp.projection && Object.keys(tmpOp.projection).length > 0)
			{
				tmpOptions.projection = tmpOp.projection;
			}
			if (tmpOp.sort && Object.keys(tmpOp.sort).length > 0)
			{
				tmpOptions.sort = tmpOp.sort;
			}
			if (tmpOp.skip)
			{
				tmpOptions.skip = tmpOp.skip;
			}
			if (tmpOp.limit)
			{
				tmpOptions.limit = tmpOp.limit;
			}

			tmpCollection.find(tmpOp.filter, tmpOptions).toArray()
				.then(function (pDocs)
				{
					tmpResult.error = null;
					tmpResult.value = pDocs;
					tmpResult.executed = true;
					return fCallback();
				})
				.catch(function (pError)
				{
					tmpResult.error = pError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var Update = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MongoDB').buildUpdateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No MongoDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.mongoOperation;
			if (!tmpOp)
			{
				tmpResult.error = new Error('No MongoDB operation generated.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpCollection = tmpDB.collection(tmpOp.collection);
			var tmpUpdate = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.update)));

			tmpCollection.updateMany(tmpOp.filter, tmpUpdate)
				.then(function (pUpdateResult)
				{
					tmpResult.error = null;
					tmpResult.value = pUpdateResult;
					tmpResult.executed = true;
					return fCallback();
				})
				.catch(function (pError)
				{
					tmpResult.error = pError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var Delete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MongoDB').buildDeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No MongoDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.mongoOperation;
			var tmpCollection = tmpDB.collection(tmpOp.collection);

			if (tmpOp.operation === 'updateMany')
			{
				// Soft delete
				var tmpUpdate = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.update)));
				tmpCollection.updateMany(tmpOp.filter, tmpUpdate)
					.then(function (pUpdateResult)
					{
						tmpResult.error = null;
						tmpResult.value = pUpdateResult.modifiedCount;
						tmpResult.executed = true;
						return fCallback();
					})
					.catch(function (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					});
			}
			else
			{
				// Hard delete
				tmpCollection.deleteMany(tmpOp.filter)
					.then(function (pDeleteResult)
					{
						tmpResult.error = null;
						tmpResult.value = pDeleteResult.deletedCount;
						tmpResult.executed = true;
						return fCallback();
					})
					.catch(function (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					});
			}
		};

		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MongoDB').buildUndeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No MongoDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.mongoOperation;
			if (!tmpOp || tmpOp.operation === 'noop')
			{
				tmpResult.error = null;
				tmpResult.value = 0;
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpCollection = tmpDB.collection(tmpOp.collection);
			var tmpUpdate = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.update)));

			tmpCollection.updateMany(tmpOp.filter, tmpUpdate)
				.then(function (pUpdateResult)
				{
					tmpResult.error = null;
					tmpResult.value = pUpdateResult.modifiedCount;
					tmpResult.executed = true;
					return fCallback();
				})
				.catch(function (pError)
				{
					tmpResult.error = pError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var Count = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('MongoDB').buildCountQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpDB = getDB();
			if (!tmpDB)
			{
				tmpResult.error = new Error('No MongoDB connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.mongoOperation;
			var tmpCollection = tmpDB.collection(tmpOp.collection);

			if (tmpOp.distinct && tmpOp.distinctFields && tmpOp.distinctFields.length > 0)
			{
				// Use aggregation pipeline for distinct count
				var tmpGroupId = {};
				for (var i = 0; i < tmpOp.distinctFields.length; i++)
				{
					tmpGroupId[tmpOp.distinctFields[i]] = '$' + tmpOp.distinctFields[i];
				}

				var tmpPipeline = [
					{ $match: tmpOp.filter },
					{ $group: { _id: tmpGroupId } },
					{ $count: 'RowCount' }
				];

				tmpCollection.aggregate(tmpPipeline).toArray()
					.then(function (pResults)
					{
						tmpResult.error = null;
						tmpResult.value = (pResults.length > 0) ? pResults[0].RowCount : 0;
						tmpResult.executed = true;
						return fCallback();
					})
					.catch(function (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					});
			}
			else
			{
				tmpCollection.countDocuments(tmpOp.filter)
					.then(function (pCount)
					{
						tmpResult.error = null;
						tmpResult.value = pCount;
						tmpResult.executed = true;
						return fCallback();
					})
					.catch(function (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					});
			}
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
