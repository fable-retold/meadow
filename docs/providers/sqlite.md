# SQLite Provider

> Lightweight embedded SQL for local development and compact deployments

The SQLite provider connects Meadow to SQLite databases, offering a zero-configuration embedded database option. It's ideal for local development, testing, and applications that need a lightweight persistent store without a separate database server.

## Setup

### Install Dependencies

```bash
npm install meadow meadow-connection-sqlite
```

### Register the Connection

```javascript
const libFable = require('fable').new();
const libMeadowConnectionSQLite = require('meadow-connection-sqlite');

// Register the connection service
libFable.serviceManager.addServiceType('MeadowMySQLProvider', libMeadowConnectionSQLite);
libFable.serviceManager.instantiateServiceProvider('MeadowMySQLProvider');
```

### Create a Meadow DAL

```javascript
const libMeadow = require('meadow');

const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('SQLite')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'CreateDate', Type: 'CreateDate' },
		{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
		{ Column: 'UpdateDate', Type: 'UpdateDate' },
		{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
		{ Column: 'DeleteDate', Type: 'DeleteDate' },
		{ Column: 'DeletingIDUser', Type: 'DeleteIDUser' },
		{ Column: 'Deleted', Type: 'Deleted' }
	]);
```

## Connection Management

The SQLite provider uses the same connection pool interface as the MySQL provider. Each operation:

1. Acquires a connection via `pool.getConnection()`
2. Executes the generated SQL query
3. Releases the connection back to the pool

## CRUD Operations

### Create

Executes an INSERT and returns the auto-generated identity value.

```javascript
meadow.doCreate(
	meadow.query.addRecord({ Title: 'Dune', Author: 'Frank Herbert' }),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('New ID:', pRecord.IDBook);
	});
```

**Internally:**
- Builds query with SQLite dialect: `pQuery.setDialect('SQLite').buildCreateQuery()`
- Extracts identity: `result.insertId`

### Read

Executes a SELECT and returns result rows.

```javascript
meadow.doRead(
	meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pRecord) =>
	{
		console.log('Title:', pRecord.Title);
	});

meadow.doReads(
	meadow.query.setCap(25).setBegin(0),
	(pError, pQuery, pRecords) =>
	{
		console.log('Found', pRecords.length, 'books');
	});
```

### Update

Executes an UPDATE statement.

```javascript
meadow.doUpdate(
	meadow.query
		.addFilter('IDBook', 42)
		.addRecord({ Title: 'Updated Title' }),
	(pError, pUpdateQuery, pReadQuery, pRecord) =>
	{
		console.log('Updated:', pRecord.Title);
	});
```

### Delete

Executes a soft delete and returns the affected row count.

```javascript
meadow.doDelete(
	meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pResult) =>
	{
		console.log('Deleted rows:', pResult);
	});
```

### Undelete

Reverses a soft delete.

```javascript
meadow.doUndelete(
	meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pResult) =>
	{
		console.log('Restored rows:', pResult);
	});
```

### Count

Returns the matching record count.

```javascript
meadow.doCount(
	meadow.query,
	(pError, pQuery, pCount) =>
	{
		console.log('Total books:', pCount);
	});
```

## When to Use SQLite

| Use Case | Recommendation |
|----------|---------------|
| Local development | Great -- no server setup required |
| Unit testing | Good -- fast, in-process database |
| Small production apps | Good -- for low-concurrency workloads |
| High-concurrency production | Consider MySQL or MSSQL instead |
| Browser applications | Use ALASQL provider instead |

## Error Handling

The SQLite provider follows the same error handling pattern as MySQL:

- Database errors are stored in `pQuery.parameters.result.error`
- Identity/rowcount extraction failures are logged as warnings
- Connection errors bubble through the callback

## Related Documentation

- [Providers Overview](README.md) -- Comparison of all providers
- [MySQL Provider](mysql.md) -- MySQL/MariaDB for production
- [ALASQL Provider](alasql.md) -- In-memory alternative
- [meadow-connection-sqlite](https://github.com/stevenvelozo/meadow-connection-sqlite) -- Connection module source
