// ##### Part of the **[retold](https://stevenvelozo.github.io/retold/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libAsync = require('async');

/**
* Meadow Behavior - Undelete a single record
*
* @function meadowBehaviorUndelete
*/
var meadowBehaviorUndelete = function(pMeadow, pQuery, fCallBack)
{
	// TODO: Check if this recordset has implicit delete tracking, branch in this module?
	// Undelete the record(s) if they were deleted with a bit
	libAsync.waterfall(
		[
			// Step 1: Undelete the record
			function (fStageComplete)
			{
				if (pMeadow.rawQueries.checkQuery('Undelete'))
				{
					pQuery.parameters.queryOverride = pMeadow.rawQueries.getQuery('Undelete');
				}
				pMeadow.provider.Undelete(pQuery, function(){ fStageComplete(pQuery.result.error, pQuery, pQuery.result.value); });
			}
		],
		function(pError, pQuery, pRecord)
		{
			if (pError)
			{
				pMeadow.fable.log.warn('Error during the undelete waterfall', {Error:pError, Message: pError.message, Query: pQuery.query});
			}
			fCallBack(pError, pQuery, pRecord);
		}
	);

	return pMeadow;
};

module.exports = meadowBehaviorUndelete;