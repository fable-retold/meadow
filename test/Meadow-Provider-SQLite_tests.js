/**
* Unit tests for the Meadow "SQLite" Provider
*
* These tests use an in-process SQLite database via better-sqlite3.
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

var Chai = require("chai");
var Expect = Chai.expect;
var Assert = Chai.assert;

var libFS = require('fs');

var libMeadowConnectionSQLite = require('meadow-connection-sqlite');

var _SQLiteDBPath = __dirname + '/../dist/FableTest-SQLite.db';

var tmpFableSettings = (
{
	SQLite:
	{
		SQLiteFilePath: _SQLiteDBPath
	},
	LogStreams:
	[
		{
			level: 'fatal',
			streamtype:'process.stdout',
		},
		{
			level: 'trace',
			path: __dirname+'/../tests.log'
		}
	]
});

var libFable = new (require('fable'))(tmpFableSettings);

// Register the SQLite connection service
libFable.serviceManager.addServiceType('MeadowSQLiteProvider', libMeadowConnectionSQLite);
libFable.serviceManager.instantiateServiceProvider('MeadowSQLiteProvider');


var _AnimalJsonSchema = (
{
	title: "Animal",
	description: "A creature that lives in a meadow.",
	type: "object",
	properties: {
		IDAnimal: {
			description: "The unique identifier for an animal",
			type: "integer"
		},
		Name: {
			description: "The animal's name",
			type: "string"
		},
		Type: {
			description: "The type of the animal",
			type: "string"
		}
	},
	required: ["IDAnimal", "Name", "CreatingIDUser"]
});
var _AnimalSchema = (
[
	{ Column: "IDAnimal",        Type:"AutoIdentity" },
	{ Column: "GUIDAnimal",      Type:"AutoGUID" },
	{ Column: "CreateDate",      Type:"CreateDate" },
	{ Column: "CreatingIDUser",  Type:"CreateIDUser" },
	{ Column: "UpdateDate",        Type:"UpdateDate" },
	{ Column: "UpdatingIDUser", Type:"UpdateIDUser" },
	{ Column: "Deleted",         Type:"Deleted" },
	{ Column: "DeletingIDUser",  Type:"DeleteIDUser" },
	{ Column: "DeleteDate",      Type:"DeleteDate" },
	{ Column: "Metadata",        Type:"JSON" },
	{ Column: "ExtraData",       Type:"JSONProxy", StorageColumn:"ExtraDataJSON" }
]);
var _AnimalDefault = (
{
	IDAnimal: null,
	GUIDAnimal: '',

	CreateDate: false,
	CreatingIDUser: 0,
	UpdateDate: false,
	UpdatingIDUser: 0,
	Deleted: 0,
	DeleteDate: false,
	DeletingIDUser: 0,

	Name: 'Unknown',
	Type: 'Unclassified',

	Metadata: {},
	ExtraData: {}
});

suite
(
	'Meadow-Provider-SQLite',
	function()
	{
		var _SpooledUp = false;

		var newMeadow = function()
		{
			return require('../source/Meadow.js')
				.new(libFable, 'FableTest')
				.setProvider('SQLite')
				.setSchema(_AnimalSchema)
				.setJsonSchema(_AnimalJsonSchema)
				.setDefaultIdentifier('IDAnimal')
				.setDefault(_AnimalDefault)
		};

		suiteSetup
		(
			function(fDone)
			{
				// Only do this for the first test.
				if (!_SpooledUp)
				{
					// Remove any previous test database
					if (libFS.existsSync(_SQLiteDBPath))
					{
						libFS.unlinkSync(_SQLiteDBPath);
					}

					// Ensure the dist directory exists
					var tmpDistDir = __dirname + '/../dist';
					if (!libFS.existsSync(tmpDistDir))
					{
						libFS.mkdirSync(tmpDistDir, { recursive: true });
					}

					// Connect to SQLite
					libFable.MeadowSQLiteProvider.connectAsync(
						function(pError)
						{
							if (pError)
							{
								return fDone(pError);
							}

							var tmpDB = libFable.MeadowSQLiteProvider.db;

							// Create the FableTest table
							tmpDB.exec(
								"CREATE TABLE IF NOT EXISTS FableTest (" +
								"  IDAnimal INTEGER PRIMARY KEY AUTOINCREMENT," +
								"  GUIDAnimal TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'," +
								"  CreateDate TEXT," +
								"  CreatingIDUser INTEGER NOT NULL DEFAULT 0," +
								"  UpdateDate TEXT," +
								"  UpdatingIDUser INTEGER NOT NULL DEFAULT 0," +
								"  Deleted INTEGER NOT NULL DEFAULT 0," +
								"  DeleteDate TEXT," +
								"  DeletingIDUser INTEGER NOT NULL DEFAULT 0," +
								"  Name TEXT NOT NULL DEFAULT ''," +
								"  Type TEXT NOT NULL DEFAULT ''," +
								"  Metadata TEXT," +
								"  ExtraDataJSON TEXT" +
								");"
							);

							// Insert test data
							var tmpInsert = tmpDB.prepare(
								"INSERT INTO FableTest (GUIDAnimal, CreateDate, CreatingIDUser, UpdateDate, UpdatingIDUser, Deleted, DeleteDate, DeletingIDUser, Name, Type) " +
								"VALUES ('00000000-0000-0000-0000-000000000000', datetime('now'), 1, datetime('now'), 1, 0, NULL, 0, ?, ?)"
							);

							tmpInsert.run('Foo Foo', 'Bunny');
							tmpInsert.run('Red Riding Hood', 'Girl');
							tmpInsert.run('Red', 'Dog');
							tmpInsert.run('Spot', 'Dog');
							tmpInsert.run('Gertrude', 'Frog');

							_SpooledUp = true;
							fDone();
						}
					);
				}
				else
				{
					fDone();
				}
			}
		);

		suiteTeardown(function(fDone)
		{
			// Close the SQLite database
			try
			{
				var tmpDB = libFable.MeadowSQLiteProvider.db;
				if (tmpDB)
				{
					tmpDB.close();
				}
			}
			catch (pError)
			{
				// Ignore close errors
			}
			fDone();
		});

		suite
		(
			'Object Sanity',
			function()
			{
				test
				(
					'The SQLite class should initialize itself into a happy little object.',
					function()
					{
						var testMeadow = require('../source/Meadow.js').new(libFable).setProvider('SQLite');
						Expect(testMeadow).to.be.an('object', 'Meadow should initialize as an object directly from the require statement.');
						Expect(testMeadow.providerName).to.equal('SQLite');
					}
				);
			}
		);
		suite
		(
			'Query Processing',
			function()
			{
				test
				(
					'Create a record in the database',
					function(fDone)
					{
						var testMeadow = newMeadow().setIDUser(90210);

						// Ensure this query is "slow"...
						testMeadow.fable.settings.QueryThresholdWarnTime = 1;

						var tmpQuery = testMeadow.query.clone().setLogLevel(5)
							.addRecord({Name:'Blastoise', Type:'Pokemon'});

						testMeadow.doCreate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Name)
									.to.equal('Blastoise');
								Expect(pRecord.CreatingIDUser)
									.to.equal(90210);
								testMeadow.fable.settings.QueryThresholdWarnTime = 1000;
								fDone();
							}
						)
					}
				);
				test
					(
						'Create a record with JSON data',
						function(fDone)
						{
							var testMeadow = newMeadow().setIDUser(90210);

							var tmpQuery = testMeadow.query.clone().setLogLevel(5)
								.addRecord({Name:'Moose', Type:'Mammal', Metadata: { habitat: 'forest', weight: 500 }, ExtraData: { endangered: false, population: 'stable' }});

							testMeadow.doCreate(tmpQuery,
								function(pError, pQuery, pQueryRead, pRecord)
								{
									// We should have a record with JSON data ....
									Expect(pRecord.Name)
										.to.equal('Moose');
									Expect(pRecord.Metadata)
										.to.be.an('object');
									Expect(pRecord.Metadata.habitat)
										.to.equal('forest');
									Expect(pRecord.ExtraData)
										.to.be.an('object');
									Expect(pRecord.ExtraData.endangered)
										.to.equal(false);
									// The storage column should not be exposed on the marshaled record
									Expect(pRecord).to.not.have.property('ExtraDataJSON');
									fDone();
								}
							)
						}
					);
				test
				(
					'Create a record in the database with Deleted bit already set',
					function(fDone)
					{
						var testMeadow = newMeadow().setIDUser(90210);

						var tmpQuery = testMeadow.query.clone().setLogLevel(5)
							.setDisableDeleteTracking(true)
							.addRecord({Name:'Charmander', Type:'Pokemon', Deleted: 1});

						testMeadow.doCreate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Name)
									.to.equal('Charmander');
								Expect(pRecord.CreatingIDUser)
									.to.equal(90210);
								fDone();
							}
						)
					}
				);
				test
				(
					'Read a record from the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.fable.settings.QueryThresholdWarnTime = 1;

						var tmpQuery = testMeadow.query
							.addFilter('IDAnimal', 1);

						testMeadow.doRead(tmpQuery,
							function(pError, pQuery, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.IDAnimal)
									.to.equal(1);
								Expect(pRecord.Name)
									.to.equal('Foo Foo');

								testMeadow.fable.settings.QueryThresholdWarnTime = 1000;

								fDone();
							}
						)
					}
				);
				test
				(
					'Read all records from the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.doReads(testMeadow.query,
							function(pError, pQuery, pRecords)
							{
								// We should have records ....
								Expect(pRecords[0].IDAnimal)
									.to.equal(1);
								Expect(pRecords[0].Name)
									.to.equal('Foo Foo');
								Expect(pRecords[1].IDAnimal)
									.to.equal(2);
								Expect(pRecords[1].Name)
									.to.equal('Red Riding Hood');
								Expect(pRecords[1].Type)
									.to.equal('Girl');
								fDone();
							}
						)
					}
				);
				test
				(
					'Update a record in the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.fable.settings.QueryThresholdWarnTime = 1;

						var tmpQuery = testMeadow.query
							.addRecord({IDAnimal:2, Type:'Human'});

						testMeadow.doUpdate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Type)
									.to.equal('Human');

								testMeadow.fable.settings.QueryThresholdWarnTime = 1000;

								fDone();
							}
						)
					}
				);
				test
				(
					'Delete a record in the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.fable.settings.QueryThresholdWarnTime = 1;
						var tmpQuery = testMeadow.query.addFilter('IDAnimal',3);

						testMeadow.doDelete(tmpQuery,
							function(pError, pQuery, pRecord)
							{
								// It returns the number of rows deleted
								Expect(pRecord)
									.to.equal(1);

								testMeadow.fable.settings.QueryThresholdWarnTime = 1000;

								fDone();
							}
						)
					}
				);
				test
				(
					'Undelete a record in the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.fable.settings.QueryThresholdWarnTime = 1;
						var tmpDeleteQuery = testMeadow.query.addFilter('IDAnimal',5);

						// Make sure the record is deleted!
						testMeadow.doDelete(tmpDeleteQuery,
							function(pDeleteError, pDeleteQuery, pDeleteRecord)
							{
								var tmpQuery = testMeadow.query.addFilter('IDAnimal',5);
								testMeadow.doUndelete(tmpQuery,
									function(pError, pQuery, pRecord)
									{
										// It returns the number of rows undeleted
										Expect(pRecord)
											.to.equal(1);

										testMeadow.fable.settings.QueryThresholdWarnTime = 1000;

										fDone();
									});
							});
					}
				);
				test
				(
					'Count all records from the database',
					function(fDone)
					{
						var testMeadow = newMeadow();
						testMeadow.fable.settings.QueryThresholdWarnTime = 1;

						Expect(testMeadow.query.parameters.result.executed)
							.to.equal(false);
						testMeadow.doCount(testMeadow.query,
							function(pError, pQuery, pRecord)
							{
								// There should be 6 non-deleted records (3 not deleted seeded + Blastoise + Moose + Gertrude)
								Expect(pRecord)
									.to.equal(6);
								Expect(pQuery.parameters.result.executed)
									.to.equal(true);
								testMeadow.fable.settings.QueryThresholdWarnTime = 1000;
								fDone();
							}
						)
					}
				);
				test
				(
					'Perform operations with a schema-based instantiation',
					function(fDone)
					{
						var testMeadow = require('../source/Meadow.js').new(libFable)
							.loadFromPackage(__dirname+'/Animal.json').setProvider('SQLite');

						// Make sure the authentication stuff got loaded
						Expect(testMeadow.schemaFull.authorizer.User)
							.to.be.an('object');
						Expect(testMeadow.schemaFull.authorizer.User.Create)
							.to.equal('Allow');

						var tmpQuery = testMeadow.query
							.addRecord({Name:'Grommet', Type:'Dog'});

						testMeadow.doCreate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Name)
									.to.equal('Grommet');
								fDone();
							}
						)
					}
				);
			}
		);
		suite
		(
			'Logged Query Processing',
			function()
			{
				test
				(
					'Create a record in the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
							.setLogLevel(5)
							.addRecord({Name:'MewTwo', Type:'Pokemon'});

						testMeadow.doCreate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Name)
									.to.equal('MewTwo');
								fDone();
							}
						)
					}
				);
				test
				(
					'Create a record in the database with a predefined GUID',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
							.setLogLevel(5)
							.addRecord({Name:'MewThree', GUIDAnimal:'0x12345', Type:'Pokemon'});

						testMeadow.doCreate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Name)
									.to.equal('MewThree');
								fDone();
							}
						)
					}
				);
				test
				(
					'Create a record in the database with a previously predefined GUID -- expect failure',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
							.setLogLevel(5)
							.addRecord({Name:'MewThree', GUIDAnimal:'0x12345', Type:'Pokemon'});

						testMeadow.doCreate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								Expect(pError)
									.to.equal("Record with GUID 0x12345 already exists!");
								fDone();
							}
						)
					}
				);
				test
				(
					'Read a record from the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
							.setLogLevel(5)
							.addFilter('IDAnimal', 1);

						testMeadow.doRead(tmpQuery,
							function(pError, pQuery, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.IDAnimal)
									.to.equal(1);
								Expect(pRecord.Name)
									.to.equal('Foo Foo');
								fDone();
							}
						)
					}
				);
				test
				(
					'Read all records from the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.doReads(testMeadow.query.setLogLevel(5),
							function(pError, pQuery, pRecords)
							{
								// We should have records ....
								Expect(pRecords[0].IDAnimal)
									.to.equal(1);
								Expect(pRecords[0].Name)
									.to.equal('Foo Foo');
								Expect(pRecords[1].IDAnimal)
									.to.equal(2);
								Expect(pRecords[1].Name)
									.to.equal('Red Riding Hood');
								Expect(pRecords[1].Type)
									.to.equal('Human');
								fDone();
							}
						)
					}
				);
				test
				(
					'Update a record in the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
								.setLogLevel(5)
								.addRecord({IDAnimal:2, Type:'HumanGirl'});

						testMeadow.doUpdate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Type)
									.to.equal('HumanGirl');
								fDone();
							}
						)
					}
				);
				test
				(
					'Delete a record in the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
								.setLogLevel(5)
								.addFilter('IDAnimal',4);

						testMeadow.doDelete(tmpQuery,
							function(pError, pQuery, pRecord)
							{
								// It returns the number of rows deleted
								Expect(pRecord)
									.to.equal(1);
								fDone();
							}
						)
					}
				);
				test
				(
					'Count all records from the database',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.doCount(testMeadow.query.setLogLevel(5),
							function(pError, pQuery, pRecord)
							{
								// Count non-deleted records
								Expect(pRecord)
									.to.be.a('number');
								Expect(pRecord).to.be.above(0);
								fDone();
							}
						)
					}
				);
				test
				(
					'Read a record from the database that had a defined GUID',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
							.addFilter('GUIDAnimal', '0x12345');

						testMeadow.doRead(tmpQuery,
							function(pError, pQuery, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Name)
									.to.equal('MewThree');
								fDone();
							}
						)
					}
				);
				test
				(
					'Create a record in the database with a defined creating user',
					function(fDone)
					{
						var testMeadow = newMeadow();
						var tmpQuery = testMeadow.query
							.setIDUser(800)
							.addRecord({Name:'MewSix', GUIDAnimal:'0x123456', Type:'Pokemon'});

						testMeadow.doCreate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Name)
									.to.equal('MewSix');
								Expect(pRecord.CreatingIDUser)
									.to.equal(800);
								fDone();
							}
						)
					}
				);
			}
		);
		suite
		(
			'The Bad Kind of Query Processing',
			function()
			{
				test
				(
					'Count all records from a nonexistent table',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.doCount(testMeadow.query.setScope('BadTable'),
							function(pError, pQuery, pRecord)
							{
								// chai's type-detect classifies Error instances
								// as 'error', not 'object' — assert against the
								// type chai actually returns.
								Expect(pError)
									.to.be.an('error');
								fDone();
							}
						)
					}
				);
				test
				(
					'Create a record in the database with no record',
					function(fDone)
					{
						var testMeadow = newMeadow().setDefaultIdentifier('Type');

						testMeadow.doCreate(testMeadow.query,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								Expect(pError)
									.to.equal('No record submitted');
								fDone();
							}
						)
					}
				);
				test
				(
					'Read a record from the database with no data returned',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
							.addFilter('IDAnimal', 5000);
						testMeadow.doRead(tmpQuery,
							function(pError, pQuery, pRecord)
							{
								Expect(pRecord)
									.to.equal(false);
								fDone();
							}
						)
					}
				);
				test
				(
					'Read records from the database with no data returned',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
							.addFilter('IDAnimal', 5000);

						testMeadow.doReads(tmpQuery,
							function(pError, pQuery, pRecord)
							{
								Expect(pRecord.length)
									.to.equal(0);
								fDone();
							}
						)
					}
				);
				test
				(
					'Update a record in the database with a bad filter',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
								.setLogLevel(5)
								.addRecord({IDAnimal:undefined, Type:'HumanGirl'});

						testMeadow.doUpdate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have an error ....
								Expect(pError)
									.to.equal('Automated update missing filters... aborting!');
								fDone();
							}
						)
					}
				);
				test
				(
					'Update a record in the database without passing a record in',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.doUpdate(testMeadow.query,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								Expect(pError)
									.to.equal('No record submitted');
								fDone();
							}
						)
					}
				);
				test
				(
					'Update a record in the database with a bad record passed in (no default identifier)',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
							.addRecord({Name:'Bill'});

						testMeadow.doUpdate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								Expect(pError)
									.to.equal('Automated update missing default identifier');
								fDone();
							}
						)
					}
				);
				test
				(
					'Update a record in the database that does not exist',
					function(fDone)
					{
						var testMeadow = newMeadow();

						var tmpQuery = testMeadow.query
							.addRecord({IDAnimal:983924});

						testMeadow.doUpdate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								Expect(pError)
									.to.equal('No record found to update!');
								fDone();
							}
						)
					}
				);
				test
				(
					'Set a raw Query',
					function(fDone)
					{
						var testMeadow = newMeadow();
						testMeadow.rawQueries.setQuery('Read', 'SELECT Something from SomethingElse;');

						Expect(testMeadow.rawQueries.getQuery('Read'))
							.to.equal('SELECT Something from SomethingElse;');
						fDone();
					}
				);
				test
				(
					'Load a raw Query',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.rawQueries.loadQuery('Read', __dirname+ '/Meadow-Provider-SQLite-AnimalReadQuery.sql',
							function(pSuccess)
							{
								Expect(testMeadow.rawQueries.getQuery('Read'))
									.to.contain('SELECT');
								fDone();
							});
					}
				);
				test
				(
					'Load a bad raw Query',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.rawQueries.loadQuery('Read', __dirname+ '/Meadow-Provider-SQLite-BADAnimalReadQuery.sql',
							function(pSuccess)
							{
								Expect(testMeadow.rawQueries.getQuery('Read'))
									.to.equal('');
								fDone();
							});
					}
				);
				test
				(
					'Check for a query that is not there',
					function()
					{
						var testMeadow = newMeadow();
						Expect(testMeadow.rawQueries.getQuery('Read'))
							.to.equal(false);
					}
				);
				test
				(
					'Read a record from a custom query',
					function(fDone)
					{
						var testMeadow = newMeadow();

						testMeadow.rawQueries.loadQuery('Read', __dirname+ '/Meadow-Provider-SQLite-AnimalReadQuery.sql',
							function(pSuccess)
							{
								// Now try to read the record
								testMeadow.doRead(testMeadow.query.addFilter('IDAnimal', 2),
									function(pError, pQuery, pRecord)
									{
										Expect(pRecord.AnimalTypeCustom)
											.to.equal('Bunny');
										fDone();
									}
								)
							});
					}
				);
			}
		);
		suite
		(
			'Soft-Deleted Collision Rename (DAL layer)',
			function ()
			{
				// Schema for a separate Gadget table that exercises the rename
				// at the meadow DAL layer (no meadow-endpoints in the loop).
				// Uses a plain UNIQUE INDEX on Code — no `WHERE Deleted=0`
				// partial-index syntax — so the rename is what keeps the slot
				// reusable after a soft-delete.
				var _GadgetSchema =
				[
					{ Column: 'IDGadget',       Type: 'AutoIdentity' },
					{ Column: 'GUIDGadget',     Type: 'AutoGUID' },
					{ Column: 'CreateDate',     Type: 'CreateDate' },
					{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
					{ Column: 'UpdateDate',     Type: 'UpdateDate' },
					{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
					{ Column: 'Deleted',        Type: 'Deleted' },
					{ Column: 'DeleteDate',     Type: 'DeleteDate' },
					{ Column: 'DeletingIDUser', Type: 'DeleteIDUser' },
					{ Column: 'Code',           Type: 'String', Unique: true },
					{ Column: 'Name',           Type: 'String' }
				];
				var _GadgetDefault =
				{
					IDGadget: 0,
					GUIDGadget: '',
					CreateDate: false,
					CreatingIDUser: 0,
					UpdateDate: false,
					UpdatingIDUser: 0,
					Deleted: 0,
					DeleteDate: false,
					DeletingIDUser: 0,
					Code: '',
					Name: ''
				};

				var newGadgetMeadow = function ()
				{
					return require('../source/Meadow.js').new(libFable, 'Gadget')
						.setProvider('SQLite')
						.setSchema(_GadgetSchema)
						.setJsonSchema({ title: 'Gadget', type: 'object', properties: {}, required: [] })
						.setDefaultIdentifier('IDGadget')
						.setDefault(_GadgetDefault);
				};

				suiteSetup(function (fDone)
				{
					var tmpDB = libFable.MeadowSQLiteProvider.db;
					tmpDB.exec(
						'CREATE TABLE IF NOT EXISTS Gadget (' +
						'  IDGadget INTEGER PRIMARY KEY AUTOINCREMENT,' +
						'  GUIDGadget TEXT NOT NULL DEFAULT \'\',' +
						'  CreateDate TEXT,' +
						'  CreatingIDUser INTEGER NOT NULL DEFAULT 0,' +
						'  UpdateDate TEXT,' +
						'  UpdatingIDUser INTEGER NOT NULL DEFAULT 0,' +
						'  Deleted INTEGER NOT NULL DEFAULT 0,' +
						'  DeleteDate TEXT,' +
						'  DeletingIDUser INTEGER NOT NULL DEFAULT 0,' +
						'  Code TEXT NOT NULL DEFAULT \'\',' +
						'  Name TEXT NOT NULL DEFAULT \'\'' +
						');' +
						'CREATE UNIQUE INDEX IF NOT EXISTS gadget_code_unique ON Gadget(Code);'
					);
					return fDone();
				});

				test
				(
					'Create → soft-delete → Create-with-same-Code: rename frees the slot at the DAL layer',
					function (fDone)
					{
						var libRename = require('../source/behaviors/Meadow-CollisionRename.js');
						var tmpMeadow = newGadgetMeadow().setIDUser(1);

						var tmpFirstQuery = tmpMeadow.query.addRecord({ Code: 'orig', Name: 'first' });
						tmpMeadow.doCreate(tmpFirstQuery, function (pCreateError, pQuery, pQueryRead, pFirstRecord)
						{
							Expect(pCreateError, pCreateError && pCreateError.message ? pCreateError.message : pCreateError).to.not.exist;
							var tmpFirstID = pFirstRecord.IDGadget;
							Expect(pFirstRecord.Code).to.equal('orig');
							Expect(tmpFirstID).to.be.above(0);

							var tmpDeleteQuery = tmpMeadow.query.addFilter('IDGadget', tmpFirstID);
							tmpMeadow.doDelete(tmpDeleteQuery, function (pDeleteError, pDelQuery, pDelCount)
							{
								Expect(pDelCount).to.equal(1);

								var tmpSecondQuery = newGadgetMeadow().setIDUser(1).query.addRecord({ Code: 'orig', Name: 'second' });
								newGadgetMeadow().setIDUser(1).doCreate(tmpSecondQuery, function (pSecondError, pQuery2, pRead2, pSecond)
								{
									Expect(pSecondError, pSecondError && pSecondError.message ? pSecondError.message : pSecondError).to.not.exist;
									Expect(pSecond.Code).to.equal('orig');
									Expect(pSecond.IDGadget).to.not.equal(tmpFirstID);

									// Direct DB inspection to verify the soft-deleted
									// row's Code was renamed to the deterministic
									// __mdsd_<16hex> shape, and that the suffix matches
									// sha1("{IDRecord}:{Column}:{OriginalValue}").
									var tmpRow = libFable.MeadowSQLiteProvider.db.prepare('SELECT IDGadget, Code, Deleted FROM Gadget WHERE IDGadget = ?').get(tmpFirstID);
									Expect(tmpRow.Deleted).to.equal(1);
									var tmpExpected = libRename.buildRenamedValue(tmpFirstID, 'Code', 'orig');
									Expect(tmpRow.Code).to.equal(tmpExpected);
									fDone();
								});
							});
						});
					}
				);
			}
		);
		suite
		(
			'Bulk Create — synchronous chain stack safety',
			function ()
			{
				// Regression for the stack-overflow seen during liveconnect_local
				// bulk sync: every doCreate runs the libRenameSoftDeletedConflicts
				// pre-flight, which on a sync provider (node:sqlite) returns its
				// callback in the same tick. Combined with a synchronous caller
				// chain (eachLimit's replenish loop, or a tail-recursive driver
				// like this test), per-record frames accumulate without bound.
				// The fix is a setImmediate barrier at the pre-flight callback
				// in Meadow-Create.js so each Create yields to the event loop
				// before the INSERT runs.
				var _StackTestSchema =
				[
					{ Column: 'IDStackTest',    Type: 'AutoIdentity' },
					{ Column: 'GUIDStackTest',  Type: 'AutoGUID' },
					{ Column: 'CreateDate',     Type: 'CreateDate' },
					{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
					{ Column: 'UpdateDate',     Type: 'UpdateDate' },
					{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
					{ Column: 'Deleted',        Type: 'Deleted' },
					{ Column: 'DeleteDate',     Type: 'DeleteDate' },
					{ Column: 'DeletingIDUser', Type: 'DeleteIDUser' },
					{ Column: 'Code',           Type: 'String', Unique: true },
					{ Column: 'Name',           Type: 'String' }
				];
				var _StackTestDefault =
				{
					IDStackTest: 0,
					GUIDStackTest: '',
					CreateDate: false,
					CreatingIDUser: 0,
					UpdateDate: false,
					UpdatingIDUser: 0,
					Deleted: 0,
					DeleteDate: false,
					DeletingIDUser: 0,
					Code: '',
					Name: ''
				};

				var newStackTestMeadow = function ()
				{
					return require('../source/Meadow.js').new(libFable, 'StackTest')
						.setProvider('SQLite')
						.setSchema(_StackTestSchema)
						.setJsonSchema({ title: 'StackTest', type: 'object', properties: {}, required: [] })
						.setDefaultIdentifier('IDStackTest')
						.setDefault(_StackTestDefault);
				};

				suiteSetup(function (fDone)
				{
					var tmpDB = libFable.MeadowSQLiteProvider.db;
					tmpDB.exec(
						'CREATE TABLE IF NOT EXISTS StackTest (' +
						'  IDStackTest INTEGER PRIMARY KEY AUTOINCREMENT,' +
						'  GUIDStackTest TEXT NOT NULL DEFAULT \'\',' +
						'  CreateDate TEXT,' +
						'  CreatingIDUser INTEGER NOT NULL DEFAULT 0,' +
						'  UpdateDate TEXT,' +
						'  UpdatingIDUser INTEGER NOT NULL DEFAULT 0,' +
						'  Deleted INTEGER NOT NULL DEFAULT 0,' +
						'  DeleteDate TEXT,' +
						'  DeletingIDUser INTEGER NOT NULL DEFAULT 0,' +
						'  Code TEXT NOT NULL DEFAULT \'\',' +
						'  Name TEXT NOT NULL DEFAULT \'\'' +
						');' +
						'CREATE UNIQUE INDEX IF NOT EXISTS stacktest_code_unique ON StackTest(Code);'
					);
					return fDone();
				});

				test
				(
					'1500 sync-chained doCreate calls complete without RangeError',
					function (fDone)
					{
						// 1500 was chosen empirically: with a single Unique column
						// pre-flight (one synchronous Read per Create) plus the
						// surrounding waterfall steps, per-record frame growth
						// without the fix exceeds V8's default stack budget well
						// before reaching this count. With the fix in place each
						// iteration yields to the event loop, so frame growth is
						// bounded and the chain completes in O(seconds).
						this.timeout(30000);

						var tmpRecordCount = 1500;
						var tmpCreated = 0;
						var tmpFirstError = null;

						var fCreateNext = function (pIndex)
						{
							if (pIndex >= tmpRecordCount)
							{
								Expect(tmpFirstError, tmpFirstError && tmpFirstError.message).to.not.exist;
								Expect(tmpCreated).to.equal(tmpRecordCount);
								return fDone();
							}

							var tmpMeadow = newStackTestMeadow().setIDUser(1);
							var tmpQuery = tmpMeadow.query.addRecord(
								{
									Code: 'stack-' + pIndex,
									Name: 'row-' + pIndex
								});

							// Caller invokes the next iteration synchronously
							// inside doCreate's terminal callback — the exact
							// pattern that surfaced the bug.  Without the
							// setImmediate barrier inside Meadow-Create, this
							// chain stack-overflows in node:sqlite mid-loop.
							tmpMeadow.doCreate(tmpQuery, function (pError)
							{
								if (pError && !tmpFirstError)
								{
									tmpFirstError = pError;
								}
								else if (!pError)
								{
									tmpCreated++;
								}
								return fCreateNext(pIndex + 1);
							});
						};

						fCreateNext(0);
					}
				);
			}
		);
		suite
		(
			'Raw query overrides — parameter handling',
			function ()
			{
				// EXPECTED FAILING (until provider fix lands).
				//
				// When rawQueries.loadQuery installs a Read override that
				// doesn't reference some of the named parameters meadow's
				// query builder auto-generates (e.g. the soft-delete filter
				// `Deleted_w1`, or a user-added filter like `IDWidget_w0`),
				// the SQLite provider still binds them via
				// `statement.all(pQuery.query.parameters)`.  node:sqlite is
				// strict about unknown named parameters and throws
				// `Unknown named parameter '<name>'` — better-sqlite3 was
				// lenient about extras, so this regressed silently when
				// meadow-connection-sqlite switched to node:sqlite.
				//
				// Isolation: dedicated table + raw-query file with no
				// placeholders, so the test doesn't depend on FableTest
				// state mutated by earlier suites.
				var _WidgetSchema =
				[
					{ Column: 'IDWidget',       Type: 'AutoIdentity' },
					{ Column: 'GUIDWidget',     Type: 'AutoGUID' },
					{ Column: 'CreateDate',     Type: 'CreateDate' },
					{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
					{ Column: 'UpdateDate',     Type: 'UpdateDate' },
					{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
					{ Column: 'Deleted',        Type: 'Deleted' },
					{ Column: 'DeleteDate',     Type: 'DeleteDate' },
					{ Column: 'DeletingIDUser', Type: 'DeleteIDUser' },
					{ Column: 'Label',          Type: 'String' }
				];

				var newWidgetMeadow = function ()
				{
					return require('../source/Meadow.js').new(libFable, 'Widget')
						.setProvider('SQLite')
						.setSchema(_WidgetSchema)
						.setJsonSchema({ title: 'Widget', type: 'object', properties: {}, required: [] })
						.setDefaultIdentifier('IDWidget');
				};

				var _RawQueryPath = __dirname + '/Meadow-Provider-SQLite-WidgetRawRead.sql';

				suiteSetup(function (fDone)
				{
					var tmpDB = libFable.MeadowSQLiteProvider.db;
					tmpDB.exec(
						'CREATE TABLE IF NOT EXISTS Widget (' +
						'  IDWidget INTEGER PRIMARY KEY AUTOINCREMENT,' +
						'  GUIDWidget TEXT NOT NULL DEFAULT \'\',' +
						'  CreateDate TEXT,' +
						'  CreatingIDUser INTEGER NOT NULL DEFAULT 0,' +
						'  UpdateDate TEXT,' +
						'  UpdatingIDUser INTEGER NOT NULL DEFAULT 0,' +
						'  Deleted INTEGER NOT NULL DEFAULT 0,' +
						'  DeleteDate TEXT,' +
						'  DeletingIDUser INTEGER NOT NULL DEFAULT 0,' +
						'  Label TEXT NOT NULL DEFAULT \'\'' +
						');'
					);
					tmpDB.exec("INSERT INTO Widget (Label) VALUES ('alpha'), ('beta'), ('gamma');");

					// Raw query has no placeholders — projection-only SELECT.
					libFS.writeFileSync(_RawQueryPath,
						'SELECT IDWidget, Label AS LabelAlias FROM Widget WHERE IDWidget = 1');
					return fDone();
				});

				suiteTeardown(function (fDone)
				{
					try { libFS.unlinkSync(_RawQueryPath); } catch (pError) { /* ignore */ }
					return fDone();
				});

				test
				(
					'doRead with a meadow-generated filter still resolves a parameterless raw query',
					function (fDone)
					{
						var testMeadow = newWidgetMeadow();

						testMeadow.rawQueries.loadQuery('Read', _RawQueryPath, function (pLoaded)
						{
							Expect(pLoaded).to.equal(true);

							// addFilter generates a `:IDWidget_w0` named parameter
							// (and soft-delete tracking adds `:Deleted_w1`).
							// Neither appears in the raw SQL above.  Without
							// param-filtering in the provider, node:sqlite
							// throws "Unknown named parameter 'IDWidget_w0'".
							testMeadow.doRead(testMeadow.query.addFilter('IDWidget', 1),
								function (pError, pQuery, pRecord)
								{
									Expect(pError, pError && pError.message ? pError.message : pError).to.not.exist;
									Expect(pRecord, 'pRecord should be a marshalled object, not ' + pRecord).to.be.an('object');
									Expect(pRecord.LabelAlias).to.equal('alpha');
									fDone();
								});
						});
					}
				);
			}
		);
	}
);
