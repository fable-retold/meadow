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
		if (_Fable.settings.Solr)
		{
			_GlobalLogLevel = _Fable.settings.Solr.GlobalLogLevel || 0;
		}

		/**
		 * Get the Solr client instance from the connection service.
		 */
		var getClient = function ()
		{
			if (typeof (_Fable.MeadowSolrProvider) == 'object' && _Fable.MeadowSolrProvider.connected)
			{
				return _Fable.MeadowSolrProvider.pool;
			}
			return false;
		};

		var getProvider = function ()
		{
			if (typeof (_Fable.MeadowSolrProvider) == 'object')
			{
				return _Fable.MeadowSolrProvider;
			}
			return false;
		};

		/**
		 * Deep-walk an object and replace $$NOW sentinels with ISO date strings.
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
		 * Get the next auto-increment sequence value for a collection/column pair.
		 * Uses a _meadow_counters Solr collection with search + update.
		 *
		 * @param {Object} pClient Solr client instance
		 * @param {String} pScope Collection name
		 * @param {String} pIDColumn Identity column name
		 * @param {Function} fCallback (error, nextSequenceValue)
		 */
		var getNextSequence = function (pClient, pScope, pIDColumn, fCallback)
		{
			var tmpCounterKey = pScope + '.' + pIDColumn;

			// Search for existing counter document
			var tmpSearchQuery = pClient.query().q('id:"' + tmpCounterKey + '"').rows(1);
			pClient.search(tmpSearchQuery, function (pSearchError, pSearchResult)
			{
				if (pSearchError)
				{
					return fCallback(pSearchError);
				}

				var tmpNextSeq = 1;
				if (pSearchResult && pSearchResult.response &&
					pSearchResult.response.docs && pSearchResult.response.docs.length > 0)
				{
					tmpNextSeq = (pSearchResult.response.docs[0].seq || 0) + 1;
				}

				// Upsert the counter document
				var tmpCounterDoc = { id: tmpCounterKey, seq: tmpNextSeq };
				pClient.add(tmpCounterDoc, function (pAddError)
				{
					if (pAddError)
					{
						return fCallback(pAddError);
					}
					pClient.commit(function (pCommitError)
					{
						if (pCommitError)
						{
							return fCallback(pCommitError);
						}
						return fCallback(null, tmpNextSeq);
					});
				});
			});
		};

		// The Meadow marshaller also passes in the Schema as the third parameter
		var marshalRecordFromSourceToObject = function (pObject, pRecord)
		{
			for (var tmpColumn in pRecord)
			{
				// Skip Solr's internal _version_ field
				if (tmpColumn === '_version_')
				{
					continue;
				}
				// Solr multi-valued fields return arrays; unwrap single-element arrays
				var tmpValue = pRecord[tmpColumn];
				if (Array.isArray(tmpValue) && tmpValue.length === 1)
				{
					tmpValue = tmpValue[0];
				}
				pObject[tmpColumn] = tmpValue;
			}
		};

		var Create = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('Solr').buildCreateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No Solr connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.solrOperation;
			if (!tmpOp)
			{
				tmpResult.error = new Error('No Solr operation generated.');
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
				getNextSequence(tmpClient, tmpOp.collection, tmpAutoIncrementColumn, function (pSeqError, pSeqValue)
				{
					if (pSeqError)
					{
						tmpResult.error = pSeqError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpDocument[tmpAutoIncrementColumn] = pSeqValue;

					tmpClient.add(tmpDocument, function (pAddError)
					{
						if (pAddError)
						{
							tmpResult.error = pAddError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						}
						tmpClient.commit(function (pCommitError)
						{
							if (pCommitError)
							{
								tmpResult.error = pCommitError;
								tmpResult.value = false;
								tmpResult.executed = true;
								return fCallback();
							}
							tmpResult.error = null;
							tmpResult.value = pSeqValue;
							tmpResult.executed = true;
							return fCallback();
						});
					});
				});
			}
			else
			{
				tmpClient.add(tmpDocument, function (pAddError, pAddResult)
				{
					if (pAddError)
					{
						tmpResult.error = pAddError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}
					tmpClient.commit(function (pCommitError)
					{
						if (pCommitError)
						{
							tmpResult.error = pCommitError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						}
						tmpResult.error = null;
						tmpResult.value = tmpDocument.id || true;
						tmpResult.executed = true;
						return fCallback();
					});
				});
			}
		};

		var Read = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('Solr').buildReadQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No Solr connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.solrOperation;

			var tmpSearchQuery = tmpClient.query().q(tmpOp.query || '*:*');

			if (tmpOp.filterQuery)
			{
				tmpSearchQuery.parameters.push('fq=' + encodeURIComponent(tmpOp.filterQuery));
			}
			if (tmpOp.fields)
			{
				tmpSearchQuery = tmpSearchQuery.fl(tmpOp.fields);
			}
			if (tmpOp.sort)
			{
				tmpSearchQuery.parameters.push('sort=' + encodeURIComponent(tmpOp.sort));
			}
			if (typeof tmpOp.rows !== 'undefined')
			{
				tmpSearchQuery = tmpSearchQuery.rows(tmpOp.rows);
			}
			if (tmpOp.start)
			{
				tmpSearchQuery = tmpSearchQuery.start(tmpOp.start);
			}

			tmpClient.search(tmpSearchQuery, function (pSearchError, pSearchResult)
			{
				if (pSearchError)
				{
					tmpResult.error = pSearchError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				}

				tmpResult.error = null;
				tmpResult.value = (pSearchResult && pSearchResult.response) ? pSearchResult.response.docs : [];
				tmpResult.executed = true;
				return fCallback();
			});
		};

		var Update = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('Solr').buildUpdateQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No Solr connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.solrOperation;
			if (!tmpOp)
			{
				tmpResult.error = new Error('No Solr operation generated.');
				tmpResult.executed = true;
				return fCallback();
			}

			// First, search for matching documents to get their IDs
			var tmpSearchQuery = tmpClient.query().q(tmpOp.filterQuery || '*:*').fl('id').rows(1000000);

			tmpClient.search(tmpSearchQuery, function (pSearchError, pSearchResult)
			{
				if (pSearchError)
				{
					tmpResult.error = pSearchError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpDocs = (pSearchResult && pSearchResult.response) ? pSearchResult.response.docs : [];
				if (tmpDocs.length === 0)
				{
					tmpResult.error = null;
					tmpResult.value = 0;
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpUpdate = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.update)));

				// Build atomic update documents for each matching doc
				var tmpUpdateDocs = [];
				for (var i = 0; i < tmpDocs.length; i++)
				{
					var tmpUpdateDoc = { id: tmpDocs[i].id };
					for (var tmpField in tmpUpdate)
					{
						tmpUpdateDoc[tmpField] = tmpUpdate[tmpField];
					}
					tmpUpdateDocs.push(tmpUpdateDoc);
				}

				tmpClient.add(tmpUpdateDocs, function (pUpdateError)
				{
					if (pUpdateError)
					{
						tmpResult.error = pUpdateError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}
					tmpClient.commit(function (pCommitError)
					{
						if (pCommitError)
						{
							tmpResult.error = pCommitError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						}
						tmpResult.error = null;
						tmpResult.value = tmpUpdateDocs;
						tmpResult.executed = true;
						return fCallback();
					});
				});
			});
		};

		var Delete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('Solr').buildDeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No Solr connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.solrOperation;

			if (tmpOp.operation === 'atomicUpdate')
			{
				// Soft delete - search for IDs then apply atomic update
				var tmpSearchQuery = tmpClient.query().q(tmpOp.filterQuery || '*:*').fl('id').rows(1000000);

				tmpClient.search(tmpSearchQuery, function (pSearchError, pSearchResult)
				{
					if (pSearchError)
					{
						tmpResult.error = pSearchError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					var tmpDocs = (pSearchResult && pSearchResult.response) ? pSearchResult.response.docs : [];
					if (tmpDocs.length === 0)
					{
						tmpResult.error = null;
						tmpResult.value = 0;
						tmpResult.executed = true;
						return fCallback();
					}

					var tmpUpdate = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.update)));

					var tmpUpdateDocs = [];
					for (var i = 0; i < tmpDocs.length; i++)
					{
						var tmpUpdateDoc = { id: tmpDocs[i].id };
						for (var tmpField in tmpUpdate)
						{
							tmpUpdateDoc[tmpField] = tmpUpdate[tmpField];
						}
						tmpUpdateDocs.push(tmpUpdateDoc);
					}

					tmpClient.add(tmpUpdateDocs, function (pUpdateError)
					{
						if (pUpdateError)
						{
							tmpResult.error = pUpdateError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						}
						tmpClient.commit(function (pCommitError)
						{
							if (pCommitError)
							{
								tmpResult.error = pCommitError;
								tmpResult.value = false;
								tmpResult.executed = true;
								return fCallback();
							}
							tmpResult.error = null;
							tmpResult.value = tmpDocs.length;
							tmpResult.executed = true;
							return fCallback();
						});
					});
				});
			}
			else
			{
				// Hard delete
				// First count how many docs match, then delete
				var tmpCountQuery = tmpClient.query().q(tmpOp.filterQuery || '*:*').rows(0);
				tmpClient.search(tmpCountQuery, function (pCountError, pCountResult)
				{
					var tmpDeleteCount = 0;
					if (!pCountError && pCountResult && pCountResult.response)
					{
						tmpDeleteCount = pCountResult.response.numFound || 0;
					}

					tmpClient.deleteByQuery(tmpOp.filterQuery || '*:*', function (pDeleteError)
					{
						if (pDeleteError)
						{
							tmpResult.error = pDeleteError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						}
						tmpClient.commit(function (pCommitError)
						{
							if (pCommitError)
							{
								tmpResult.error = pCommitError;
								tmpResult.value = false;
								tmpResult.executed = true;
								return fCallback();
							}
							tmpResult.error = null;
							tmpResult.value = tmpDeleteCount;
							tmpResult.executed = true;
							return fCallback();
						});
					});
				});
			}
		};

		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('Solr').buildUndeleteQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No Solr connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.solrOperation;
			if (!tmpOp || tmpOp.operation === 'noop')
			{
				tmpResult.error = null;
				tmpResult.value = 0;
				tmpResult.executed = true;
				return fCallback();
			}

			// Search for matching documents
			var tmpSearchQuery = tmpClient.query().q(tmpOp.filterQuery || '*:*').fl('id').rows(1000000);

			tmpClient.search(tmpSearchQuery, function (pSearchError, pSearchResult)
			{
				if (pSearchError)
				{
					tmpResult.error = pSearchError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpDocs = (pSearchResult && pSearchResult.response) ? pSearchResult.response.docs : [];
				if (tmpDocs.length === 0)
				{
					tmpResult.error = null;
					tmpResult.value = 0;
					tmpResult.executed = true;
					return fCallback();
				}

				var tmpUpdate = replaceSentinels(JSON.parse(JSON.stringify(tmpOp.update)));

				var tmpUpdateDocs = [];
				for (var i = 0; i < tmpDocs.length; i++)
				{
					var tmpUpdateDoc = { id: tmpDocs[i].id };
					for (var tmpField in tmpUpdate)
					{
						tmpUpdateDoc[tmpField] = tmpUpdate[tmpField];
					}
					tmpUpdateDocs.push(tmpUpdateDoc);
				}

				tmpClient.add(tmpUpdateDocs, function (pUpdateError)
				{
					if (pUpdateError)
					{
						tmpResult.error = pUpdateError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}
					tmpClient.commit(function (pCommitError)
					{
						if (pCommitError)
						{
							tmpResult.error = pCommitError;
							tmpResult.value = false;
							tmpResult.executed = true;
							return fCallback();
						}
						tmpResult.error = null;
						tmpResult.value = tmpDocs.length;
						tmpResult.executed = true;
						return fCallback();
					});
				});
			});
		};

		var Count = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;

			pQuery.setDialect('Solr').buildCountQuery();

			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.parameters);
			}

			var tmpClient = getClient();
			if (!tmpClient)
			{
				tmpResult.error = new Error('No Solr connection available.');
				tmpResult.executed = true;
				return fCallback();
			}

			var tmpOp = pQuery.query.parameters.solrOperation;

			var tmpSearchQuery = tmpClient.query().q(tmpOp.query || '*:*').rows(0);

			if (tmpOp.filterQuery)
			{
				tmpSearchQuery.parameters.push('fq=' + encodeURIComponent(tmpOp.filterQuery));
			}

			if (tmpOp.distinct && tmpOp.distinctFields && tmpOp.distinctFields.length > 0)
			{
				// For distinct count, we need to use faceting or grouping
				// Use JSON facet API for distinct count
				var tmpFacetFields = {};
				for (var i = 0; i < tmpOp.distinctFields.length; i++)
				{
					tmpFacetFields[tmpOp.distinctFields[i]] = '$' + tmpOp.distinctFields[i];
				}

				// Use group.field for distinct counting
				tmpSearchQuery = tmpSearchQuery.groupBy(tmpOp.distinctFields[0]).groupNGroups(true);
			}

			tmpClient.search(tmpSearchQuery, function (pSearchError, pSearchResult)
			{
				if (pSearchError)
				{
					tmpResult.error = pSearchError;
					tmpResult.value = false;
					tmpResult.executed = true;
					return fCallback();
				}

				tmpResult.error = null;

				if (tmpOp.distinct && pSearchResult && pSearchResult.grouped)
				{
					// Get ngroups from grouped response
					var tmpGroupKeys = Object.keys(pSearchResult.grouped);
					if (tmpGroupKeys.length > 0)
					{
						tmpResult.value = pSearchResult.grouped[tmpGroupKeys[0]].ngroups || 0;
					}
					else
					{
						tmpResult.value = 0;
					}
				}
				else
				{
					tmpResult.value = (pSearchResult && pSearchResult.response) ? pSearchResult.response.numFound : 0;
				}
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
