# MSSQL Provider

> Enterprise-grade SQL Server integration with prepared statements and automatic type mapping

The MSSQL provider connects Meadow to Microsoft SQL Server via the [mssql](https://github.com/tediousjs/node-mssql) library. It uses prepared statements for every operation, automatically maps FoxHound parameter types to MSSQL types, and handles identity column insertion with `SCOPE_IDENTITY()`.

## Setup

### Install Dependencies

```bash
npm install meadow meadow-connection-mssql
```

### Register the Connection

```javascript
const libFable = require('fable').new(
	{
		MSSQL:
		{
			server: 'localhost',
			port: 1433,
			user: 'sa',
			password: 'YourPassword',
			database: 'myapp'
		}
	});

const libMeadowConnectionMSSQL = require('meadow-connection-mssql');

// Register the connection service
libFable.serviceManager.addServiceType('MeadowMSSQLProvider', libMeadowConnectionMSSQL);
const tmpConnection = libFable.serviceManager.instantiateServiceProvider('MeadowMSSQLProvider');

// Connect asynchronously (required for MSSQL)
tmpConnection.connectAsync(
	(pError) =>
	{
		if (pError)
		{
			return console.error('MSSQL connection failed:', pError);
		}
		console.log('Connected to SQL Server');
	});
```

### Create a Meadow DAL

```javascript
const libMeadow = require('meadow');

const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('MSSQL')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'Price', Type: 'Decimal', Size: '12,2' },
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

### Async Connection Model

Unlike MySQL, MSSQL connections are fully asynchronous. The connection module provides:

| Method | Description |
|--------|-------------|
| `connectAsync(fCallback)` | Async connection with callback on completion |
| `connect()` | Sync wrapper (warns about race conditions, delegates to `connectAsync`) |

### Connection Pool Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `MSSQL.server` | string | -- | SQL Server hostname |
| `MSSQL.port` | number | `1433` | SQL Server port |
| `MSSQL.user` | string | -- | Database user |
| `MSSQL.password` | string | -- | Database password |
| `MSSQL.database` | string | -- | Database name |

### Pool Configuration (Internal Defaults)

| Setting | Default | Description |
|---------|---------|-------------|
| `pool.max` | `10` | Maximum pool connections |
| `pool.min` | `0` | Minimum pool connections |
| `pool.idleTimeoutMillis` | `30000` | Idle connection timeout |
| `requestTimeout` | `80000` | Query request timeout (ms) |
| `connectionTimeout` | `80000` | Connection timeout (ms) |
| `trustServerCertificate` | `true` | Accept self-signed certificates |

## Prepared Statements

The MSSQL provider uses prepared statements for **every** CRUD operation. This provides:

- **Security** -- Parameters are bound separately from SQL, preventing injection
- **Performance** -- SQL Server can cache execution plans
- **Type Safety** -- Parameters are explicitly typed

### Execution Lifecycle

Each operation follows this lifecycle:

```
1. Build SQL via FoxHound
2. Create PreparedStatement from connection pool
3. Add typed parameters via input(name, type)
4. Prepare the statement
5. Execute with parameter values
6. Unprepare the statement
7. Return results via callback
```

### Type Mapping

FoxHound parameter types are automatically mapped to MSSQL types:

| FoxHound Type | MSSQL Type | Notes |
|---------------|------------|-------|
| `String` / `VarChar` | `MSSQL.VarChar(Max)` | Variable-length strings |
| `Text` | `MSSQL.VarChar(Max)` | Long text fields |
| `Decimal` | `MSSQL.Decimal(digits, decimalDigits)` | Precision from schema `Size` |
| Other types | `MSSQL[typeName]` | Direct lookup on MSSQL type object |

For Decimal columns, the precision and scale are read from the schema's `Size` property (e.g., `'12,2'` becomes `MSSQL.Decimal(12, 2)`).

## CRUD Operations

### Create

Executes an INSERT with `SCOPE_IDENTITY()` to capture the generated identity.

```javascript
meadow.doCreate(
	meadow.query.addRecord({ Title: 'Dune', Author: 'Frank Herbert' }),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('New ID:', pRecord.IDBook);
	});
```

**Internally:**
- Builds query: `pQuery.setDialect('MSSQL').buildCreateQuery()`
- Appends: `SELECT SCOPE_IDENTITY() AS value;`
- Extracts identity: `recordset[0].value`

### Identity Insert

For scenarios where you need to insert explicit identity values (e.g., data migration):

```javascript
const tmpQuery = meadow.query
	.addRecord({ IDBook: 500, Title: 'Imported Book' });
tmpQuery.parameters.AllowIdentityInsert = true;

meadow.doCreate(tmpQuery,
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('Inserted with explicit ID:', pRecord.IDBook);
	});
```

When `AllowIdentityInsert` is `true`, the provider wraps the INSERT with:

```sql
SET IDENTITY_INSERT [Book] ON;
INSERT INTO Book (...) VALUES (...); SELECT SCOPE_IDENTITY() AS value;
SET IDENTITY_INSERT [Book] OFF;
```

### Read

Executes a SELECT and returns result rows from the recordset.

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
		pRecords.forEach((pBook) => console.log(pBook.Title));
	});
```

**Internally:**
- Builds query: `pQuery.setDialect('MSSQL').buildReadQuery()`
- Returns: `recordset` array from prepared statement execution

### Update

Executes an UPDATE with prepared statement parameters.

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

**Internally:**
- Extracts affected rows: `rowsAffected[0]`

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
	meadow.query.addFilter('Author', 'Frank Herbert', '='),
	(pError, pQuery, pCount) =>
	{
		console.log('Books by Herbert:', pCount);
	});
```

**Internally:**
- Extracts count: `recordset[0].Row_Count`
- Falls back to `-1` if extraction fails

## Error Handling

The MSSQL provider has detailed error handling at each stage:

| Stage | Error Level | Message Pattern |
|-------|-------------|-----------------|
| Preparation | `log.error` | `"Create Error preparing prepared statement"` |
| Execution | `result.error` | Error stored on query result |
| Unprepare | `log.error` | `"Create Error unpreparing prepared statement"` |
| Marshalling | `log.warn` | Warning with query body for debugging |

## Docker Development

For local SQL Server development:

```bash
docker run -d \
	--name meadow-mssql \
	-e ACCEPT_EULA=Y \
	-e SA_PASSWORD=YourStrong!Password \
	-p 1433:1433 \
	mcr.microsoft.com/mssql/server:2022-latest
```

## Related Documentation

- [Providers Overview](README.md) -- Comparison of all providers
- [MySQL Provider](mysql.md) -- MySQL/MariaDB alternative
- [meadow-connection-mssql](https://fable-retold.github.io/meadow-connection-mssql/) -- Connection module source
