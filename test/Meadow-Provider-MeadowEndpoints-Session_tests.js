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
		const tmpInstance = { settings: serverSettings(), headers: {}, cookies: [ 'UserSession=from-the-connector' ] };
		await readAnimals(buildDAL(tmpInstance));
		Expect(_LastRequest.Cookie).to.equal('UserSession=from-the-connector');
	});

	test('cookies set on the instance AFTER DAL init apply (post-connect auth)', async function ()
	{
		const tmpInstance = { settings: serverSettings(), headers: {}, cookies: [] };
		const tmpDAL = buildDAL(tmpInstance);
		tmpInstance.cookies.push('UserSession=established-later');
		await readAnimals(tmpDAL);
		Expect(_LastRequest.Cookie).to.equal('UserSession=established-later');
	});

	test('cookie ROTATION on the instance is visible on the next request', async function ()
	{
		const tmpInstance = { settings: serverSettings(), headers: {}, cookies: [ 'UserSession=first' ] };
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
