# Meadow

> **[Read the Meadow Documentation](https://fable-retold.github.io/meadow/)** - interactive docs with the full API reference.

A data access library providing magic where you want it, programmability where you don't.

[meadow on npm](https://www.npmjs.com/package/meadow)

Meadow is a JavaScript data broker that handles repetitive CRUD operations through a consistent, provider-agnostic interface. It abstracts database communication behind a unified API -- whether your data lives in MySQL, MSSQL, PostgreSQL, SQLite, MongoDB, RocksDB, or an in-browser ALASQL store, Meadow provides schema management, query generation, data marshalling, and automatic audit stamping while you focus on business logic.

## Features

- **Provider-Agnostic Design** -- pluggable database backends through a consistent CRUD interface
- **Schema-Driven** -- define your data model once and get validation, default objects, and audit tracking for free
- **FoxHound Query DSL** -- fluent query builder that generates dialect-specific SQL, MongoDB queries, or key-value lookups
- **Automatic Audit Tracking** -- auto-populated create, update, and delete timestamps with user identity stamps
- **Soft Deletes** -- built-in logical deletion with automatic query filtering and undelete support
- **GUID Uniqueness** -- automatic GUID generation and uniqueness enforcement on record creation
- **Raw Query Overrides** -- escape hatch for custom SQL when the DSL is not enough
- **Role-Based Authorization** -- declarative access control per operation integrated with Meadow-Endpoints
- **Fable Integration** -- first-class service in the Fable ecosystem with logging, configuration, and dependency injection
- **Browser Support** -- ALASQL provider enables the same data access patterns in the browser via IndexedDB

## Install

```bash
npm install meadow
```

## Quick Example

```javascript
const libFable = require('fable').new();
const libMeadow = require('meadow');

// Create a Meadow DAL for the "Book" entity
const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('MySQL')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'Metadata', Type: 'JSON' },
		{ Column: 'CreateDate', Type: 'CreateDate' },
		{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
		{ Column: 'UpdateDate', Type: 'UpdateDate' },
		{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
		{ Column: 'DeleteDate', Type: 'DeleteDate' },
		{ Column: 'DeletingIDUser', Type: 'DeleteIDUser' },
		{ Column: 'Deleted', Type: 'Deleted' }
	]);

// Create a record
const tmpCreateQuery = meadow.query.addRecord({ Title: 'Dune', Author: 'Frank Herbert' });
meadow.doCreate(tmpCreateQuery,
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('Created book:', pRecord.IDBook, '-', pRecord.Title);
	});

// Read a single record
meadow.doRead(meadow.query.addFilter('IDBook', 1),
	(pError, pQuery, pRecord) =>
	{
		console.log('Found:', pRecord.Title, 'by', pRecord.Author);
	});

// Read multiple records with pagination
meadow.doReads(meadow.query.setCap(25).setBegin(0),
	(pError, pQuery, pRecords) =>
	{
		console.log('Found', pRecords.length, 'books');
	});
```

## Schema Column Types

| Type | Description |
|------|-------------|
| `AutoIdentity` | Auto-increment primary key |
| `AutoGUID` | Automatically generated GUID |
| `String` | Variable-length string with optional `Size` |
| `Text` | Long text field |
| `Numeric` | Integer field |
| `Decimal` | Decimal field with `Size` as `"precision,scale"` |
| `Boolean` | Boolean flag |
| `DateTime` | Date/time field |
| `CreateDate` | Auto-populated timestamp on create |
| `CreateIDUser` | Auto-populated user ID on create |
| `UpdateDate` | Auto-populated timestamp on update |
| `UpdateIDUser` | Auto-populated user ID on update |
| `DeleteDate` | Auto-populated timestamp on delete |
| `DeleteIDUser` | Auto-populated user ID on delete |
| `Deleted` | Soft delete flag (enables logical deletion) |
| `JSON` | Structured JSON data (stored as `TEXT`, marshaled to/from objects) |
| `JSONProxy` | JSON stored in a different SQL column (uses `StorageColumn` for SQL, virtual name for objects) |

## CRUD Operations

| Method | Callback Signature | Description |
|--------|-------------------|-------------|
| `doCreate(pQuery, fCB)` | `(pError, pCreateQuery, pReadQuery, pRecord)` | Insert a new record |
| `doRead(pQuery, fCB)` | `(pError, pQuery, pRecord)` | Read a single record |
| `doReads(pQuery, fCB)` | `(pError, pQuery, pRecords)` | Read multiple records |
| `doUpdate(pQuery, fCB)` | `(pError, pUpdateQuery, pReadQuery, pRecord)` | Update an existing record |
| `doDelete(pQuery, fCB)` | `(pError, pQuery, pCount)` | Delete a record (soft or hard) |
| `doUndelete(pQuery, fCB)` | `(pError, pQuery, pCount)` | Restore a soft-deleted record |
| `doCount(pQuery, fCB)` | `(pError, pQuery, pCount)` | Count matching records |

## Configuration Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `setProvider(pName)` | `this` | Set database provider (`MySQL`, `MSSQL`, `PostgreSQL`, `SQLite`, `MongoDB`, `RocksDB`, `ALASQL`, `MeadowEndpoints`, `None`) |
| `setScope(pScope)` | `this` | Set entity scope (table name) |
| `setSchema(pSchema)` | `this` | Set column schema array |
| `setDefaultIdentifier(pId)` | `this` | Set primary key column name |
| `setIDUser(pIDUser)` | `this` | Set user ID for audit stamps |
| `setJsonSchema(pSchema)` | `this` | Set JSON Schema v4 for validation |
| `setDefault(pDefault)` | `this` | Set default object template |
| `setAuthorizer(pAuth)` | `this` | Set role-based authorization rules |
| `setDomain(pDomain)` | `this` | Set entity domain grouping |
| `loadFromPackage(pPath)` | `Meadow` | Load schema from JSON file |
| `loadFromPackageObject(pObj)` | `Meadow` | Load schema from object |

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `scope` | `string` | Entity scope name |
| `schema` | `array` | Column schema definitions |
| `schemaFull` | `object` | Full MeadowSchema with methods |
| `jsonSchema` | `object` | JSON Schema v4 definition |
| `defaultIdentifier` | `string` | Primary key column name |
| `defaultGUIdentifier` | `string` | GUID column name |
| `userIdentifier` | `number` | Current user ID |
| `query` | `object` | Cloned FoxHound query (fresh each access) |
| `rawQueries` | `object` | Raw query manager |
| `provider` | `object` | Active provider instance |
| `providerName` | `string` | Active provider name |

## Providers

| Provider | Description | Connection Module |
|----------|-------------|-------------------|
| `MySQL` | MySQL/MariaDB via mysql2 | [meadow-connection-mysql](https://github.com/fable-retold/meadow-connection-mysql) |
| `MSSQL` | Microsoft SQL Server | [meadow-connection-mssql](https://github.com/fable-retold/meadow-connection-mssql) |
| `PostgreSQL` | PostgreSQL | [meadow-connection-postgresql](https://github.com/fable-retold/meadow-connection-postgresql) |
| `SQLite` | Embedded SQLite via better-sqlite3 | [meadow-connection-sqlite](https://github.com/fable-retold/meadow-connection-sqlite) |
| `MongoDB` | MongoDB document store | [meadow-connection-mongodb](https://github.com/fable-retold/meadow-connection-mongodb) |
| `RocksDB` | Embedded key-value store | [meadow-connection-rocksdb](https://github.com/fable-retold/meadow-connection-rocksdb) |
| `ALASQL` | In-browser IndexedDB via ALASQL | Built-in |
| `MeadowEndpoints` | REST proxy to remote Meadow API | Built-in |
| `None` | No-op stub for testing | None required |

## Testing

```bash
npm test
```

## Documentation

Detailed documentation is available in the `docs/` folder:

```bash
npx docsify-cli serve docs
```

## Related Packages

- [foxhound](https://github.com/fable-retold/foxhound) -- query DSL for SQL and NoSQL generation
- [stricture](https://github.com/fable-retold/stricture) -- schema definition language
- [meadow-endpoints](https://github.com/fable-retold/meadow-endpoints) -- automatic REST endpoint generation
- [meadow-connection-mysql](https://github.com/fable-retold/meadow-connection-mysql) -- MySQL connection provider
- [meadow-connection-mssql](https://github.com/fable-retold/meadow-connection-mssql) -- MSSQL connection provider
- [meadow-connection-sqlite](https://github.com/fable-retold/meadow-connection-sqlite) -- SQLite connection provider
- [meadow-connection-postgresql](https://github.com/fable-retold/meadow-connection-postgresql) -- PostgreSQL connection provider
- [meadow-connection-mongodb](https://github.com/fable-retold/meadow-connection-mongodb) -- MongoDB connection provider
- [meadow-connection-rocksdb](https://github.com/fable-retold/meadow-connection-rocksdb) -- RocksDB connection provider
- [fable](https://github.com/fable-retold/fable) -- application services framework
- [orator](https://github.com/fable-retold/orator) -- API server abstraction

## License

MIT

## Contributing

Pull requests are welcome. For details on code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/stevenvelozo/retold/blob/main/docs/contributing.md).
