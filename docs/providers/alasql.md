# ALASQL Provider

> In-memory JavaScript SQL engine for browser applications, unit testing, and rapid prototyping

The ALASQL provider connects Meadow to [AlaSQL](https://github.com/AlaSQL/alasql), a JavaScript SQL database that runs entirely in memory. It requires no external database server, supports dynamic table creation from Meadow schemas, and works in both Node.js and browser environments. This makes it ideal for unit tests, browser-based applications, and prototyping.

## Setup

### Install Dependencies

```bash
npm install meadow alasql
```

### Initialize ALASQL on Fable

```javascript
const libFable = require('fable').new();
const libALASQL = require('alasql');

// Attach ALASQL to the Fable instance
libFable.ALASQL = libALASQL;
```

### Create a Meadow DAL

```javascript
const libMeadow = require('meadow');

const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('ALASQL')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'PageCount', Type: 'Numeric' },
		{ Column: 'InPrint', Type: 'Boolean' },
		{ Column: 'CreateDate', Type: 'CreateDate' },
		{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
		{ Column: 'UpdateDate', Type: 'UpdateDate' },
		{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
		{ Column: 'DeleteDate', Type: 'DeleteDate' },
		{ Column: 'DeletingIDUser', Type: 'DeleteIDUser' },
		{ Column: 'Deleted', Type: 'Deleted' }
	]);
```

## Dynamic Table Creation

Unlike SQL-server-based providers, ALASQL dynamically creates tables from your Meadow schema. When the first CRUD operation is executed, the provider checks whether the table exists and creates it if needed.

### Schema-to-SQL Type Mapping

| Meadow Type | ALASQL Column Definition |
|-------------|--------------------------|
| `AutoIdentity` | `INT AUTOINCREMENT` |
| `AutoGUID` | `STRING` |
| `Boolean` | `BOOLEAN` |
| `Numeric` | `INT` |
| `Integer` | `INT` |
| `Decimal` | `DECIMAL` |
| `String` | `STRING` |
| `Text` | `STRING` |
| `DateTime` | `STRING` |
| `CreateDate` | `STRING` |
| `CreateIDUser` | `INT` |
| `UpdateDate` | `STRING` |
| `UpdateIDUser` | `INT` |
| `DeleteDate` | `STRING` |
| `DeleteIDUser` | `INT` |
| `Deleted` | `BOOLEAN` |

### Automatic Table Check

Before each CRUD operation, the provider calls `checkDataExists(pParameters)` to verify the table exists. If not, it generates and executes a `CREATE TABLE` statement based on the schema:

```sql
-- Generated automatically from schema:
CREATE TABLE Book (
	IDBook INT AUTOINCREMENT,
	GUIDBook STRING,
	Title STRING,
	Author STRING,
	PageCount INT,
	InPrint BOOLEAN,
	CreateDate STRING,
	CreatingIDUser INT,
	UpdateDate STRING,
	UpdatingIDUser INT,
	DeleteDate STRING,
	DeletingIDUser INT,
	Deleted BOOLEAN
)
```

## CRUD Operations

All ALASQL operations are **synchronous** internally (wrapped in callbacks for API consistency). Queries are compiled via `libALASQL.compile()` for efficient execution.

### Create

```javascript
meadow.doCreate(
	meadow.query.addRecord({ Title: 'Dune', Author: 'Frank Herbert' }),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('New ID:', pRecord.IDBook);
	});
```

**Internally:**
- Builds query: `pQuery.setDialect('ALASQL').buildCreateQuery()`
- Compiles: `libALASQL.compile(queryBody)`
- Extracts identity: `libALASQL.autoval(scope, defaultIdentifier)`

### Read

```javascript
meadow.doRead(
	meadow.query.addFilter('IDBook', 1),
	(pError, pQuery, pRecord) =>
	{
		console.log('Title:', pRecord.Title);
	});

meadow.doReads(
	meadow.query.setCap(10),
	(pError, pQuery, pRecords) =>
	{
		pRecords.forEach((pBook) => console.log(pBook.Title));
	});
```

### Update

```javascript
meadow.doUpdate(
	meadow.query
		.addFilter('IDBook', 1)
		.addRecord({ Title: 'Updated Title' }),
	(pError, pUpdateQuery, pReadQuery, pRecord) =>
	{
		console.log('Updated:', pRecord.Title);
	});
```

### Delete

```javascript
meadow.doDelete(
	meadow.query.addFilter('IDBook', 1),
	(pError, pQuery, pResult) =>
	{
		console.log('Deleted rows:', pResult);
	});
```

### Count

```javascript
meadow.doCount(
	meadow.query,
	(pError, pQuery, pCount) =>
	{
		console.log('Total books:', pCount);
	});
```

## Data Binding

The ALASQL provider offers special methods for directly binding JavaScript data to tables, which is useful for initializing state or importing datasets.

### Bind an Array to a Table

```javascript
// Directly assign an array as the table's data
meadow.provider.bindObject(
[
	{ IDBook: 1, Title: 'Dune', Author: 'Frank Herbert' },
	{ IDBook: 2, Title: 'Foundation', Author: 'Isaac Asimov' },
	{ IDBook: 3, Title: 'Neuromancer', Author: 'William Gibson' }
]);
// ALASQL.tables['Book'].data now contains these records
```

### Construct from Object

The `constructFromObject` method builds a complete Meadow entity from a JavaScript object prototype, optionally including audit columns and importing data:

```javascript
meadow.provider.constructFromObject(
{
	Meadow: meadow,
	Scope: 'Book',
	ObjectPrototype:
	{
		Title: 'String',
		Author: 'String',
		PageCount: 'Numeric'
	},
	AuditData: true,       // Auto-generate audit columns
	Import: true,          // Import the Data array via doCreate
	Data:
	[
		{ Title: 'Dune', Author: 'Frank Herbert', PageCount: 412 },
		{ Title: 'Foundation', Author: 'Isaac Asimov', PageCount: 244 }
	]
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `Meadow` | object | The Meadow instance to configure |
| `Scope` | string | Entity name for the table |
| `ObjectPrototype` | object | Column name to type mapping |
| `AuditData` | boolean | Add Create/Update/Delete audit columns |
| `Import` | boolean | Import Data array via `doCreate` operations |
| `Data` | array | Records to import (when `Import` is `true`) |

## Browser Usage

ALASQL is the recommended provider for browser-based Meadow applications. When bundled with Browserify or another bundler, Meadow with ALASQL provides a full SQL database in the browser.

```javascript
// In a browser bundle:
const libFable = require('fable').new();
const libALASQL = require('alasql');
const libMeadow = require('meadow');

libFable.ALASQL = libALASQL;

const meadow = libMeadow.new(libFable, 'Task')
	.setProvider('ALASQL')
	.setDefaultIdentifier('IDTask')
	.setSchema([
		{ Column: 'IDTask', Type: 'AutoIdentity' },
		{ Column: 'Description', Type: 'String', Size: '255' },
		{ Column: 'Complete', Type: 'Boolean' }
	]);

// Full CRUD operations in the browser
meadow.doCreate(
	meadow.query.addRecord({ Description: 'Buy groceries', Complete: false }),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('Created task:', pRecord.IDTask);
	});
```

## When to Use ALASQL

| Use Case | Recommendation |
|----------|---------------|
| Unit testing | Excellent -- no database setup, fast, deterministic |
| Browser applications | Excellent -- full SQL in the browser |
| Rapid prototyping | Excellent -- start coding immediately |
| Production server | Consider MySQL or MSSQL instead |
| Data persistence | Data is in-memory only (lost on refresh/restart) |

## Error Handling

All operations are wrapped in try-catch blocks. Errors are stored in `pQuery.parameters.result.error` and the `executed` flag is always set to `true`.

## Related Documentation

- [Providers Overview](README.md) -- Comparison of all providers
- [MySQL Provider](mysql.md) -- Production MySQL alternative
- [SQLite Provider](sqlite.md) -- Lightweight embedded alternative
- [Schema](schema/README.md) -- Schema definitions that drive table creation
