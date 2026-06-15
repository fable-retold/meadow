// ##### Part of the **[retold](https://stevenvelozo.github.io/retold/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libSimpleGet = require('simple-get');

var MeadowProvider = function()
{
	function createNew(pFable)
	{
		// If a valid Fable object isn't passed in, return a constructor
		if (typeof(pFable) !== 'object')
		{
			return {new: createNew};
		}
		var _Fable = pFable;
		var _GlobalLogLevel = 0;

		var _Dialect = 'MeadowEndpoints';

		// Static fallback configuration — used when no live connection instance
		// is bound (standalone DAL usage). Settings are STATIC boot config:
		// host/port/prefix only, never session state.
		var _StaticEndpointSettings = (_Fable.settings.hasOwnProperty('MeadowEndpoints')) ? JSON.parse(JSON.stringify(_Fable.settings.MeadowEndpoints)) : (
			{
				ServerProtocol: 'http',
				ServerAddress: '127.0.0.1',
				ServerPort: '8086',
				ServerEndpointPrefix: '1.0/'
			}
		)

		// Instance-driven configuration (preferred) — the same convention the
		// SQL providers use (e.g. _Fable.MeadowMySQLProvider): the DAL's fable
		// carries the live connection instance, which OWNS both the connection
		// parameters and the session state (headers/cookies). Reading it per
		// request means post-connect authentication and later cookie rotation
		// always apply to the requests this provider makes.
		var getConnectionInstance = function()
		{
			return (typeof(_Fable.MeadowMeadowEndpointsProvider) === 'object' && _Fable.MeadowMeadowEndpointsProvider !== null)
				? _Fable.MeadowMeadowEndpointsProvider : null;
		};

		var getEndpointSettings = function()
		{
			let tmpInstance = getConnectionInstance();
			if (tmpInstance && typeof(tmpInstance.settings) === 'object' && tmpInstance.settings !== null)
			{
				return tmpInstance.settings;
			}
			return _StaticEndpointSettings;
		};

		var buildURL = function(pAddress)
		{
			let tmpEndpointSettings = getEndpointSettings();
			let tmpURL = `${tmpEndpointSettings.ServerProtocol}://${tmpEndpointSettings.ServerAddress}:${tmpEndpointSettings.ServerPort}/${tmpEndpointSettings.ServerEndpointPrefix}${pAddress}`;
			// e.g. 'skipDecoration=true' — lets machine-to-machine connections
			// opt out of per-row presentation decoration the remote applies.
			if (typeof(tmpEndpointSettings.AdditionalQueryString) === 'string' && tmpEndpointSettings.AdditionalQueryString.length > 0)
			{
				tmpURL += (tmpURL.indexOf('?') >= 0) ? `&${tmpEndpointSettings.AdditionalQueryString}` : `?${tmpEndpointSettings.AdditionalQueryString}`;
			}
			return tmpURL;
		};

		var buildRequestOptions = function(pQuery)
		{
			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
			{
				_Fable.log.trace(pQuery.query.body, pQuery.query.records);
			}

			let tmpURL = buildURL(pQuery.query.body);

			let tmpInstance = getConnectionInstance();
			let tmpHeaders = (tmpInstance && typeof(tmpInstance.headers) === 'object' && tmpInstance.headers !== null)
				? tmpInstance.headers : {};
			let tmpCookies = (tmpInstance && Array.isArray(tmpInstance.cookies))
				? tmpInstance.cookies : [];

			// Explicit timeout: Node 20+ installs a ~5s socket timeout on
			// http.globalAgent; an explicit request timeout takes that default
			// out of play (same workaround as fable's RestClient). Configurable
			// per connection (settings.RequestTimeout) for slow decorated reads.
			let tmpEndpointSettings = getEndpointSettings();
			let tmpRequestTimeout = (typeof(tmpEndpointSettings.RequestTimeout) === 'number')
				? tmpEndpointSettings.RequestTimeout : 60000;

			let tmpRequestOptions = (
			{
				url: tmpURL,
				headers: _Fable.Utility.extend({cookie: ''}, tmpHeaders),
				timeout: tmpRequestTimeout
			});

			// Per-request session override: when an operation carries a caller
			// session (a forwarded identity — e.g. a databeacon proxying a
			// user's request, or a cron run impersonating a RunAs user), present
			// THAT session upstream instead of the connection's bound machine
			// session, so the remote enforces row-level auth as the real caller.
			// The override rides the per-operation query (concurrency-safe — it
			// never touches the connection's shared cookie state). Absent or a
			// default placeholder session falls back to the bound cookies.
			let tmpSessionOverride = (pQuery && pQuery.query && pQuery.query.parameters)
				? pQuery.query.parameters.MeadowEndpointsSessionOverride : null;
			if (tmpSessionOverride && typeof(tmpSessionOverride.SessionID) === 'string'
				&& tmpSessionOverride.SessionID.length > 0 && tmpSessionOverride.SessionID !== '0x0000')
			{
				let tmpCookieName = (tmpEndpointSettings.Authentication && tmpEndpointSettings.Authentication.CookieName)
					? tmpEndpointSettings.Authentication.CookieName
					: (tmpEndpointSettings.SessionCookieName || 'UserSession');
				tmpRequestOptions.headers.cookie = `${tmpCookieName}=${tmpSessionOverride.SessionID}`;
			}
			else
			{
				tmpRequestOptions.headers.cookie = tmpCookies.join(';');
			}


			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
				_Fable.log.debug(`Request options built...`,tmpRequestOptions);

				return tmpRequestOptions;
		};

		// The Meadow marshaller also passes in the Schema as the third parameter, but this is a blunt function ATM.
		var marshalRecordFromSourceToObject = function(pObject, pRecord)
		{
			for(var tmpColumn in pRecord)
			{
				pObject[tmpColumn] = pRecord[tmpColumn];
			}
		};

		var Create = function(pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			pQuery.setDialect(_Dialect).buildCreateQuery();

			let tmpRequestOptions = buildRequestOptions(pQuery);

			// TODO: Should this test for exactly one?
			if (!pQuery.query.records.length > 0)
			{
				tmpResult.error = 'No records passed for proxying to Meadow-Endpoints.';

				return fCallback();
			}

			tmpRequestOptions.body = pQuery.query.records[0];
			tmpRequestOptions.json = true;
	
			libSimpleGet.post(tmpRequestOptions, (pError, pResponse)=>
				{
					tmpResult.error = pError;
					tmpResult.executed = true;

					if (pQuery.logLevel > 0 ||
						_GlobalLogLevel > 0)
							_Fable.log.debug(`--> POST request connected`);

					if (pError)
					{
						return fCallback(tmpResult);
					}

					let tmpData = '';
	
					pResponse.on('data', (pChunk)=>
						{
							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
									_Fable.log.debug(`--> POST data chunk size ${pChunk.length}b received`);
							tmpData += pChunk;
						});
	
					pResponse.on('end', ()=>
						{
							if (tmpData)
							{
								try
								{
									tmpResult.value = JSON.parse(tmpData);
								}
								catch (pParseError)
								{
									tmpResult.error = new Error(`Failed to parse Create response as JSON: ${pParseError.message}`);
									return fCallback();
								}
							}

							// TODO Because this was proxied, read happens at this layer too.  Inefficient -- fixable
							const tmpIdentityColumn = `ID${pQuery.parameters.scope}`;
							if (tmpResult.value && tmpResult.value.hasOwnProperty(tmpIdentityColumn))
							{
								tmpResult.value = tmpResult.value[tmpIdentityColumn];
							}

							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
							{
								_Fable.log.debug(`==> POST completed data size ${tmpData.length}b received`,tmpResult);
							}
							return fCallback();
						});
				});
		};

		// This is a synchronous read, good for a few records.
		// TODO: Add a pipe-able read for huge sets
		var Read = function(pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			pQuery.setDialect(_Dialect).buildReadQuery();

			let tmpRequestOptions = buildRequestOptions(pQuery);
	
			libSimpleGet.get(tmpRequestOptions, (pError, pResponse)=>
				{
					tmpResult.error = pError;
					tmpResult.executed = true;

					if (pQuery.logLevel > 0 ||
						_GlobalLogLevel > 0)
							_Fable.log.debug(`--> GET request connected`);

					if (pError)
					{
						return fCallback(tmpResult);
					}

					let tmpData = '';
	
					pResponse.on('data', (pChunk)=>
						{
							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
									_Fable.log.debug(`--> GET data chunk size ${pChunk.length}b received`);
							tmpData += pChunk;
						});
	
					pResponse.on('end', ()=>
						{
							if (tmpData)
							{
								try
								{
									tmpResult.value = JSON.parse(tmpData);
								}
								catch (pParseError)
								{
									tmpResult.error = new Error(`Failed to parse Read response as JSON: ${pParseError.message}`);
									return fCallback();
								}
							}

							if (pQuery.query.body.startsWith(`${pQuery.parameters.scope}/`))
							{
								// If this is not a plural read, make the result into an array.
								tmpResult.value = [tmpResult.value];
							}

							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
							{
								_Fable.log.debug(`==> GET completed data size ${tmpData.length}b received`,tmpResult);
							}
							fCallback();
						});
				});
		};

		var Update = function(pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			pQuery.setDialect(_Dialect).buildUpdateQuery();

			let tmpRequestOptions = buildRequestOptions(pQuery);

			// TODO: Should this test for exactly one?
			if (!pQuery.query.records.length > 0)
			{
				tmpResult.error = 'No records passed for proxying to Meadow-Endpoints.';

				return fCallback();
			}

			tmpRequestOptions.body = pQuery.query.records[0];
			tmpRequestOptions.json = true;
	
			libSimpleGet.put(tmpRequestOptions, (pError, pResponse)=>
				{
					tmpResult.error = pError;
					tmpResult.executed = true;

					if (pQuery.logLevel > 0 ||
						_GlobalLogLevel > 0)
							_Fable.log.debug(`--> PUT request connected`);

					if (pError)
					{
						return fCallback(tmpResult);
					}

					let tmpData = '';
	
					pResponse.on('data', (pChunk)=>
						{
							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
									_Fable.log.debug(`--> PUT data chunk size ${pChunk.length}b received`);
							tmpData += pChunk;
						});
	
					pResponse.on('end', ()=>
						{
							if (tmpData)
							{
								try
								{
									tmpResult.value = JSON.parse(tmpData);
								}
								catch (pParseError)
								{
									tmpResult.error = new Error(`Failed to parse Update response as JSON: ${pParseError.message}`);
									return fCallback();
								}
							}

							// Keep result.value as the full response object so the
							// Meadow Update waterfall's typeof check passes (it expects
							// an object). The subsequent Read step uses the existing
							// filters to re-read the updated record.

							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
							{
								_Fable.log.debug(`==> PUT completed data size ${tmpData.length}b received`,tmpResult);
							}
							return fCallback();
						});
				});
		}

		var Delete = function(pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			pQuery.setDialect(_Dialect).buildDeleteQuery();


			let tmpRequestOptions = buildRequestOptions(pQuery);
	
			libSimpleGet.delete(tmpRequestOptions, (pError, pResponse)=>
				{
					tmpResult.error = pError;
					tmpResult.executed = true;

					if (pQuery.logLevel > 0 ||
						_GlobalLogLevel > 0)
							_Fable.log.debug(`--> DEL request connected`);

					if (pError)
					{
						return fCallback(tmpResult);
					}

					let tmpData = '';
	
					pResponse.on('data', (pChunk)=>
						{
							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
									_Fable.log.debug(`--> DEL data chunk size ${pChunk.length}b received`);
							tmpData += pChunk;
						});
	
					pResponse.on('end', ()=>
						{
							if (tmpData)
							{
								try
								{
									tmpResult.value = JSON.parse(tmpData);
								}
								catch (pParseError)
								{
									tmpResult.error = new Error(`Failed to parse Delete response as JSON: ${pParseError.message}`);
									return fCallback();
								}
							}

							if (tmpResult.value && tmpResult.value.hasOwnProperty('Count'))
							{
								tmpResult.value = tmpResult.value.Count;
							}

							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
							{
								_Fable.log.debug(`==> DEL completed data size ${tmpData.length}b received`,tmpResult);
							}
							fCallback();
						});
				});
			};

		var Count = function(pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			pQuery.setDialect(_Dialect).buildCountQuery();

			let tmpRequestOptions = buildRequestOptions(pQuery);
	
			libSimpleGet.get(tmpRequestOptions, (pError, pResponse)=>
				{
					tmpResult.error = pError;
					tmpResult.executed = true;

					if (pQuery.logLevel > 0 ||
						_GlobalLogLevel > 0)
							_Fable.log.debug(`--> GET request connected`);

					if (pError)
					{
						return fCallback(tmpResult);
					}

					let tmpData = '';
	
					pResponse.on('data', (pChunk)=>
						{
							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
									_Fable.log.debug(`--> GET data chunk size ${pChunk.length}b received`);
							tmpData += pChunk;
						});
	
					pResponse.on('end', ()=>
						{
							if (tmpData)
							{
								try
								{
									tmpResult.value = JSON.parse(tmpData);
								}
								catch (pParseError)
								{
									tmpResult.error = new Error(`Failed to parse Count response as JSON: ${pParseError.message}`);
									return fCallback();
								}
							}

							try
							{
								tmpResult.value = tmpResult.value.Count;
							}
							catch(pErrorGettingRowcount)
							{
								// This is an error state...
								tmpResult.value = -1;
								_Fable.log.warn('Error getting rowcount during count query',{Body:pQuery.query.body, Parameters:pQuery.query.parameters});
							}

							if (pQuery.logLevel > 0 ||
								_GlobalLogLevel > 0)
							{
								_Fable.log.debug(`==> GET completed data size ${tmpData.length}b received`,tmpResult);
							}
							fCallback();
						});
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
