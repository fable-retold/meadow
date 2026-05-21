// ##### Part of the **[retold](https://stevenvelozo.github.io/retold/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libAsyncWaterfall = require('async/waterfall');

var libRenameSoftDeletedConflicts = require('./Meadow-CollisionRename.js');

/**
* Meadow Behavior - Create
*
* @function meadowBehaviorCreate
*/
var meadowBehaviorCreate = function(pMeadow, pQuery, fCallBack)
{
	libAsyncWaterfall(
		[
			// Step 0: Unique-constraint pre-flight. Single Read per constraint
			// (AutoGUID + any user-declared Unique/UniqueGroup columns) covers
			// both behaviors that used to live here:
			//   - soft-deleted collisions get the conflicting columns renamed
			//     so the new INSERT can take the slot (the soft-delete /
			//     dialect-specific WHERE-Deleted=0 partial-index workaround
			//     downstream consumers used to need)
			//   - live AutoGUID collisions return the legacy "Record with
			//     GUID X already exists!" error before the INSERT fires
			// No-op when the schema declares no Unique/UniqueGroup columns
			// AND no Deleted-tracking column. Live conflicts on user-declared
			// Unique columns still defer to the DB unique-index error.
			function (fStageComplete)
			{
				// Reject missing records here — the old Step 0 owned this
				// error and downstream steps assume pQuery.query.records[0]
				// exists. Same string and trailing-args shape as before so
				// existing callers' expectations are preserved.
				if (!pQuery.query.records || !pQuery.query.records[0])
				{
					return fStageComplete('No record submitted', pQuery, false);
				}

				libRenameSoftDeletedConflicts(pMeadow, pQuery.query.records[0], function (pPreflightError)
				{
					if (pPreflightError)
					{
						pMeadow.fable.log.warn('Error during the unique-constraint pre-flight',
							{ Error: pPreflightError, Message: pPreflightError && pPreflightError.message });
						return setImmediate(fStageComplete, pPreflightError, pQuery, false);
					}
					// Defer via setImmediate so synchronous providers (node:sqlite,
					// previously better-sqlite3) cannot stack-accumulate frames
					// across a long synchronous chain of Creates — every record's
					// pre-flight returns to the event loop before the INSERT runs.
					return setImmediate(fStageComplete);
				});
			},
			// Step 1: Create the record in the data source
			function (fStageComplete)
			{
				if (!pQuery.query.IDUser)
				{
					// The user ID is not already set, set it magically.
					if (typeof(pQuery.userID) === 'number' && (pQuery.userID % 1) === 0 && pQuery.userID >= 0)
					{
						pQuery.query.IDUser = pQuery.userID;
					}
					else
					{
						pQuery.query.IDUser = pMeadow.userIdentifier;
					}
				}
				
				// Merge in the default record with the passed-in record for completeness
				pQuery.query.records[0] = pMeadow.fable.Utility.extend({}, pMeadow.schemaFull.defaultObject, pQuery.query.records[0]);
				// Create override is too complex ... punting for now
				// if (pMeadow.rawQueries.checkQuery('Create'))
				//	pQuery.parameters.queryOverride = pMeadow.rawQueries.getQuery('Create');
				pMeadow.provider.Create(pQuery, function(){ fStageComplete(pQuery.result.error, pQuery); });
			},
			// Step 2: Setup a read operation
			function (pQuery, fStageComplete)
			{
				// The value is not set (it should be set to the value for our DefaultIdentifier)
				if (pQuery.parameters.result.value === false)
				{
					return fStageComplete('Creation failed', pQuery, false);
				}

				var tmpIDRecord = pQuery.result.value;
				fStageComplete(pQuery.result.error, pQuery, tmpIDRecord);
			},
			// Step 3: Read the record
			function (pQuery, pIDRecord, fStageComplete)
			{
				var tmpQueryRead = pQuery.clone().addFilter(pMeadow.defaultIdentifier, pIDRecord)
												 .setDisableDeleteTracking(pQuery.parameters.query.disableDeleteTracking); //if delete tracking is disabled, we need to disable it on this Read operation

				if (pMeadow.rawQueries.checkQuery('Read'))
				{
					tmpQueryRead.parameters.queryOverride = pMeadow.rawQueries.getQuery('Read');
				}
				pMeadow.provider.Read(tmpQueryRead, function(){ fStageComplete(tmpQueryRead.result.error, pQuery, tmpQueryRead); });
			},
			// Step 4: Marshal the record into a POJO
			function (pQuery, pQueryRead, fStageComplete)
			{
				// Ensure there is not at least one record returned
				if (pQueryRead.parameters.result.value.length < 1)
				{
					return fStageComplete('No record found after create.', pQuery, pQueryRead, false);
				}

				var tmpRecord = pMeadow.marshalRecordFromSourceToObject(pQueryRead.result.value[0]);
				fStageComplete(pQuery.result.error, pQuery, pQueryRead, tmpRecord);
			}
		],
		function(pError, pQuery, pQueryRead, pRecord)
		{
			if (pError)
			{
				pMeadow.fable.log.warn('Error during the create waterfall', {Error:pError, Message: pError.message, Query: pQuery.query, Stack: pError.stack});
			}
			fCallBack(pError, pQuery, pQueryRead, pRecord);
		}
	);

	return pMeadow;
};

module.exports = meadowBehaviorCreate;