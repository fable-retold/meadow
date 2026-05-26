# Providers

> Pluggable database backends through a consistent interface

Meadow's provider system abstracts database communication behind a unified CRUD interface. You write your data access code once, then swap providers to target MySQL, MSSQL, SQLite, an in-browser IndexedDB store, or even a remote REST API -- all without changing your application logic.

## Overview

```
Meadow (Data Access Layer)
  └── Provider Interface
        ├── MySQL       -> mysql2 connection pool, named placeholders
        ├── MSSQL       -> mssql prepared statements, SCOPE_IDENTITY()
        ├── SQLite      -> Lightweight embedded SQL
        ├── ALASQL      -> In-memory JavaScript SQL engine (browser/Node)
        ├── MeadowEndpoints -> HTTP proxy to remote Meadow REST API
        └── None        -> No-op stub for testing
```

Every provider implements the same operation set:

| Operation | Description |
|-----------|-------------|
| `Create` | Insert a new record, return the identity value |
| `Read` | Execute a SELECT query, return result rows |
| `Update` | Execute an UPDATE query |
| `Delete` | Execute a DELETE query (soft delete), return affected rows |
| `Undelete` | Reverse a soft delete, return affected rows |
| `Count` | Execute a COUNT query, return the row count |

## Choosing a Provider

