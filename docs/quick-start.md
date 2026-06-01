# Quick Start

This guide walks you through installing Meadow, connecting to a database, and performing every core CRUD operation.

## Installation

Meadow requires [Fable](https://fable-retold.github.io/fable/) as its runtime container and a connection module for your chosen database. Install all three:

```bash
npm install meadow fable meadow-connection-mysql
```

Replace `meadow-connection-mysql` with the connection module that matches your database. Available connection modules include `meadow-connection-mssql`, `meadow-connection-sqlite`, `meadow-connection-rocksdb`, and others.

## Creating a Fable Instance

Fable provides configuration, logging, and dependency injection. Create a Fable instance with your database connection settings:

```javascript
var libFable = require('fable');

var _Fable = new libFable(
	{
		MeadowProvider: 'MySQL',
		MySQL:
		{
			Server: 'localhost',
			Port: 3306,
			User: 'root',
			Password: 'my-secret-pw',
			Database: 'bookstore',
			ConnectionPoolLimit: 20
		}
	});
```

## Registering a Connection Provider

Before Meadow can execute queries, the database connection pool must be registered on the Fable instance. Each connection module attaches its pool to a well-known property on Fable.

For MySQL using `meadow-connection-mysql`:

```javascript
var libMeadowConnectionMySQL = require('meadow-connection-mysql');

var tmpConnectionProvider = libMeadowConnectionMySQL.new(_Fable);
tmpConnectionProvider.connect(
	function (pError)
	{
		if (pError)
		{
			console.log('Connection error:', pError);
			return;
		}
		console.log('Connected to MySQL');
		// Meadow is now ready to execute queries
	});
```

For the legacy approach, you can also create a pool manually:

```javascript
var libMySQL = require('mysql2');

_Fable.MeadowMySQLConnectionPool = libMySQL.createPool(
	{
		connectionLimit: _Fable.settings.MySQL.ConnectionPoolLimit,
		host: _Fable.settings.MySQL.Server,
		port: _Fable.settings.MySQL.Port,
		user: _Fable.settings.MySQL.User,
		password: _Fable.settings.MySQL.Password,
		database: _Fable.settings.MySQL.Database,
		namedPlaceholders: true
	});
```

## Creating a Meadow DAL

Create a new Meadow data access layer (DAL) for an entity by calling `meadow.new()` with a Fable instance and an entity scope name:

```javascript
var libMeadow = require('meadow');

var tmpBookDAL = libMeadow.new(_Fable, 'Book');
```

The scope name (here `'Book'`) determines the database table name for queries and establishes naming conventions for the default identifier column (`IDBook`) and GUID column (`GUIDBook`).

## Setting Provider, Default Identifier, and Schema

Chain configuration calls to set up the provider, default identifier, and schema:

```javascript
var tmpBookDAL = libMeadow.new(_Fable, 'Book')
	.setProvider('MySQL')
	.setDefaultIdentifier('IDBook')
	.setSchema(
		[
			{ Column: 'IDBook', Type: 'AutoIdentity' },
			{ Column: 'GUIDBook', Type: 'AutoGUID' },
			{ Column: 'Title', Type: 'String', Size: '255' },
			{ Column: 'Author', Type: 'String', Size: '128' },
			{ Column: 'YearPublished', Type: 'Number' },
			{ Column: 'CreateDate', Type: 'CreateDate' },
			{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
			{ Column: 'UpdateDate', Type: 'UpdateDate' },
			{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
			{ Column: 'Deleted', Type: 'Deleted' },
			{ Column: 'DeleteDate', Type: 'DeleteDate' },
			{ Column: 'DeletingIDUser', Type: 'DeleteIDUser' }
		])
	.setDefault(
		{
			IDBook: null,
			GUIDBook: '',
			Title: '',
			Author: '',
			YearPublished: 0,
			CreateDate: false,
			CreatingIDUser: 0,
			UpdateDate: false,
			UpdatingIDUser: 0,
			Deleted: 0,
			DeleteDate: false,
			DeletingIDUser: 0
		});
```

If you do not call `setProvider()` explicitly, Meadow uses the `MeadowProvider` value from Fable settings (defaulting to `'None'`).

## CRUD Walkthrough

Every CRUD operation follows the same pattern: obtain a query from `meadow.query`, configure it, then pass it to a `do*` method with a callback.

### Create a Record

```javascript
var tmpQuery = tmpBookDAL.query
	.addRecord(
		{
			Title: 'Dune',
			Author: 'Frank Herbert',
			YearPublished: 1965
		});

tmpBookDAL.doCreate(tmpQuery,
	function (pError, pCreateQuery, pReadQuery, pRecord)
	{
		if (pError)
		{
			console.log('Create error:', pError);
			return;
		}
		console.log('Created book:', pRecord.IDBook, '-', pRecord.Title);
	});
```

The create behavior performs three steps internally: checks GUID uniqueness (if a GUID is provided), inserts the record, and reads it back. The callback receives the fully marshalled record with its new auto-generated `IDBook`.

### Read a Single Record

```javascript
var tmpQuery = tmpBookDAL.query
	.addFilter('IDBook', 1);

tmpBookDAL.doRead(tmpQuery,
	function (pError, pQuery, pRecord)
	{
		if (pError)
		{
			console.log('Read error:', pError);
			return;
		}
		if (!pRecord)
		{
			console.log('No record found');
			return;
		}
		console.log('Read:', pRecord.Title, 'by', pRecord.Author);
	});
```

### Update a Record

```javascript
var tmpQuery = tmpBookDAL.query
	.addRecord(
		{
			IDBook: 1,
			Title: 'Dune (Revised Edition)',
			Author: 'Frank Herbert'
		});

tmpBookDAL.doUpdate(tmpQuery,
	function (pError, pUpdateQuery, pReadQuery, pRecord)
	{
		if (pError)
		{
			console.log('Update error:', pError);
			return;
		}
		console.log('Updated:', pRecord.Title);
	});
```

The update behavior automatically adds a filter on the default identifier from the record, executes the update, then reads the record back and returns the marshalled result. The `UpdateDate` and `UpdatingIDUser` columns are automatically stamped.

### List Records (Reads)

```javascript
var tmpQuery = tmpBookDAL.query
	.setCap(25)
	.setBegin(0)
	.addSort({ Column: 'Title', Direction: 'ASC' });

tmpBookDAL.doReads(tmpQuery,
	function (pError, pQuery, pRecords)
	{
		if (pError)
		{
			console.log('Reads error:', pError);
			return;
		}
		console.log('Found', pRecords.length, 'books');
		for (var i = 0; i < pRecords.length; i++)
		{
			console.log(' -', pRecords[i].Title);
		}
	});
```

### Count Records

```javascript
var tmpQuery = tmpBookDAL.query
	.addFilter('Author', 'Frank Herbert');

tmpBookDAL.doCount(tmpQuery,
	function (pError, pQuery, pCount)
	{
		if (pError)
		{
			console.log('Count error:', pError);
			return;
		}
		console.log('Frank Herbert has', pCount, 'books');
	});
```

### Soft Delete a Record

```javascript
var tmpQuery = tmpBookDAL.query
	.addFilter('IDBook', 1);

tmpBookDAL.doDelete(tmpQuery,
	function (pError, pQuery, pResult)
	{
		if (pError)
		{
			console.log('Delete error:', pError);
			return;
		}
		console.log('Soft-deleted book, affected rows:', pResult);
	});
```

When the schema contains a `Deleted` column of type `'Deleted'`, the delete operation generates an `UPDATE` statement that sets `Deleted = 1` rather than issuing a `DELETE` statement. Subsequent queries automatically filter out deleted records.

### Undelete a Record

```javascript
var tmpQuery = tmpBookDAL.query
	.addFilter('IDBook', 1);

tmpBookDAL.doUndelete(tmpQuery,
	function (pError, pQuery, pResult)
	{
		if (pError)
		{
			console.log('Undelete error:', pError);
			return;
		}
		console.log('Restored book, affected rows:', pResult);
	});
```

Undelete sets `Deleted = 0`, making the record visible in normal queries again.

## Setting User Identity

Meadow automatically stamps user identity into `CreateIDUser`, `UpdateIDUser`, and `DeleteIDUser` columns. Set the acting user on the DAL instance:

```javascript
tmpBookDAL.setIDUser(42);
```

You can also set user identity on a per-query basis:

```javascript
var tmpQuery = tmpBookDAL.query;
tmpQuery.query.IDUser = 42;
```

## Loading from a Package File

Instead of configuring scope, schema, default object, and JSON schema individually, you can define everything in a single JSON package file and load it:

```javascript
var tmpBookDAL = libMeadow.new(_Fable)
	.loadFromPackage(__dirname + '/Book.json');
```

The package file structure:

```json
{
	"Scope": "Book",
	"DefaultIdentifier": "IDBook",
	"Schema": [
		{ "Column": "IDBook", "Type": "AutoIdentity" },
		{ "Column": "GUIDBook", "Type": "AutoGUID" },
		{ "Column": "Title", "Type": "String", "Size": "255" },
		{ "Column": "Author", "Type": "String", "Size": "128" },
		{ "Column": "CreateDate", "Type": "CreateDate" },
		{ "Column": "CreatingIDUser", "Type": "CreateIDUser" },
		{ "Column": "UpdateDate", "Type": "UpdateDate" },
		{ "Column": "UpdatingIDUser", "Type": "UpdateIDUser" },
		{ "Column": "Deleted", "Type": "Deleted" },
		{ "Column": "DeleteDate", "Type": "DeleteDate" },
		{ "Column": "DeletingIDUser", "Type": "DeleteIDUser" }
	],
	"DefaultObject": {
		"IDBook": null,
		"GUIDBook": "",
		"Title": "",
		"Author": "",
		"CreateDate": false,
		"CreatingIDUser": 0,
		"UpdateDate": false,
		"UpdatingIDUser": 0,
		"Deleted": 0,
		"DeleteDate": false,
		"DeletingIDUser": 0
	},
	"JsonSchema": {
		"title": "Book",
		"description": "A book in the library.",
		"type": "object",
		"properties": {
			"IDBook": {
				"description": "The unique identifier for a book",
				"type": "integer"
			},
			"Title": {
				"description": "The title of the book",
				"type": "string"
			},
			"Author": {
				"description": "The author of the book",
				"type": "string"
			}
		},
		"required": ["IDBook", "Title"]
	}
}
```

You can also load from an in-memory object using `loadFromPackageObject()`:

```javascript
var tmpBookDAL = libMeadow.new(_Fable)
	.loadFromPackageObject(
		{
			Scope: 'Book',
			DefaultIdentifier: 'IDBook',
			Schema:
			[
				{ Column: 'IDBook', Type: 'AutoIdentity' },
				{ Column: 'GUIDBook', Type: 'AutoGUID' },
				{ Column: 'Title', Type: 'String', Size: '255' }
			]
		});
```
