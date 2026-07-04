// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
 * Meadow provider that relays CRUD operations to a remote retold-databeacon
 * agent through an Ultravisor mesh. Structurally parallel to the
 * Meadow-Provider-MeadowEndpoints provider — it reuses the same FoxHound
 * `MeadowEndpoints` dialect to build the HTTP request descriptor, then
 * ships the descriptor as a work item addressed to a specific beacon.
 *
 * Required on the fable:
 *   _Fable.MeadowRetoldDataBeaconProvider — the connection instance (from
 *     meadow-connection-retold-databeacon). Exposes dispatchRequest(
 *     { Method, Path, Body }, fCallback) where fCallback receives
 *     (pError, pResponseBodyString).
 *
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
		var _Dialect = 'MeadowEndpoints';

		// Dispatch an HTTP request descriptor through the remote-databeacon
		// connection, returning the parsed JSON response.
		var dispatch = function (pQuery, pMethod, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			tmpResult.executed = true;

			var tmpConn = _Fable.MeadowRetoldDataBeaconProvider;
			if (!tmpConn || typeof (tmpConn.dispatchRequest) !== 'function')
			{
				tmpResult.error = new Error('MeadowProviderRetoldDataBeacon: no connection registered on _Fable.MeadowRetoldDataBeaconProvider');
				return fCallback();
			}

			// Build the path with the connection hash prefix so the remote
			// databeacon's hash-namespaced route receives the request.
			var tmpHash = tmpConn._TargetConnectionHash || '';
			var tmpRelative = pQuery.query.body || '';
			var tmpPath;
			if (tmpHash)
			{
				tmpPath = '/1.0/' + tmpHash + '/' + tmpRelative;
			}
			else if (tmpRelative.charAt(0) !== '/')
			{
				tmpPath = '/1.0/' + tmpRelative;
			}
			else
			{
				tmpPath = tmpRelative;
			}

			var tmpBody = null;
			if ((pMethod === 'POST' || pMethod === 'PUT') &&
				pQuery.query.records && pQuery.query.records.length > 0)
			{
				tmpBody = pQuery.query.records[0];
			}

			tmpConn.dispatchRequest(
				{
					Method: pMethod,
					Path: tmpPath,
					Body: (tmpBody !== null) ? JSON.stringify(tmpBody) : ''
				},
				function (pError, pResponseString)
				{
					if (pError)
					{
						tmpResult.error = pError;
						return fCallback();
					}

					if (pResponseString && pResponseString.length > 0)
					{
						try
						{
							tmpResult.value = JSON.parse(pResponseString);
						}
						catch (pParseError)
						{
							tmpResult.error = new Error(
								'MeadowProviderRetoldDataBeacon: failed to parse response as JSON: ' + pParseError.message);
							return fCallback();
						}
					}

					if (pQuery.logLevel > 0 || _GlobalLogLevel > 0)
					{
						_Fable.log.debug(`==> ${pMethod} ${tmpPath} completed`, tmpResult);
					}
					return fCallback();
				});
		};

		var marshalRecordFromSourceToObject = function (pObject, pRecord)
		{
			for (var tmpColumn in pRecord)
			{
				pObject[tmpColumn] = pRecord[tmpColumn];
			}
		};

		var Create = function (pQuery, fCallback)
		{
			pQuery.setDialect(_Dialect).buildCreateQuery();

			if (!pQuery.query.records || pQuery.query.records.length === 0)
			{
				pQuery.parameters.result.error = 'No records passed for proxying to Retold-DataBeacon.';
				return fCallback();
			}

			dispatch(pQuery, 'POST',
				function ()
				{
					var tmpResult = pQuery.parameters.result;
					// Mirror MeadowEndpoints behavior — unwrap the identity column
					// so downstream behaviors get the scalar ID.
					var tmpIdentityColumn = `ID${pQuery.parameters.scope}`;
					if (tmpResult.value && tmpResult.value.hasOwnProperty(tmpIdentityColumn))
					{
						tmpResult.value = tmpResult.value[tmpIdentityColumn];
					}
					return fCallback();
				});
		};

		var Read = function (pQuery, fCallback)
		{
			pQuery.setDialect(_Dialect).buildReadQuery();

			dispatch(pQuery, 'GET',
				function ()
				{
					var tmpResult = pQuery.parameters.result;
					// If the URL is a singular read (<scope>/<id>), wrap as array
					// so downstream Meadow-Read.js behavior gets the shape it expects.
					if (pQuery.query.body && pQuery.query.body.startsWith(`${pQuery.parameters.scope}/`))
					{
						if (tmpResult.value !== undefined && tmpResult.value !== null)
						{
							tmpResult.value = [tmpResult.value];
						}
					}
					return fCallback();
				});
		};

		var Update = function (pQuery, fCallback)
		{
			pQuery.setDialect(_Dialect).buildUpdateQuery();

			if (!pQuery.query.records || pQuery.query.records.length === 0)
			{
				pQuery.parameters.result.error = 'No records passed for proxying to Retold-DataBeacon.';
				return fCallback();
			}

			dispatch(pQuery, 'PUT',
				function ()
				{
					// Meadow Update waterfall's typeof check expects an object.
					// Leave tmpResult.value as-is.
					return fCallback();
				});
		};

		var Delete = function (pQuery, fCallback)
		{
			pQuery.setDialect(_Dialect).buildDeleteQuery();

			dispatch(pQuery, 'DELETE',
				function ()
				{
					var tmpResult = pQuery.parameters.result;
					if (tmpResult.value && tmpResult.value.hasOwnProperty('Count'))
					{
						tmpResult.value = tmpResult.value.Count;
					}
					return fCallback();
				});
		};

		var Count = function (pQuery, fCallback)
		{
			pQuery.setDialect(_Dialect).buildCountQuery();

			dispatch(pQuery, 'GET',
				function ()
				{
					var tmpResult = pQuery.parameters.result;
					try
					{
						tmpResult.value = tmpResult.value.Count;
					}
					catch (pErrorGettingRowCount)
					{
						tmpResult.value = -1;
						_Fable.log.warn('MeadowProviderRetoldDataBeacon: error getting rowcount during count query',
							{ Body: pQuery.query.body, Parameters: pQuery.query.parameters });
					}
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
