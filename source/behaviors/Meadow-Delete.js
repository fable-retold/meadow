// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libAsyncWaterfall = require('async/waterfall');

/**
* Meadow Behavior - Delete a single record
*
* @function meadowBehaviorDelete
*/
var meadowBehaviorDelete = function(pMeadow, pQuery, fCallBack)
{
	// TODO: Check if this recordset has implicit delete tracking, branch in this module.
	// Delete the record(s) from the source
	libAsyncWaterfall(
		[
			// Step 1: Delete the record
			function (fStageComplete)
			{
				if (pMeadow.rawQueries.checkQuery('Delete'))
				{
					pQuery.parameters.queryOverride = pMeadow.rawQueries.getQuery('Delete');
				}
				pMeadow.provider.Delete(pQuery, function(){ fStageComplete(pQuery.result.error, pQuery, pQuery.result.value); });
			}
		],
		function(pError, pQuery, pRecord)
		{
			if (pError)
			{
				pMeadow.fable.log.warn('Error during the delete waterfall', {Error:pError, Message: pError.message, Query: pQuery.query});
			}
			fCallBack(pError, pQuery, pRecord);
		}
	);

	return pMeadow;
};

module.exports = meadowBehaviorDelete;