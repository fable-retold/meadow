// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libFS = require('fs');

/**
* ### Meadow Raw Query Library
*
* This library loads and stores raw queries for FoxHound to use.
* You can overload the default query that is built for each of
* the following query archetypes:
*
* `Create`, `Read`, `Reads`, `Update`, `Delete`, `Count`
*
* You can also load other custom queries and give them an
* arbitrary name.
*
* @class MeadowRawQuery
*/
var MeadowRawQuery = function()
{
	function createNew(pMeadow)
	{
		// If a valid Fable object isn't passed in, return a constructor
		if ((typeof(pMeadow) !== 'object') || !('fable' in pMeadow))
		{
			return {new: createNew};
		}
		var _Meadow = pMeadow;

		var _Queries = {};


		/**
		* Load a Custom Query from a File
		*
		* @method doLoadQuery
		*/
		function doLoadQuery(pQueryTag, pFileName, fCallBack)
		{
			var tmpCallBack = (typeof(fCallBack) === 'function') ? fCallBack : function() {};

			libFS.readFile(pFileName, 'utf8',
				function (pError, pData)
				{
					if (pError)
					{
						_Meadow.fable.log.error('Problem loading custom query file.', {QueryTag:pQueryTag, FileName:pFileName, Error:pError});
						// There is some debate whether we should leave the queries entry unset or set it to empty so nothing happens.
						// If this were to set the query to `false` instead of `''`, FoxHound would be used to generate a query.
						doSetQuery(pQueryTag, '');
						tmpCallBack(false);
					}
					else
					{
						_Meadow.fable.log.trace('Loaded custom query file.', {QueryTag:pQueryTag, FileName:pFileName});
						doSetQuery(pQueryTag, pData);
						tmpCallBack(true);
					}
				});
			return _Meadow;
		}


		/**
		* Sets a Custom Query from a String
		*
		* @method doSetQuery
		*/
		function doSetQuery(pQueryTag, pQueryString)
		{
			_Queries[pQueryTag] = pQueryString;
			return _Meadow;
		}


		/**
		* Returns a Custom Query if one has been set for this tag
		*
		* @method doGetQuery
		*/
		function doGetQuery(pQueryTag)
		{
			if (_Queries.hasOwnProperty(pQueryTag))
			{
				return _Queries[pQueryTag];
			}

			return false;
		}


		/**
		* Check if a Custom Query exists
		*
		* @method doCheckQuery
		*/
		function doCheckQuery(pQueryTag)
		{
			return _Queries.hasOwnProperty(pQueryTag);
		}

		var tmpNewMeadowRawQuery = (
		{
			loadQuery: doLoadQuery,
			setQuery: doSetQuery,

			checkQuery: doCheckQuery,
			getQuery: doGetQuery,

			new: createNew
		});

		return tmpNewMeadowRawQuery;
	}

	return createNew();
};

module.exports = new MeadowRawQuery();
