/**
 * Meadow MeadowEndpoints provider — transport selection tests.
 *
 * The provider prefers fable's RestClient, which owns timeouts, cookie
 * composition, redirects and transient-failure classification. That service
 * only arrived in fable 3.0.27, and instantiateServiceProviderWithoutRegistration
 * in 3.1.0, while this provider has worked against every fable back to 3.0.11 —
 * so it falls back to simple-get when the host fable is older.
 *
 * The fallback is by nature almost never exercised: every current host has a
 * RestClient. These tests drive it deliberately, because untested inert code is
 * exactly the kind that stops working without anyone noticing.
 *
 * Transport is identified by the `accept` header — the RestClient issues JSON
 * requests (`accept: application/json`), the simple-get fallback does not set
 * one for reads.
 *
 *   npx mocha test/Meadow-Provider-MeadowEndpoints-Transport_tests.js -u tdd --exit
 */

const Chai = require('chai');
const Expect = Chai.expect;
const libHttp = require('http');
const libFable = require('fable');
const libMeadow = require('../source/Meadow.js');

const ANIMAL_SCHEMA = require('./Animal.json');

let _Server = null;
let _ServerPort = 0;
let _NextResponse = null;
let _LastRequest = null;
// A scripted sequence of responses, one per request, for retry tests. Falls
// back to _NextResponse once exhausted.
let _ResponseScript = null;
let _RequestCount = 0;

function startStubAPI()
{
	return new Promise((fResolve) =>
	{
		_Server = libHttp.createServer((pRequest, pResponse) =>
		{
			_LastRequest = { Accept: pRequest.headers.accept || null, Method: pRequest.method };
			_RequestCount++;
			let tmpResponse = (_ResponseScript && _ResponseScript.length > 0)
				? _ResponseScript.shift()
				: (_NextResponse || { Status: 200, Body: [] });
			if (tmpResponse.Status === 204)
			{
				pResponse.writeHead(204);
				return pResponse.end();
			}
			let tmpBody = (typeof (tmpResponse.Body) === 'string') ? tmpResponse.Body : JSON.stringify(tmpResponse.Body);
			pResponse.writeHead(tmpResponse.Status, { 'Content-Type': 'application/json' });
			pResponse.end(tmpBody);
		});
		_Server.listen(0, '127.0.0.1', () =>
		{
			_ServerPort = _Server.address().port;
			fResolve();
		});
	});
}

/**
 * @param {boolean} pSimulateFableWithoutRestClient - strip the 3.1.0+ instantiation API off the fable.
 * @param {Record<string, any>} [pExtraEndpointSettings] - merged onto the MeadowEndpoints settings bag.
 * @param {Function} [pReadRetryClassifier] - bound to a live connection instance on the fable.
 */
function buildDAL(pSimulateFableWithoutRestClient, pExtraEndpointSettings, pReadRetryClassifier)
{
	let tmpEndpointSettings = Object.assign(
		{ ServerProtocol: 'http', ServerAddress: '127.0.0.1', ServerPort: String(_ServerPort), ServerEndpointPrefix: '1.0/' },
		pExtraEndpointSettings || {});
	let tmpFable = new libFable(
		{
			Product: 'MeadowEndpointsTransportTest',
			LogStreams: [ { streamtype: 'console', level: 'fatal' } ],
			MeadowEndpoints: tmpEndpointSettings
		});
	if (pReadRetryClassifier)
	{
		// The provider reads a classifier off the live connection instance --
		// fable's settings merge drops functions, so it cannot arrive any other way.
		tmpFable.MeadowMeadowEndpointsProvider =
			{ settings: tmpEndpointSettings, headers: {}, cookies: [], readRetryClassifier: pReadRetryClassifier };
	}
	if (pSimulateFableWithoutRestClient)
	{
		tmpFable.instantiateServiceProviderWithoutRegistration = undefined;
	}
	let tmpMeadow = libMeadow.new(tmpFable).loadFromPackageObject(ANIMAL_SCHEMA);
	tmpMeadow.setProvider('MeadowEndpoints');
	return tmpMeadow;
}

function reads(pDAL)
{
	return new Promise((fResolve) =>
	{
		pDAL.doReads(pDAL.query.clone().setCap(5), (pError, pQuery, pRecords) => fResolve({ Error: pError, Records: pRecords }));
	});
}

