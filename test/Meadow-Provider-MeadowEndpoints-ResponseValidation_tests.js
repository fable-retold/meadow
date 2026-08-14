/**
 * Meadow MeadowEndpoints provider — response validation tests.
 *
 * The provider talks to a remote over HTTP, so unlike the SQL providers it can
 * be handed something that is not a result set at all. Two shapes matter:
 *
 *   1. a non-2xx status
 *   2. a 200 carrying an error envelope — `{ Error, StatusCode? }`
 *
 * (2) is the one that bites: a stock meadow-endpoints host answers an
 * authorization refusal and a rejected write that way, so a status-only check
 * accepts "you do not have rights to do that" as a successful result. Left
 * unvalidated, a refused read reaches Meadow-Reads, whose each() walks an
 * OBJECT's values, hands the error STRING to marshalRecordFromSourceToObject,
 * and `for...in` over a string yields one record with a property per
 * character. A refused write reports as a write that happened.
 *
 *   npx mocha test/Meadow-Provider-MeadowEndpoints-ResponseValidation_tests.js -u tdd --exit
 */

const Chai = require('chai');
const Expect = Chai.expect;
const libHttp = require('http');
const libFable = require('fable');
const libMeadow = require('../source/Meadow.js');

const ANIMAL_SCHEMA = require('./Animal.json');

let _Server = null;
let _ServerPort = 0;
// What the stub answers with next: { Status, Body }.
let _NextResponse = null;

