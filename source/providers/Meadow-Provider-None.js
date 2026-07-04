// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/

var MeadowProvider = function()
{
	function createNew(pFable)
	{
		// If a valid Fable object isn't passed in, return a constructor
		if ((typeof(pFable) !== 'object') || !('fable' in pFable))
		{
			return {new: createNew};
		}
		//var _Fable = pFable;

		//var marshalRecordFromSourceToObject = function(pObject, pRecord, pSchema)
		var marshalRecordFromSourceToObject = function()
		{
			// Do nothing ... this is the NONE provider after all
		};

		var Create = function(pQuery, fCallback)
		{
			// This does nothing because it's the none data provider!
			pQuery.parameters.result.executed = true;
			fCallback();
		};

		// This is a synchronous read, good for a few records.
		// TODO: Add a pipe-able read for huge sets
		var Read = function(pQuery, fCallback)
		{
			// This does nothing because it's the none data provider!
			pQuery.parameters.result.executed = true;
			pQuery.parameters.result.value = [true];
			fCallback();
		};

		var Update = function(pQuery, fCallback)
		{
			// This does nothing because it's the none data provider!
			pQuery.parameters.result.executed = true;
			fCallback();
		};

		var Delete = function(pQuery, fCallback)
		{
			// This does nothing because it's the none data provider!
			pQuery.parameters.result.executed = true;
			fCallback();
		};

		var Undelete = function(pQuery, fCallback)
		{
			// This does nothing because it's the none data provider!
			pQuery.parameters.result.executed = true;
			fCallback();
		};

		var Count = function(pQuery, fCallback)
		{
			// This does nothing because it's the none data provider!
			pQuery.parameters.result.executed = true;
			fCallback();
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

			getProvider: {},
			providerCreatesSupported: false,

			new: createNew
		});


		return tmpNewProvider;
	}

	return createNew();
};

module.exports = new MeadowProvider();
