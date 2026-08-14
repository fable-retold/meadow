/**
 * Meadow MeadowEndpoints provider — instance-driven configuration tests.
 *
 * The provider follows the SQL-provider convention: the DAL's fable carries
 * the live connection instance at fable.MeadowMeadowEndpointsProvider, which
 * OWNS the connection parameters and the session state (headers/cookies) —
 * read per request, so post-connect authentication and cookie rotation
 * always apply. fable.settings.MeadowEndpoints remains the STATIC fallback
 * for standalone DAL usage (host/port/prefix only; settings carry no session
 * state).
 *
 *   npx mocha test/Meadow-Provider-MeadowEndpoints-Session_tests.js -u tdd --exit
 */

const Chai = require('chai');
const Expect = Chai.expect;
const libHttp = require('http');
const libFable = require('fable');
const libMeadow = require('../source/Meadow.js');

const ANIMAL_SCHEMA = require('./Animal.json');

let _Server = null;
let _ServerPort = 0;
let _LastRequest = null;

function startStubAPI()
{
	return new Promise((fResolve) =>
	{
		_Server = libHttp.createServer((pRequest, pResponse) =>
		{
			_LastRequest = { URL: pRequest.url, Cookie: pRequest.headers.cookie || '', Headers: pRequest.headers };
			pResponse.writeHead(200, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify([ { IDAnimal: 1, Name: 'Stub' } ]));
		});
		_Server.listen(0, '127.0.0.1', () =>
		{
			_ServerPort = _Server.address().port;
			fResolve();
		});
	});
}

function serverSettings()
{
	return { ServerProtocol: 'http', ServerAddress: '127.0.0.1', ServerPort: String(_ServerPort), ServerEndpointPrefix: '1.0/' };
}

// Presenting the connection's own login when a request carries no caller
// session is opt-in — a beacon services other people's requests, so acting as
// itself has to be a deliberate deployment choice. Tests that exercise the
// bound-cookie plumbing therefore have to turn it on.
function serverSettingsWithBoundFallback()
{
	return Object.assign(serverSettings(), { AllowBoundSessionFallback: true });
}

function buildDAL(pBoundInstance, pStaticSettings)
{
	let tmpFable = new libFable(
		{
			Product: 'MeadowEndpointsInstanceTest',
			LogStreams: [ { streamtype: 'console', level: 'fatal' } ],
			MeadowEndpoints: pStaticSettings
		});
	if (pBoundInstance)
	{
		// The binding the dynamic-endpoint layer performs for live connections.
		tmpFable.MeadowMeadowEndpointsProvider = pBoundInstance;
	}
	let tmpMeadow = libMeadow.new(tmpFable).loadFromPackageObject(ANIMAL_SCHEMA);
	tmpMeadow.setProvider('MeadowEndpoints');
	return tmpMeadow;
}

function readAnimals(pDAL)
{
	return new Promise((fResolve) =>
	{
		pDAL.doReads(pDAL.query.clone().setCap(1), (pError, pQuery, pRecords) => fResolve({ Error: pError, Records: pRecords }));
	});
}

