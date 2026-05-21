/**
* Unit tests for the Meadow "ALASQL" Provider
*
* These tests expect a ALASQL database.....
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

var Chai = require("chai");
var Expect = Chai.expect;
var Assert = Chai.assert;

var libALASQL = require('alasql');

var libFable = new (require('fable'))({
	LogStreams:
	[
		{
			level: 'fatal',
			streamtype:'process.stdout',
		},
		{
			streamtype: 'simpleflatfile',
			level: 'trace',
			path: __dirname+'/../tests.log'
		}
	]
});

libFable.ALASQL = libALASQL;

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
	{ "Column": "Name",      "Type":"String" },
	{ "Column": "Type",      "Type":"String" },
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
	'Meadow-Provider-ALASQL',
	function()
	{
		var newMeadow = function()
		{
			return require('../source/Meadow.js')
				.new(libFable, 'Animal')
				.setProvider('ALASQL')
				.setSchema(_AnimalSchema)
				.setJsonSchema(_AnimalJsonSchema)
				.setDefaultIdentifier('IDAnimal')
				.setDefault(_AnimalDefault);
		};

		setup
		(
			function(fDone)
			{
				fDone();
			}
		);

		suite
		(
			'Object Sanity',
			function()
			{
				test
				(
					'The ALASQL class should initialize itself into a happy little object.',
					function()
					{
						var testMeadow = require('../source/Meadow.js').new(libFable).setProvider('ALASQL');
						Expect(testMeadow).to.be.an('object', 'Meadow should initialize as an object directly from the require statement.');
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
								
								// Do the rest of these inserts
								testMeadow.doCreate(testMeadow.query.clone().addRecord({Name:'Foo Foo', Type:'Bunny'}),()=>{});
								testMeadow.doCreate(testMeadow.query.clone().addRecord({Name:'Red Riding Hood', Type:'Girl'}),()=>{});
								testMeadow.doCreate(testMeadow.query.clone().addRecord({Name:'Red', Type:'Dog'}),()=>{});
								testMeadow.doCreate(testMeadow.query.clone().addRecord({Name:'Spot', Type:'Dog'}),()=>{});
								testMeadow.doCreate(testMeadow.query.clone().addRecord({Name:'Gertrude', Type:'Frog'}),()=>{});
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
							.addRecord({Name:'Blastoise', Type:'Pokemon', Deleted: true});

						testMeadow.doCreate(tmpQuery,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have a record ....
								Expect(pRecord.Name)
									.to.equal('Blastoise');
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
									.to.equal('Blastoise');

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
								// We should have a record ....
								Expect(pRecords[0].IDAnimal)
									.to.equal(1);
								Expect(pRecords[0].Name)
									.to.equal('Blastoise');
								Expect(pRecords[1].IDAnimal)
									.to.equal(2);
								Expect(pRecords[1].Name)
									.to.equal('Foo Foo');
								Expect(pRecords[1].Type)
									.to.equal('Bunny');
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
						var tmpQuery = testMeadow.query.addFilter('IDAnimal',3);

						testMeadow.doUndelete(tmpQuery,
							function(pError, pQuery, pRecord)
							{
								// TODO: Research why this is working but not returning the row count
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
								// There should be 6 records
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
							.loadFromPackage(__dirname+'/Animal.json').setProvider('ALASQL');

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
									.to.equal('Blastoise');
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
								// We should have a record ....
								Expect(pRecords[0].IDAnimal)
									.to.equal(1);
								Expect(pRecords[0].Name)
									.to.equal('Blastoise');
								Expect(pRecords[1].IDAnimal)
									.to.equal(2);
								Expect(pRecords[1].Name)
									.to.equal('Foo Foo');
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
								// There should be 7 records .. we undeleted one!
								Expect(pRecord)
									.to.equal(7);
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
								Expect(pRecord.IDAnimal)
									.to.equal(9);
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
					'Create a record in the database with no record',
					function(fDone)
					{
						var testMeadow = newMeadow().setDefaultIdentifier('Type');

						testMeadow.doCreate(testMeadow.query,
							function(pError, pQuery, pQueryRead, pRecord)
							{
								// We should have no record because the default id is IDFableTest and our tables identity is IDAnimal
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
								// We should have a record ....
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

						testMeadow.rawQueries.loadQuery('Read', __dirname+ '/Meadow-Provider-ALASQL-AnimalReadQuery.sql',
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

						testMeadow.rawQueries.loadQuery('Read', __dirname+ '/Meadow-Provider-ALASQL-BADAnimalReadQuery.sql',
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
					'Load a raw query with no callback',
					function()
					{
						var testMeadow = newMeadow();

						testMeadow.rawQueries.loadQuery('Read', __dirname+ '/Meadow-Provider-ALASQL-AnimalReadQuery.sql');
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

						testMeadow.rawQueries.loadQuery('Read', __dirname+ '/Meadow-Provider-ALASQL-AnimalReadQuery.sql',
							function(pSuccess)
							{
								// Now try to read the record
								testMeadow.doRead(testMeadow.query.addFilter('IDAnimal', 2),
									function(pError, pQuery, pRecord)
									{
										Expect(pRecord.AnimalTypeCustom)
											.to.equal('Pokemon');
										fDone();
									}
								)
							});
					}
				);
				test
				(
					'Read records from a custom query, then delete one, then read them again then update and create.',
					function(fDone)
					{
						var testMeadow = newMeadow();
						testMeadow.setDefaultIdentifier('IDAnimal');
						testMeadow.rawQueries.setQuery('Delete', 'DELETE FROM Animal WHERE IDAnimal = 1;')
						testMeadow.rawQueries.setQuery('Count', 'SELECT 1337 AS RowCount;')
						testMeadow.rawQueries.setQuery('Read', 'SELECT IDAnimal, Type AS AnimalTypeCustom FROM FableTest <%= Where %>')
						testMeadow.rawQueries.setQuery('Update', "UPDATE FableTest SET Type = 'FrogLeg' <%= Where %>")

						// And this, my friends, is why we use async.js
						testMeadow.rawQueries.loadQuery('Reads', __dirname+ '/Meadow-Provider-ALASQL-AnimalReadQuery.sql',
							function(pSuccess)
							{
								// Now try to read the record
								testMeadow.doReads(testMeadow.query.addFilter('IDAnimal', 2),
									function(pError, pQuery, pRecords)
									{
										Expect(pRecords[1].AnimalTypeCustom)
											.to.equal('HumanGirl');
										testMeadow.doDelete(testMeadow.query.addFilter('IDAnimal', 2),
											function(pError, pQuery, pRecord)
											{
												// It returns the number of rows deleted
												Expect(pRecord)
													.to.equal(1);
												testMeadow.doCount(testMeadow.query.addFilter('IDAnimal', 2),
													function(pError, pQuery, pRecord)
													{
														// It returns the number of rows deleted
														Expect(pRecord)
															.to.equal(1337);
														
														fDone();
													}
												)
											}
										)
									}
								)
							}
						);
					}
				);
			}
		);
		suite
		(
			'Object Tests',
			function()
			{
				test
				(
					'Create a schemaless connection to a list of arbitrary objects',
					(fDone) =>
					{
						var testMeadow = require('../source/Meadow.js')
										.new(libFable, 'TestData')
										.setProvider('ALASQL')
										.setDefaultIdentifier('EmployeeID');

						testMeadow.doCreate(testMeadow.query.clone().addRecord({EmployeeID: 5, Name:'Rincewind', Type:'Wizzard'}),
							function(pError, pQuery, pQueryRead, pRecord)
							{
								Expect(pRecord.Name).to.equal('Rincewind');
								Expect(libFable.ALASQL.tables.TestData.data[0].Type).to.equal('Wizzard');
								fDone();
							}
						);
					}
				);
				test
				(
					'Bind an object to a schemaless instance',
					(fDone) =>
					{
						var myData = [
								{Brand:'Nike', Style:'Lowtop', Size:11, SKU:'11938'},
								{Brand:'Nike', Style:'Hightop', Size:10, SKU:'12954338'},
								{Brand:'Nike', Style:'FlipFlop', Size:4, SKU:'454334'},
								{Brand:'Rebok', Style:'FlipFlop', Size:11, SKU:'8763'},
								{Brand:'Rebok', Style:'Lowtop', Size:10, SKU:'a342'},
								{Brand:'Puma', Style:'Sandal', Size:10, SKU:'as3455325'},
								{Brand:'Puma', Style:'Lowtop', Size:15, SKU:'dsa33234'}
							];

						var testMeadow = require('../source/Meadow.js')
										.new(libFable, 'Shoes')
										.setProvider('ALASQL')
										.setDefaultIdentifier('SKU');
						testMeadow.provider.bindObject(myData);

						testMeadow.doReads(testMeadow.query.clone().addFilter('Brand', 'Rebok'),
							function(pError, pQuery, pRecords)
							{
								// We should have a record ....
								Expect(pRecords[0].Style)
									.to.equal('FlipFlop');
								fDone();
							}
						);
					}
				);
				test
				(
					'Create a meadow object from data',
					(fDone) =>
					{
						var myData = [
								{Brand:'Nike', Style:'Lowtop', Size:11, SKU:'11938'},
								{Brand:'Nike', Style:'Hightop', Size:10, SKU:'12954338'},
								{Brand:'Nike', Style:'FlipFlop', Size:4, SKU:'454334'},
								{Brand:'Rebok', Style:'FlipFlop', Size:11, SKU:'8763'},
								{Brand:'Rebok', Style:'Lowtop', Size:10, SKU:'a342'},
								{Brand:'Puma', Style:'Sandal', Size:10, SKU:'as3455325'},
								{Brand:'Puma', Style:'Lowtop', Size:15, SKU:'dsa33234'}
							];

						// constructFromObject's Import path drives doCreate per record,
						// which is no longer synchronous (Meadow-Create defers its
						// pre-flight callback via setImmediate to keep bulk-create
						// chains stack-safe on sync providers).  Pass a callback so
						// records are queryable before the subsequent doReads runs.
						require('../source/Meadow.js')
							.new(libFable, 'Master')
							.setProvider('ALASQL')
							.provider.constructFromObject(
								{
									Meadow: require('../source/Meadow.js').new(libFable, 'Master'),
									Scope: 'ShoeCity',
									ObjectPrototype: myData[0],
									Data: myData
								},
								function (pImportError, testMeadow)
								{
									Expect(pImportError, pImportError && pImportError.message).to.not.exist;

									testMeadow.doReads(testMeadow.query.clone().addFilter('SKU', 'dsa33234'),
										function(pError, pQuery, pRecords)
										{
											// We should have a record ....
											Expect(pRecords[0].Style)
												.to.equal('Lowtop');
											fDone();
										}
									);
								});
					}
				);
			}
		);
	}
);