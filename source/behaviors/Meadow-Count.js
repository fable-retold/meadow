// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libAsyncWaterfall = require('async/waterfall');

/**
* Meadow Behavior - Count multiple records
*
* @function meadowBehaviorCount
*/
var meadowBehaviorCount = function(pMeadow, pQuery, fCallBack)
{
	var tmpProfileStart = new Date(); //for profiling query time

	// Count the record(s) from the source
	libAsyncWaterfall(
		[
			// Step 1: Get the record countfrom the data source
			function (fStageComplete)
			{
				if (pMeadow.rawQueries.checkQuery('Count'))
				{
					pQuery.parameters.queryOverride = pMeadow.rawQueries.getQuery('Count');
				}
				pMeadow.provider.Count(pQuery, function(){ fStageComplete(pQuery.result.error, pQuery); });
			},
			// Step 2: Validate the resulting value
			function (pQuery, fStageComplete)
			{
				// Check if query time exceeded threshold in settings. Log if slow.
				var tmpProfileTime = new Date().getTime() - tmpProfileStart.getTime();
				if (tmpProfileTime > (pMeadow.fable.settings['QueryThresholdWarnTime'] || 200))
				{
					pMeadow.logSlowQuery(tmpProfileTime, pQuery);
				}

				if (typeof(pQuery.parameters.result.value) !== 'number')
				{
					// The return value is a number.. something is wrong.
					return fStageComplete('Count did not return valid results.', pQuery, false);
				}

				fStageComplete(pQuery.result.error, pQuery, pQuery.result.value);
			}
		],
		function(pError, pQuery, pCount)
		{
			if (pError)
			{
				pMeadow.fable.log.warn('Error during the count waterfall', {Error:pError, Message: pError.message, Query: pQuery.query});
			}
			fCallBack(pError, pQuery, pCount);
		}
	);

	return pMeadow;
};

module.exports = meadowBehaviorCount;