suite('MeadowEndpoints provider instance-driven configuration', function ()
{
	suiteSetup(async function () { await startStubAPI(); });
	suiteTeardown(function () { if (_Server) { _Server.close(); } });
	setup(function () { _LastRequest = null; });

	test('a bound instance supplies connection parameters AND session cookies', async function ()
	{
		const tmpInstance = { settings: serverSettingsWithBoundFallback(), headers: {}, cookies: [ 'UserSession=from-the-connector' ] };
		await readAnimals(buildDAL(tmpInstance));
		Expect(_LastRequest.Cookie).to.equal('UserSession=from-the-connector');
	});

	test('cookies set on the instance AFTER DAL init apply (post-connect auth)', async function ()
	{
		const tmpInstance = { settings: serverSettingsWithBoundFallback(), headers: {}, cookies: [] };
		const tmpDAL = buildDAL(tmpInstance);
		tmpInstance.cookies.push('UserSession=established-later');
		await readAnimals(tmpDAL);
		Expect(_LastRequest.Cookie).to.equal('UserSession=established-later');
	});

	test('cookie ROTATION on the instance is visible on the next request', async function ()
	{
		const tmpInstance = { settings: serverSettingsWithBoundFallback(), headers: {}, cookies: [ 'UserSession=first' ] };
		const tmpDAL = buildDAL(tmpInstance);
		await readAnimals(tmpDAL);
		Expect(_LastRequest.Cookie).to.equal('UserSession=first');
		tmpInstance.cookies.length = 0;
		tmpInstance.cookies.push('UserSession=rotated');
		await readAnimals(tmpDAL);
		Expect(_LastRequest.Cookie).to.equal('UserSession=rotated');
	});

	test('instance headers ride along with requests', async function ()
	{
		const tmpInstance = { settings: serverSettings(), headers: { 'x-service-trust': 'instance-header' }, cookies: [] };
		await readAnimals(buildDAL(tmpInstance));
		Expect(_LastRequest.Headers['x-service-trust']).to.equal('instance-header');
	});

	test('without a bound instance, static settings supply the URL and requests are anonymous', async function ()
	{
		const tmpOutcome = await readAnimals(buildDAL(null, serverSettings()));
		Expect(_LastRequest.Cookie).to.equal('');
		Expect(Array.isArray(tmpOutcome.Records)).to.equal(true);
	});
});

function readAnimalsWithSession(pDAL, pSessionOverride)
{
	return new Promise((fResolve) =>
	{
		let tmpQuery = pDAL.query.clone().setCap(1);
		tmpQuery.query.parameters.MeadowEndpointsSessionOverride = pSessionOverride;
		pDAL.doReads(tmpQuery, (pError, pQuery, pRecords) => fResolve({ Error: pError, Records: pRecords }));
	});
}

suite('MeadowEndpoints provider per-request session override', function ()
{
	suiteSetup(async function () { await startStubAPI(); });
	suiteTeardown(function () { if (_Server) { _Server.close(); } });
	setup(function () { _LastRequest = null; });

	test('a forwarded caller session is presented upstream INSTEAD of the bound machine session', async function ()
	{
		const tmpInstance = { settings: serverSettings(), headers: {}, cookies: [ 'UserSession=machine-bound' ] };
		await readAnimalsWithSession(buildDAL(tmpInstance), { SessionID: 'caller-session-xyz' });
		Expect(_LastRequest.Cookie).to.equal('UserSession=caller-session-xyz', 'the per-request caller session wins; the bound machine session is not sent');
	});

	test('the upstream cookie name follows the connection Authentication.CookieName', async function ()
	{
		const tmpSettings = Object.assign(serverSettings(), { Authentication: { CookieName: 'SessionID' } });
		const tmpInstance = { settings: tmpSettings, headers: {}, cookies: [ 'SessionID=machine-bound' ] };
		await readAnimalsWithSession(buildDAL(tmpInstance), { SessionID: 'caller-abc' });
		Expect(_LastRequest.Cookie).to.equal('SessionID=caller-abc');
	});

	test('a placeholder session (0x0000) is not an identity — with the opt-in, the bound session is used', async function ()
	{
		const tmpInstance = { settings: serverSettingsWithBoundFallback(), headers: {}, cookies: [ 'UserSession=machine-bound' ] };
		await readAnimalsWithSession(buildDAL(tmpInstance), { SessionID: '0x0000' });
		Expect(_LastRequest.Cookie).to.equal('UserSession=machine-bound');
	});

	test('a placeholder session (0x0000) without the opt-in sends NO session', async function ()
	{
		const tmpInstance = { settings: serverSettings(), headers: {}, cookies: [ 'UserSession=machine-bound' ] };
		await readAnimalsWithSession(buildDAL(tmpInstance), { SessionID: '0x0000' });
		Expect(_LastRequest.Cookie).to.equal('', 'a placeholder is not a caller identity, and the connection\'s login is not a stand-in for one');
	});

	test('no override and no opt-in → NO session is presented upstream', async function ()
	{
		const tmpInstance = { settings: serverSettings(), headers: {}, cookies: [ 'UserSession=machine-bound' ] };
		await readAnimals(buildDAL(tmpInstance));
		Expect(_LastRequest.Cookie).to.equal('', 'the remote decides what an unauthenticated caller may see — the beacon does not answer as itself');
	});

	test('no override WITH the opt-in → the bound connection session', async function ()
	{
		const tmpInstance = { settings: serverSettingsWithBoundFallback(), headers: {}, cookies: [ 'UserSession=machine-bound' ] };
		await readAnimals(buildDAL(tmpInstance));
		Expect(_LastRequest.Cookie).to.equal('UserSession=machine-bound');
	});
});

