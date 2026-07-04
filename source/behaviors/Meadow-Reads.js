// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libAsyncWaterfall = require('async/waterfall');
var libAsyncEach = require('async/eachSeries');

/**
* Meadow Behavior - Read multiple records
*
* @function meadowBehaviorReads
*/
var meadowBehaviorReads = function(pMeadow, pQuery, fCallBack)
{
	var tmpProfileStart = new Date(); //for profiling query time

	// Read the record(s) from the source
	libAsyncWaterfall(
		[
			// Step 1: Get the record(s) from the data source
			function (fStageComplete)
			{
				if (pMeadow.rawQueries.checkQuery('Reads'))
				{
					pQuery.parameters.queryOverride = pMeadow.rawQueries.getQuery('Reads');
				}
				pMeadow.provider.Read(pQuery, function(){ fStageComplete(pQuery.result.error, pQuery); });
			},
			// Step 2: Marshal all the records into an array of POJOs
			function (pQuery, fStageComplete)
			{
				// Check if query time exceeded threshold in settings. Log if slow.
				var tmpProfileTime = new Date().getTime() - tmpProfileStart.getTime();
				if (tmpProfileTime > (pMeadow.fable.settings['QueryThresholdWarnTime'] || 200))
				{
					pMeadow.logSlowQuery(tmpProfileTime, pQuery);
				}

				var tmpRecords = [];

				libAsyncEach
				(
					pQuery.parameters.result.value,
					function(pRow, pQueueCallback)
					{
						tmpRecords.push(pMeadow.marshalRecordFromSourceToObject(pRow));
						pQueueCallback();
					},
					function()
					{
						// After we've pushed every record into the array in order, complete the waterfall
						fStageComplete(pQuery.result.error, pQuery, tmpRecords);
					}
				);
			}
		],
		function(pError, pQuery, pRecords)
		{
			if (pError)
			{
				pMeadow.fable.log.warn('Error during the read multiple waterfall', {Error:pError, Message: pError.message, Query: pQuery.query});
			}
			fCallBack(pError, pQuery, pRecords);
		}
	);

	return pMeadow;
};

module.exports = meadowBehaviorReads;