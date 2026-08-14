// ##### Part of the **[retold](https://fable-retold.io/)** system
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
			// never touches the connection's shared cookie state).
			//
			// With no caller session, the connection's own login is NOT a
			// stand-in for one — presenting it runs someone else's request under
			// this connection's identity, which reads upstream as a legitimate
			// user and silently widens what the caller can see and write. So the
			// request goes out with no session at all and the remote decides:
			// public data answers, protected data 401s. A deployment that
			// genuinely means "act as this connection" (machine-to-machine
			// movement, public reference data) opts in with
			// AllowBoundSessionFallback.
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
			else if (tmpEndpointSettings.AllowBoundSessionFallback)
			{
				tmpRequestOptions.headers.cookie = tmpCookies.join(';');
			}
			else
			{
				delete tmpRequestOptions.headers.cookie;
			}


			if (pQuery.logLevel > 0 ||
				_GlobalLogLevel > 0)
				_Fable.log.debug(`Request options built...`,tmpRequestOptions);

				return tmpRequestOptions;
		};

		/**
		 * Decide whether a response from the remote is a failure.
		 *
		 * Two shapes have to be caught, because meadow-endpoints hosts emit
		 * both. A non-2xx status is the easy one. The other is a 200 carrying
		 * an error envelope — `{ Error, StatusCode? }` — which is what an
		 * authorization refusal and a rejected write look like on a stock
		 * meadow-endpoints deployment. Checking only the status code accepts
		 * "you do not have rights to do that" as a successful result, so the
		 * envelope check is the load-bearing half, not the belt-and-braces one.
		 *
		 * The identity-column guard keeps a legitimate record that happens to
		 * carry an `Error` column from being mistaken for a failure: a real
		 * record from a create / update / single read always carries its
		 * identity, and an error envelope never does.
		 *
		 * @param {string} pOperation - operation name, used in the message
		 * @param {object} pResponse - the simple-get response (for statusCode)
		 * @param {*} pBody - the parsed response body
		 * @param {string} [pIdentityColumn] - the scope's identity column, when known
		 * @return {Error|null} an Error to fail the query with, or null when the response is good
		 */
		var detectResponseFailure = function(pOperation, pResponse, pBody, pIdentityColumn)
		{
			let tmpStatus = (pResponse && (typeof(pResponse.statusCode) === 'number')) ? pResponse.statusCode : 0;

			let tmpEnvelopeMessage = null;
			if (pBody && (typeof(pBody) === 'object') && !Array.isArray(pBody)
				&& (typeof(pBody.Error) === 'string') && (pBody.Error.length > 0)
				&& !(pIdentityColumn && Object.prototype.hasOwnProperty.call(pBody, pIdentityColumn)))
			{
				tmpEnvelopeMessage = pBody.Error;
			}

			if (tmpStatus >= 400)
			{
				let tmpStatusError = new Error(`Meadow-Endpoints ${pOperation} failed: HTTP ${tmpStatus}${tmpEnvelopeMessage ? ` — ${tmpEnvelopeMessage}` : ''}`);
				tmpStatusError.StatusCode = tmpStatus;
				return tmpStatusError;
			}

			if (tmpEnvelopeMessage)
			{
				let tmpEnvelopeError = new Error(`Meadow-Endpoints ${pOperation} failed: ${tmpEnvelopeMessage}`);
				tmpEnvelopeError.StatusCode = (typeof(pBody.StatusCode) === 'number') ? pBody.StatusCode
					: ((typeof(pBody.ErrorCode) === 'number') ? pBody.ErrorCode : tmpStatus);
				return tmpEnvelopeError;
			}

			return null;
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

							let tmpCreateFailure = detectResponseFailure('Create', pResponse, tmpResult.value, tmpIdentityColumn);
							if (tmpCreateFailure)
							{
								tmpResult.error = tmpCreateFailure;
								return fCallback();
							}

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

							let tmpReadFailure = detectResponseFailure('Read', pResponse, tmpResult.value, `ID${pQuery.parameters.scope}`);
							if (tmpReadFailure)
							{
								tmpResult.error = tmpReadFailure;
								return fCallback();
							}

							if (pQuery.query.body.startsWith(`${pQuery.parameters.scope}/`))
							{
								// If this is not a plural read, make the result into an array.
								tmpResult.value = [tmpResult.value];
							}

							// Past this point a read is a record set or it is nothing.
							// Meadow marshals `value` with an each() that walks an
							// object's VALUES, so a non-array here (a stray string,
							// an unrecognized envelope) becomes one garbage record
							// with a property per character rather than a failure.
							if ((tmpResult.value !== undefined) && !Array.isArray(tmpResult.value))
							{
								tmpResult.error = new Error(`Meadow-Endpoints Read returned a ${typeof(tmpResult.value)} where a record set was expected.`);
								return fCallback();
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

							let tmpUpdateFailure = detectResponseFailure('Update', pResponse, tmpResult.value, `ID${pQuery.parameters.scope}`);
							if (tmpUpdateFailure)
							{
								tmpResult.error = tmpUpdateFailure;
								return fCallback();
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

							let tmpDeleteFailure = detectResponseFailure('Delete', pResponse, tmpResult.value, `ID${pQuery.parameters.scope}`);
							if (tmpDeleteFailure)
							{
								tmpResult.error = tmpDeleteFailure;
								return fCallback();
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

							let tmpCountFailure = detectResponseFailure('Count', pResponse, tmpResult.value, `ID${pQuery.parameters.scope}`);
							if (tmpCountFailure)
							{
								tmpResult.error = tmpCountFailure;
								return fCallback();
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