function startStubAPI()
{
	return new Promise((fResolve) =>
	{
		_Server = libHttp.createServer((pRequest, pResponse) =>
		{
			let tmpResponse = _NextResponse || { Status: 200, Body: [] };
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

function buildDAL()
{
	let tmpFable = new libFable(
		{
			Product: 'MeadowEndpointsResponseValidationTest',
			LogStreams: [ { streamtype: 'console', level: 'fatal' } ],
			MeadowEndpoints: { ServerProtocol: 'http', ServerAddress: '127.0.0.1', ServerPort: String(_ServerPort), ServerEndpointPrefix: '1.0/' }
		});
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

suite('MeadowEndpoints provider response validation', function ()
{
	suiteSetup(async function () { await startStubAPI(); });
	suiteTeardown(function () { if (_Server) { _Server.close(); } });
	setup(function () { _NextResponse = null; });

	suite('reads', function ()
	{
		test('a 200 error envelope fails the read instead of becoming a record', async function ()
		{
			_NextResponse = { Status: 200, Body: { Error: 'You must be authenticated to access this resource.' } };
			const tmpResult = await reads(buildDAL());
			Expect(tmpResult.Error).to.be.ok;
			Expect(String(tmpResult.Error.message || tmpResult.Error)).to.contain('You must be authenticated');
		});

		test('the refusal never reaches the marshaller as a character-indexed record', async function ()
		{
			_NextResponse = { Status: 200, Body: { Error: 'You must be authenticated to access this resource.' } };
			const tmpResult = await reads(buildDAL());
			// The regression: one "record" whose keys are '0','1','2', ...
			const tmpRecords = tmpResult.Records || [];
			Expect(tmpRecords.length).to.equal(0);
			for (let i = 0; i < tmpRecords.length; i++)
			{
				Expect(Object.prototype.hasOwnProperty.call(tmpRecords[i], '0')).to.equal(false);
			}
		});

		test('a non-2xx status fails the read', async function ()
		{
			_NextResponse = { Status: 401, Body: { Error: 'Unauthorized' } };
			const tmpResult = await reads(buildDAL());
			Expect(tmpResult.Error).to.be.ok;
			Expect(String(tmpResult.Error.message || tmpResult.Error)).to.contain('401');
		});

		test('a body that is not a record set fails the read', async function ()
		{
			_NextResponse = { Status: 200, Body: '"just a bare string"' };
			const tmpResult = await reads(buildDAL());
			Expect(tmpResult.Error).to.be.ok;
			Expect(String(tmpResult.Error.message || tmpResult.Error)).to.contain('record set');
		});

		test('a normal record set still reads cleanly', async function ()
		{
			_NextResponse = { Status: 200, Body: [ { IDAnimal: 1, Name: 'Fluffy' }, { IDAnimal: 2, Name: 'Rex' } ] };
			const tmpResult = await reads(buildDAL());
			Expect(tmpResult.Error).to.not.be.ok;
			Expect(tmpResult.Records.length).to.equal(2);
			Expect(tmpResult.Records[1].Name).to.equal('Rex');
		});

		test('a record carrying its own Error column is NOT mistaken for a failure', async function ()
		{
			// The identity column is what separates a record from an envelope.
			_NextResponse = { Status: 200, Body: [ { IDAnimal: 7, Name: 'Sensor', Error: 'sensor reported a fault' } ] };
			const tmpResult = await reads(buildDAL());
			Expect(tmpResult.Error).to.not.be.ok;
			Expect(tmpResult.Records.length).to.equal(1);
			Expect(tmpResult.Records[0].Error).to.equal('sensor reported a fault');
		});
	});

	suite('writes', function ()
	{
		test('a 200 error envelope fails the create instead of reporting a write', async function ()
		{
			_NextResponse = { Status: 200, Body: { Error: 'You do not have rights to create a Animal for a different customer!', ErrorCode: 1 } };
			const tmpResult = await create(buildDAL(), { Name: 'Ghost' });
			Expect(tmpResult.Error).to.be.ok;
			Expect(String(tmpResult.Error.message || tmpResult.Error)).to.contain('do not have rights');
		});

		test('a non-2xx status fails the create', async function ()
		{
			_NextResponse = { Status: 403, Body: { Error: 'Forbidden' } };
			const tmpResult = await create(buildDAL(), { Name: 'Ghost' });
			Expect(tmpResult.Error).to.be.ok;
		});
	});

	suite('caller context on follow-up queries', function ()
	{
		test('the post-create re-read carries the caller session', async function ()
		{
			// foxhound's clone() carries almost nothing forward, so the re-read
			// Meadow-Create issues after a write used to go out anonymously. On a
			// row-scoped remote that returns "Record not Found" for a record that
			// was just created successfully.
			let tmpSeen = [];
			_NextResponse = { Status: 200, Body: { IDAnimal: 99, Name: 'Fresh' } };
			const tmpDAL = buildDAL();
			// Capture what each request presented upstream.
			const tmpOriginal = _Server.listeners('request')[0];
			_Server.removeAllListeners('request');
			_Server.on('request', (pRequest, pResponse) =>
			{
				tmpSeen.push({ URL: pRequest.url, Cookie: pRequest.headers.cookie || '' });
				return tmpOriginal(pRequest, pResponse);
			});

			await new Promise((fResolve) =>
			{
				let tmpQuery = tmpDAL.query.clone().addRecord({ Name: 'Fresh' });
				tmpQuery.query.parameters.MeadowEndpointsSessionOverride = { SessionID: 'caller-xyz' };
				tmpDAL.doCreate(tmpQuery, () => fResolve());
			});

			_Server.removeAllListeners('request');
			_Server.on('request', tmpOriginal);

			Expect(tmpSeen.length).to.be.greaterThan(1, 'a create should issue the write and then the re-read');
			for (let i = 0; i < tmpSeen.length; i++)
			{
				Expect(tmpSeen[i].Cookie).to.equal('UserSession=caller-xyz', `request ${i} (${tmpSeen[i].URL}) lost the caller session`);
			}
		});
	});

	suite('count', function ()
	{
		test('a 200 error envelope fails the count instead of yielding -1', async function ()
		{
			_NextResponse = { Status: 200, Body: { Error: 'You must be authenticated to access this resource.' } };
			const tmpResult = await count(buildDAL());
			Expect(tmpResult.Error).to.be.ok;
		});

		test('a normal count still reads cleanly', async function ()
		{
			_NextResponse = { Status: 200, Body: { Count: 42 } };
			const tmpResult = await count(buildDAL());
			Expect(tmpResult.Error).to.not.be.ok;
			Expect(tmpResult.Count).to.equal(42);
		});
	});
});