function count(pDAL)
{
	return new Promise((fResolve) =>
	{
		pDAL.doCount(pDAL.query.clone(), (pError, pQuery, pCount) => fResolve({ Error: pError, Count: pCount }));
	});
}

function create(pDAL, pRecord)
{
	return new Promise((fResolve) =>
	{
		pDAL.doCreate(pDAL.query.clone().addRecord(pRecord), (pError, pQuery, pQueryRead, pRecordResult) => fResolve({ Error: pError, Record: pRecordResult }));
	});
}

function deletes(pDAL)
{
	return new Promise((fResolve) =>
	{
		pDAL.doDelete(pDAL.query.clone().addFilter('IDAnimal', 1), (pError, pQuery, pResult) => fResolve({ Error: pError, Result: pResult }));
	});
}

suite('MeadowEndpoints provider transport selection', function ()
{
	suiteSetup(async function () { await startStubAPI(); });
	suiteTeardown(function () { if (_Server) { _Server.close(); } });
	setup(function () { _NextResponse = null; _LastRequest = null; _ResponseScript = null; _RequestCount = 0; });

	suite('with a modern fable', function ()
	{
		test('reads are served by the RestClient', async function ()
		{
			_NextResponse = { Status: 200, Body: [ { IDAnimal: 7, Name: 'Rex' } ] };
			const tmpResult = await reads(buildDAL(false));
			Expect(tmpResult.Error).to.not.be.ok;
			Expect(_LastRequest.Accept).to.equal('application/json');
			Expect(tmpResult.Records.length).to.equal(1);
			Expect(tmpResult.Records[0].Name).to.equal('Rex');
		});
	});

	suite('with a fable that predates the RestClient', function ()
	{
		test('reads fall back to simple-get and return the same records', async function ()
		{
			_NextResponse = { Status: 200, Body: [ { IDAnimal: 7, Name: 'Rex' } ] };
			const tmpResult = await reads(buildDAL(true));
			Expect(tmpResult.Error).to.not.be.ok;
			Expect(_LastRequest.Accept).to.not.equal('application/json');
			Expect(tmpResult.Records.length).to.equal(1);
			Expect(tmpResult.Records[0].Name).to.equal('Rex');
		});

		test('a 200 error envelope still fails the read', async function ()
		{
			_NextResponse = { Status: 200, Body: { Error: 'You must be authenticated to access this resource.' } };
			const tmpResult = await reads(buildDAL(true));
			Expect(tmpResult.Error).to.be.ok;
			Expect(String(tmpResult.Error.message || tmpResult.Error)).to.contain('You must be authenticated');
		});

		test('a non-2xx still fails the read', async function ()
		{
			_NextResponse = { Status: 401, Body: { Error: 'Nope.' } };
			const tmpResult = await reads(buildDAL(true));
			Expect(tmpResult.Error).to.be.ok;
			Expect(String(tmpResult.Error.message || tmpResult.Error)).to.contain('401');
		});

		test('an unparseable body fails rather than reaching the marshaller', async function ()
		{
			_NextResponse = { Status: 200, Body: '<html>not json</html>' };
			const tmpResult = await count(buildDAL(true));
			Expect(tmpResult.Error).to.be.ok;
			Expect(String(tmpResult.Error.message || tmpResult.Error)).to.contain('Failed to parse Count response as JSON');
		});

		test('a bodyless 204 completes without an error', async function ()
		{
			_NextResponse = { Status: 204 };
			const tmpResult = await deletes(buildDAL(true));
			Expect(tmpResult.Error).to.not.be.ok;
		});

		test('a normal count still reads cleanly', async function ()
		{
			_NextResponse = { Status: 200, Body: { Count: 42 } };
			const tmpResult = await count(buildDAL(true));
			Expect(tmpResult.Error).to.not.be.ok;
			Expect(tmpResult.Count).to.equal(42);
		});

		test('ReadRetry is ignored, because the fallback has no policy engine', async function ()
		{
			_ResponseScript = [ { Status: 502, Body: { Error: 'Bad gateway' } } ];
			_NextResponse = { Status: 200, Body: [ { IDAnimal: 7, Name: 'Rex' } ] };
			const tmpResult = await reads(buildDAL(true, { ReadRetry: { MaxAttempts: 3, InitialDelayMS: 1 } }));
			Expect(tmpResult.Error).to.be.ok;
			Expect(_RequestCount).to.equal(1);
		});
	});

	suite('read retry', function ()
	{
		test('unconfigured reads carry no retry policy and are not replayed', async function ()
		{
			_ResponseScript = [ { Status: 502, Body: { Error: 'Bad gateway' } } ];
			_NextResponse = { Status: 200, Body: [ { IDAnimal: 7, Name: 'Rex' } ] };
			const tmpResult = await reads(buildDAL(false));
			Expect(tmpResult.Error).to.be.ok;
			Expect(_RequestCount).to.equal(1);
		});

		test('a configured read replays a transient gateway failure and succeeds', async function ()
		{
			_ResponseScript =
				[
					{ Status: 502, Body: { Error: 'Bad gateway' } },
					{ Status: 503, Body: { Error: 'Unavailable' } },
					{ Status: 200, Body: [ { IDAnimal: 7, Name: 'Rex' } ] }
				];
			const tmpResult = await reads(buildDAL(false, { ReadRetry: { MaxAttempts: 3, InitialDelayMS: 1 } }));
			Expect(tmpResult.Error).to.not.be.ok;
			Expect(_RequestCount).to.equal(3);
			Expect(tmpResult.Records[0].Name).to.equal('Rex');
		});

		test('a count is retried on the same policy', async function ()
		{
			_ResponseScript =
				[
					{ Status: 503, Body: { Error: 'Unavailable' } },
					{ Status: 200, Body: { Count: 42 } }
				];
			const tmpResult = await count(buildDAL(false, { ReadRetry: { MaxAttempts: 3, InitialDelayMS: 1 } }));
			Expect(tmpResult.Error).to.not.be.ok;
			Expect(_RequestCount).to.equal(2);
			Expect(tmpResult.Count).to.equal(42);
		});

		test('a WRITE is never replayed, even with a read policy configured', async function ()
		{
			// A meadow-endpoints Create has no idempotency key: replaying a POST
			// whose response was lost would risk a duplicate record.
			_ResponseScript = [ { Status: 502, Body: { Error: 'Bad gateway' } } ];
			_NextResponse = { Status: 200, Body: { IDAnimal: 9 } };
			const tmpResult = await create(buildDAL(false, { ReadRetry: { MaxAttempts: 3, InitialDelayMS: 1 } }), { Name: 'Rex' });
			Expect(tmpResult.Error).to.be.ok;
			Expect(_RequestCount).to.equal(1);
		});

		test('a classifier can retry a transient 200 error envelope', async function ()
		{
			// detectResponseFailure treats every envelope as terminal, which is
			// right for a refusal and wrong for a deadlock.
			_ResponseScript =
				[
					{ Status: 200, Body: { Error: 'deadlock detected, try again' } },
					{ Status: 200, Body: [ { IDAnimal: 7, Name: 'Rex' } ] }
				];
			const fClassifier = (pContext) =>
			{
				const tmpEnvelope = (pContext.Body && typeof (pContext.Body.Error) === 'string') ? pContext.Body.Error : '';
				return (/deadlock|unavailable/i.test(tmpEnvelope)) ? 'retry' : null;
			};
			const tmpResult = await reads(buildDAL(false, { ReadRetry: { MaxAttempts: 3, InitialDelayMS: 1 } }, fClassifier));
			Expect(tmpResult.Error).to.not.be.ok;
			Expect(_RequestCount).to.equal(2);
			Expect(tmpResult.Records[0].Name).to.equal('Rex');
		});

		test('a classifier does not rescue an authorization refusal', async function ()
		{
			_ResponseScript = [ { Status: 200, Body: { Error: 'You do not have rights to do that.' } } ];
			const fClassifier = (pContext) =>
			{
				const tmpEnvelope = (pContext.Body && typeof (pContext.Body.Error) === 'string') ? pContext.Body.Error : '';
				return (/deadlock|unavailable/i.test(tmpEnvelope)) ? 'retry' : null;
			};
			const tmpResult = await reads(buildDAL(false, { ReadRetry: { MaxAttempts: 3, InitialDelayMS: 1 } }, fClassifier));
			Expect(tmpResult.Error).to.be.ok;
			Expect(String(tmpResult.Error.message || tmpResult.Error)).to.contain('do not have rights');
			Expect(_RequestCount).to.equal(1);
		});
	});
});
