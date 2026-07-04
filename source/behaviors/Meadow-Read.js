// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libAsyncWaterfall = require('async/waterfall');

/**
* Meadow Behavior - Read a single record
*
* @function meadowBehaviorRead
*/
var meadowBehaviorRead = function(pMeadow, pQuery, fCallBack)
{
	// Read the record from the source
	libAsyncWaterfall(
		[
			// Step 1: Get the record from the data source
			function (fStageComplete)
			{
				// If there is a Read override query, use it!
				if (pMeadow.rawQueries.checkQuery('Read'))
				{
					pQuery.parameters.queryOverride = pMeadow.rawQueries.getQuery('Read');
				}
				pMeadow.provider.Read(pQuery, function(){ fStageComplete(pQuery.result.error, pQuery); });
			},
			// Step 2: Marshal the record into a POJO
			function (pQuery, fStageComplete)
			{
				// Check that a record was returned
				if (pQuery.parameters.result.value.length < 1)
				{
					return fStageComplete(undefined, pQuery, false);
				}

				var tmpRecord = pMeadow.marshalRecordFromSourceToObject(pQuery.result.value[0]);

				fStageComplete(pQuery.result.error, pQuery, tmpRecord);
			}
		],
		(pError, pQuery, pRecord)=>
		{
			if (pError)
			{
				pMeadow.fable.log.warn('Error during the read waterfall', {Error:pError, Message: pError.message, Query: pQuery.query});
			}
			fCallBack(pError, pQuery, pRecord);
		}
	);

	return pMeadow;
};

module.exports = meadowBehaviorRead;