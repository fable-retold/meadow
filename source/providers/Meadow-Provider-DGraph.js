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
		if (_Fable.settings.DGraph)
		{
			_GlobalLogLevel = _Fable.settings.DGraph.GlobalLogLevel || 0;
		}

		/**
		 * Get the DGraph client from the connection service.
		 */
		var getClient = function ()
		{
			if (typeof (_Fable.MeadowDGraphProvider) == 'object' && _Fable.MeadowDGraphProvider.connected)
			{
				return _Fable.MeadowDGraphProvider.pool;
			}
			return false;
		};

		var getProvider = function ()
		{
			if (typeof (_Fable.MeadowDGraphProvider) == 'object')
			{
				return _Fable.MeadowDGraphProvider;
			}
			return false;
		};

		/**
		 * Deep-walk an object and replace $$NOW sentinels with ISO datetime strings.
		 * DGraph expects RFC3339/ISO8601 formatted datetime strings.
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
					pObj[tmpKey] = new Date().toISOString();
				}
				else if (typeof pObj[tmpKey] === 'object' && pObj[tmpKey] !== null)
				{
					replaceSentinels(pObj[tmpKey]);
				}
			}
			return pObj;
		};

		/**
		 * Get the next auto-increment sequence value for a type/column pair.
		 * Uses MeadowCounter nodes in DGraph with query-then-mutate.
		 *
		 * @param {Object} pClient DGraph client instance
		 * @param {String} pScope Type name
		 * @param {String} pIDColumn Identity column name
		 * @param {Function} fCallback (error, nextSequenceValue)
		 */
		var getNextSequence = function (pClient, pScope, pIDColumn, fCallback)
		{
			var tmpCounterKey = pScope + '.' + pIDColumn;

			// Query for existing counter
			var tmpQuery = '{ counter(func: eq(MeadowCounter.scope, "' + tmpCounterKey + '")) { uid MeadowCounter.sequence } }';
			var tmpTxn = pClient.newTxn();

			tmpTxn.query(tmpQuery)
				.then(function (pResponse)
				{
					var tmpData = pResponse.data || {};
					var tmpCounters = tmpData.counter || [];

					if (tmpCounters.length > 0)
					{
						// Counter exists, increment it
						var tmpCurrentSeq = tmpCounters[0]['MeadowCounter.sequence'] || 0;
						var tmpNextSeq = tmpCurrentSeq + 1;
						var tmpUid = tmpCounters[0].uid;

						var tmpMutation = {
							setJson: {
								uid: tmpUid,
								'MeadowCounter.sequence': tmpNextSeq
							}
						};

						return tmpTxn.mutate(tmpMutation)
							.then(function ()
							{
								return tmpTxn.commit();
							})
							.then(function ()
							{
								return fCallback(null, tmpNextSeq);
							});
					}
					else
					{
						// Create new counter with sequence=1
						var tmpMutation = {
							setJson: {
								'dgraph.type': 'MeadowCounter',
								'MeadowCounter.scope': tmpCounterKey,
								'MeadowCounter.sequence': 1
							}
						};

						return tmpTxn.mutate(tmpMutation)
							.then(function ()
							{
								return tmpTxn.commit();
							})
							.then(function ()
							{
								return fCallback(null, 1);
							});
					}
				})
				.catch(function (pError)
				{
					try { tmpTxn.discard(); } catch(e) {}
					return fCallback(pError);
				});
		};

		// The Meadow marshaller also passes in the Schema as the third parameter
		var marshalRecordFromSourceToObject = function (pObject, pRecord)
		{
			for (var tmpColumn in pRecord)
			{
				// Skip DGraph internal fields
				if (tmpColumn === 'uid' || tmpColumn === 'dgraph.type')
				{
					continue;
				}
				// Strip scope prefix from DGraph predicate names (e.g. "FableTest.IDAnimal" → "IDAnimal")
				var tmpFieldName = tmpColumn;
				var tmpDotIndex = tmpFieldName.indexOf('.');
				if (tmpDotIndex >= 0)
				{
					tmpFieldName = tmpFieldName.substring(tmpDotIndex + 1);
				}
				pObject[tmpFieldName] = pRecord[tmpColumn];
			}
		};

		var Create = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('DGraph').buildCreateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No DGraph connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.dgraphOperation;
			if (!tmpOp)
			{
				tmpResult.error = new Error('No DGraph operation generated.');
				tmpResult.executed = true;
				return fCallback();
			}

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
				getNextSequence(tmpClient, tmpOp.type, tmpAutoIncrementColumn, function (pSeqError, pSeqValue)
				{
					if (pSeqError)
					{
						tmpResult.error = pSeqError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpDocument[tmpAutoIncrementColumn] = pSeqValue;

					var tmpTxn = tmpClient.newTxn();
					tmpTxn.mutate({ setJson: tmpDocument })
						.then(function ()
						{
							return tmpTxn.commit();
						})
						.then(function ()
						{
							tmpResult.error = null;
							tmpResult.value = pSeqValue;
							tmpResult.executed = true;
							return fCallback();
						})
						.catch(function (pError)
						{
							try { tmpTxn.discard(); } catch(e) {}
							tmpResult.error = pError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						});
				});
			}
			else
			{
				var tmpTxn = tmpClient.newTxn();
				tmpTxn.mutate({ setJson: tmpDocument })
					.then(function (pMutateResult)
					{
						return tmpTxn.commit()
							.then(function ()
							{
								tmpResult.error = null;
								// Return the assigned UID(s)
								var tmpUids = pMutateResult.data && pMutateResult.data.uids;
								tmpResult.value = tmpUids ? tmpUids[Object.keys(tmpUids)[0]] : true;
								tmpResult.executed = true;
								return fCallback();
							});
					})
					.catch(function (pError)
					{
						try { tmpTxn.discard(); } catch(e) {}
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

			pQuery.setDialect('DGraph').buildReadQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No DGraph connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.dgraphOperation;
			var tmpTxn = tmpClient.newTxn({ readOnly: true });

			tmpTxn.query(tmpOp.query)
				.then(function (pResponse)
				{
					var tmpData = pResponse.data || {};
					tmpResult.error = null;
					tmpResult.value = tmpData[tmpOp.queryName] || [];
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

			pQuery.setDialect('DGraph').buildUpdateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No DGraph connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.dgraphOperation;
			if (!tmpOp)
			{
				tmpResult.error = new Error('No DGraph operation generated.');
				tmpResult.executed = true;
				return fCallback();
			}

			// First query for matching UIDs
			var tmpReadTxn = tmpClient.newTxn({ readOnly: true });
			tmpReadTxn.query(tmpOp.queryForUIDs)
				.then(function (pResponse)
				{
					var tmpData = pResponse.data || {};
					var tmpNodes = tmpData[tmpOp.queryName] || [];

					if (tmpNodes.length === 0)
					{
						tmpResult.error = null;
						tmpResult.value = 0;
						tmpResult.executed = true;
						return fCallback();
					}

					// Build mutation: set updated fields on each matching UID
					var tmpUpdateDoc = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.update)));
					var tmpMutations = [];
					for (var i = 0; i < tmpNodes.length; i++)
					{
						var tmpSetDoc = JSON.parse(JSON.stringify(tmpUpdateDoc));
						tmpSetDoc.uid = tmpNodes[i].uid;
						tmpMutations.push(tmpSetDoc);
					}

					var tmpWriteTxn = tmpClient.newTxn();
					tmpWriteTxn.mutate({ setJson: tmpMutations })
						.then(function ()
						{
							return tmpWriteTxn.commit();
						})
						.then(function ()
						{
							tmpResult.error = null;
							tmpResult.value = tmpMutations;
							tmpResult.executed = true;
							return fCallback();
						})
						.catch(function (pError)
						{
							try { tmpWriteTxn.discard(); } catch(e) {}
							tmpResult.error = pError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						});
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

			pQuery.setDialect('DGraph').buildDeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No DGraph connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.dgraphOperation;

			// First query for matching UIDs
			var tmpReadTxn = tmpClient.newTxn({ readOnly: true });
			tmpReadTxn.query(tmpOp.queryForUIDs)
				.then(function (pResponse)
				{
					var tmpData = pResponse.data || {};
					var tmpNodes = tmpData[tmpOp.queryName] || [];

					if (tmpNodes.length === 0)
					{
						tmpResult.error = null;
						tmpResult.value = 0;
						tmpResult.executed = true;
						return fCallback();
					}

					if (tmpOp.operation === 'upsert')
					{
						// Soft delete: update matching nodes with delete setters
						var tmpUpdateDoc = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.update)));
						var tmpMutations = [];
						for (var i = 0; i < tmpNodes.length; i++)
						{
							var tmpSetDoc = JSON.parse(JSON.stringify(tmpUpdateDoc));
							tmpSetDoc.uid = tmpNodes[i].uid;
							tmpMutations.push(tmpSetDoc);
						}

						var tmpWriteTxn = tmpClient.newTxn();
						tmpWriteTxn.mutate({ setJson: tmpMutations })
							.then(function ()
							{
								return tmpWriteTxn.commit();
							})
							.then(function ()
							{
								tmpResult.error = null;
								tmpResult.value = tmpNodes.length;
								tmpResult.executed = true;
								return fCallback();
							})
							.catch(function (pError)
							{
								try { tmpWriteTxn.discard(); } catch(e) {}
								tmpResult.error = pError;
								tmpResult.value = false;
								tmpResult.executed = true;
								return fCallback();
							});
					}
					else
					{
						// Hard delete: delete the nodes
						var tmpDeleteDocs = [];
						for (var j = 0; j < tmpNodes.length; j++)
						{
							tmpDeleteDocs.push({ uid: tmpNodes[j].uid });
						}

						var tmpWriteTxn = tmpClient.newTxn();
						tmpWriteTxn.mutate({ deleteJson: tmpDeleteDocs })
							.then(function ()
							{
								return tmpWriteTxn.commit();
							})
							.then(function ()
							{
								tmpResult.error = null;
								tmpResult.value = tmpNodes.length;
								tmpResult.executed = true;
								return fCallback();
							})
							.catch(function (pError)
							{
								try { tmpWriteTxn.discard(); } catch(e) {}
								tmpResult.error = pError;
								tmpResult.value = false;
								tmpResult.executed = true;
								return fCallback();
							});
					}
				})
				.catch(function (pError)
				{
					tmpResult.error = pError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('DGraph').buildUndeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No DGraph connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.dgraphOperation;
			if (!tmpOp || tmpOp.operation === 'noop')
			{
				tmpResult.error = null;
				tmpResult.value = 0;
				tmpResult.executed = true;
				return fCallback();
			}

			// Query for matching UIDs
			var tmpReadTxn = tmpClient.newTxn({ readOnly: true });
			tmpReadTxn.query(tmpOp.queryForUIDs)
				.then(function (pResponse)
				{
					var tmpData = pResponse.data || {};
					var tmpNodes = tmpData[tmpOp.queryName] || [];

					if (tmpNodes.length === 0)
					{
						tmpResult.error = null;
						tmpResult.value = 0;
						tmpResult.executed = true;
						return fCallback();
					}

					var tmpUpdateDoc = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.update)));
					var tmpMutations = [];
					for (var i = 0; i < tmpNodes.length; i++)
					{
						var tmpSetDoc = JSON.parse(JSON.stringify(tmpUpdateDoc));
						tmpSetDoc.uid = tmpNodes[i].uid;
						tmpMutations.push(tmpSetDoc);
					}

					var tmpWriteTxn = tmpClient.newTxn();
					tmpWriteTxn.mutate({ setJson: tmpMutations })
						.then(function ()
						{
							return tmpWriteTxn.commit();
						})
						.then(function ()
						{
							tmpResult.error = null;
							tmpResult.value = tmpNodes.length;
							tmpResult.executed = true;
							return fCallback();
						})
						.catch(function (pError)
						{
							try { tmpWriteTxn.discard(); } catch(e) {}
							tmpResult.error = pError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						});
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

			pQuery.setDialect('DGraph').buildCountQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No DGraph connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.dgraphOperation;
			var tmpTxn = tmpClient.newTxn({ readOnly: true });

			tmpTxn.query(tmpOp.query)
				.then(function (pResponse)
				{
					var tmpData = pResponse.data || {};
					var tmpResults = tmpData[tmpOp.queryName] || [];
					tmpResult.error = null;

					if (tmpResults.length > 0 && typeof tmpResults[0].total !== 'undefined')
					{
						tmpResult.value = tmpResults[0].total;
					}
					else
					{
						tmpResult.value = 0;
					}

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