suite('MeadowEndpoints provider request timeout', function ()
{
	suiteSetup(async function () { await startStubAPI(); });
	suiteTeardown(function () { if (_Server) { _Server.close(); } });

	test('an explicit request timeout is always set (Node 20+ globalAgent ~5s default workaround)', function (fDone)
	{
		// Intercept the socket-level options by reading from a slow-but-fine
		// stub: the request must carry a timeout >= the configured value, so
		// the platform default never applies.
		const libHTTP = require('http');
		const tmpOriginalRequest = libHTTP.request;
		let tmpCapturedOptions = null;
		libHTTP.request = function (pOptions, fResponseHandler)
		{
			tmpCapturedOptions = pOptions;
			return tmpOriginalRequest.call(libHTTP, pOptions, fResponseHandler);
		};
		const tmpDAL = buildDAL(null, serverSettings());
		readAnimals(tmpDAL).then((pOutcome) =>
		{
			libHTTP.request = tmpOriginalRequest;
			Expect(tmpCapturedOptions).to.be.an('object');
			Expect(tmpCapturedOptions.timeout).to.equal(60000, 'default 60s');
			fDone();
		}).catch((pError) => { libHTTP.request = tmpOriginalRequest; fDone(pError); });
	});

	test('the connection settings RequestTimeout overrides the default', function (fDone)
	{
		const libHTTP = require('http');
		const tmpOriginalRequest = libHTTP.request;
		let tmpCapturedOptions = null;
		libHTTP.request = function (pOptions, fResponseHandler)
		{
			tmpCapturedOptions = pOptions;
			return tmpOriginalRequest.call(libHTTP, pOptions, fResponseHandler);
		};
		const tmpSettings = Object.assign(serverSettings(), { RequestTimeout: 120000 });
		const tmpDAL = buildDAL(null, tmpSettings);
		readAnimals(tmpDAL).then(() =>
		{
			libHTTP.request = tmpOriginalRequest;
			Expect(tmpCapturedOptions.timeout).to.equal(120000);
			fDone();
		}).catch((pError) => { libHTTP.request = tmpOriginalRequest; fDone(pError); });
	});
});

suite('MeadowEndpoints provider additional query string', function ()
{
	suiteSetup(async function () { await startStubAPI(); });
	suiteTeardown(function () { if (_Server) { _Server.close(); } });

	test('AdditionalQueryString is appended to read URLs (e.g. skipDecoration=true)', function (fDone)
	{
		const libHTTP = require('http');
		const tmpOriginalRequest = libHTTP.request;
		let tmpCapturedPath = null;
		libHTTP.request = function (pOptions, fResponseHandler)
		{
			tmpCapturedPath = pOptions.path;
			return tmpOriginalRequest.call(libHTTP, pOptions, fResponseHandler);
		};
		const tmpSettings = Object.assign(serverSettings(), { AdditionalQueryString: 'skipDecoration=true' });
		const tmpDAL = buildDAL(null, tmpSettings);
		readAnimals(tmpDAL).then(() =>
		{
			libHTTP.request = tmpOriginalRequest;
			Expect(tmpCapturedPath).to.contain('?skipDecoration=true');
			fDone();
		}).catch((pError) => { libHTTP.request = tmpOriginalRequest; fDone(pError); });
	});
});