| Provider | Best For | Connection Module |
|----------|----------|-------------------|
| [MySQL](mysql.md) | Production web applications, MySQL/MariaDB | [meadow-connection-mysql](https://github.com/fable-retold/meadow-connection-mysql) |
| [MSSQL](mssql.md) | Enterprise environments, SQL Server | [meadow-connection-mssql](https://github.com/fable-retold/meadow-connection-mssql) |
| [SQLite](sqlite.md) | Embedded applications, local development | [meadow-connection-sqlite](https://github.com/fable-retold/meadow-connection-sqlite) |
| [ALASQL](alasql.md) | Browser applications, unit testing, prototyping | Built-in (no external connection) |
| MeadowEndpoints | Client-side proxy to remote Meadow APIs | Built-in (HTTP via simple-get) |
| None | Unit testing stubs, development scaffolding | None required |

## Setting a Provider

```javascript
const libFable = require('fable').new();
const libMeadow = require('meadow');

const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('MySQL')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'Title', Type: 'String', Size: '255' }
	]);
```

The provider name is a string matching one of: `'MySQL'`, `'MSSQL'`, `'SQLite'`, `'ALASQL'`, `'MeadowEndpoints'`, or `'None'`.

## How Providers Work

### Query Flow

Every CRUD operation follows the same flow through the provider:

```
Application Code
  │
  ▼
Meadow Behavior (e.g., doCreate)
  │  1. Build query object via FoxHound
  │  2. Apply auto-stamps and GUID generation
  │  3. Merge default object with submitted record
  │
  ▼
FoxHound Query DSL
  │  4. Set dialect for target database
  │  5. Generate dialect-specific SQL
  │  6. Bind parameters
  │
  ▼
Provider
  │  7. Get database connection
  │  8. Execute generated SQL
  │  9. Marshal results into result object
  │
  ▼
Callback
  10. Return (pError, pQuery, pRecord/pRecords)
```

### FoxHound Dialect Integration

Each provider sets the appropriate FoxHound dialect before building queries:

```javascript
// MySQL provider internally calls:
pQuery.setDialect('MySQL').buildReadQuery();

// MSSQL provider internally calls:
pQuery.setDialect('MSSQL').buildReadQuery();

// ALASQL provider internally calls:
pQuery.setDialect('ALASQL').buildReadQuery();
```

This ensures the generated SQL matches the target database's syntax.

### Result Object

All providers store their results in a consistent structure on the query object:

```javascript
pQuery.parameters.result =
{
	error: null,        // Error object if operation failed, null on success
	value: false,       // Result value (varies by operation -- see below)
	executed: true      // Whether the provider attempted execution
};
```

| Operation | `result.value` |
|-----------|----------------|
| Create | Identity value of the new record (e.g., `42`) |
| Read | Array of record objects |
| Update | Query result object |
| Delete | Number of affected rows |
| Undelete | Number of affected rows |
| Count | Integer count of matching records |

### Record Marshalling

All providers implement `marshalRecordFromSourceToObject(pObject, pRecord)` to copy database field values onto a result object:

```javascript
// Provider copies each column from the database result to the output object
for (var tmpColumn in pRecord)
{
	pObject[tmpColumn] = pRecord[tmpColumn];
}
```

Meadow's `marshalRecordFromSourceToObject` method combines this with default object merging:

```javascript
// Internally:
// 1. Create object from default template
// 2. Provider copies database values over defaults
const tmpRecord = fable.Utility.extend({}, schema.defaultObject, pRecord);
```

### Schema Synchronization

When you call `setSchema()` on Meadow, it automatically updates the provider:

```javascript
// Meadow internally calls:
provider.setSchema(scope, schema, defaultIdentifier, defaultGUIdentifier);
```

This is critical for providers like ALASQL that dynamically create tables from schema definitions.

## Connection Management

Each SQL provider requires a connection module registered as a Fable service. The connection modules handle pooling, configuration, and lifecycle management.

### MySQL Connection

```javascript
const libMeadowConnectionMySQL = require('meadow-connection-mysql');

// Register the connection service
libFable.serviceManager.addServiceType('MeadowMySQLProvider', libMeadowConnectionMySQL);
libFable.serviceManager.instantiateServiceProvider('MeadowMySQLProvider');

// Or auto-connect on init:
libFable.serviceManager.instantiateServiceProvider('MeadowMySQLProvider',
	{ MeadowConnectionMySQLAutoConnect: true });
```

### MSSQL Connection

```javascript
const libMeadowConnectionMSSQL = require('meadow-connection-mssql');

// Register and connect asynchronously
libFable.serviceManager.addServiceType('MeadowMSSQLProvider', libMeadowConnectionMSSQL);
const tmpConnection = libFable.serviceManager.instantiateServiceProvider('MeadowMSSQLProvider');
tmpConnection.connectAsync(
	(pError) =>
	{
		if (pError)
		{
			return console.error('Connection failed:', pError);
		}
		// Ready for CRUD operations
	});
```

## MeadowEndpoints Provider

The MeadowEndpoints provider is unique -- it doesn't connect to a database directly. Instead, it acts as an HTTP proxy to a remote Meadow REST API. This enables client-side code to use the same Meadow interface while the actual data operations happen on a server.

```javascript
meadow.setProvider('MeadowEndpoints');
```

Configuration is read from Fable settings:

```json
{
	"MeadowEndpoints": {
		"ServerProtocol": "http",
		"ServerAddress": "127.0.0.1",
		"ServerPort": 8086,
		"ServerEndpointPrefix": "1.0/"
	}
}
```

| HTTP Method | CRUD Operation |
|-------------|----------------|
| `POST` | Create |
| `GET` | Read / Reads / Count |
| `PUT` | Update |
| `DELETE` | Delete |

## None Provider

The None provider is a no-op stub that marks every operation as executed without doing anything. Useful for testing application logic without a database connection.

```javascript
meadow.setProvider('None');

// All operations succeed immediately with empty results
meadow.doRead(meadow.query.addFilter('IDBook', 1),
	(pError, pQuery, pRecord) =>
	{
		// pRecord will be minimal/empty -- no actual data
	});
```

## Provider-Specific Documentation

- [MySQL](mysql.md) -- Connection pooling, named placeholders, configuration
- [MSSQL](mssql.md) -- Prepared statements, type mapping, identity handling
- [SQLite](sqlite.md) -- Embedded database, lightweight deployment
- [ALASQL](alasql.md) -- In-memory SQL, dynamic table creation, browser support

## Related Documentation

- [Schema](schema/README.md) -- How schema definitions drive provider behavior
- [Query Overview](query/README.md) -- FoxHound query DSL and dialect generation
- [Meadow-Endpoints](https://github.com/fable-retold/meadow-endpoints) -- REST API generation on top of Meadow providers
