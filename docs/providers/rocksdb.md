# RocksDB Provider

> Embedded key-value store for high-throughput scenarios with in-memory filtering

The RocksDB provider connects Meadow to [RocksDB](https://rocksdb.org/), a high-performance embedded key-value store. Unlike SQL-based providers, RocksDB does not use a FoxHound dialect for query generation. Instead, records are stored as key-value pairs and all filtering is performed in-memory after a full scan. Direct key lookups are O(1), making this provider ideal for high-throughput scenarios where reads are primarily by key.

## Setup

### Install Dependencies

```bash
npm install meadow meadow-connection-rocksdb
```

### Register the Connection

```javascript
const libFable = require('fable').new(
	{
		RocksDB:
		{
			RocksDBFolder: './data/rocksdb',
			KeyMode: 'GUID'
		}
	});

const libMeadowConnectionRocksDB = require('meadow-connection-rocksdb');

// Register the connection service
libFable.serviceManager.addServiceType('MeadowRocksDBProvider', libMeadowConnectionRocksDB);
libFable.serviceManager.instantiateServiceProvider('MeadowRocksDBProvider');
```

### Create a Meadow DAL

```javascript
const libMeadow = require('meadow');

const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('RocksDB')
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

### Connection Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `RocksDB.RocksDBFolder` | string | -- | Filesystem path to the RocksDB data directory |
| `RocksDB.KeyMode` | string | `'GUID'` | Key generation strategy: `'GUID'` or `'ID'` |

### Key Modes

The `KeyMode` setting determines how records are keyed in the store:

| Mode | Key Format | Description |
|------|------------|-------------|
| `GUID` | `M-E-{Scope}-{GUID}` | Keys use the record's GUID (default) |
| `ID` | `M-EBI-{Scope}-{ID}` | Keys use the record's integer identity |

For example, with a `Book` scope:

```
GUID mode:  M-E-Book-a1b2c3d4-e5f6-7890-abcd-ef1234567890
ID mode:    M-EBI-Book-42
```

## Storage Model

### Key-Value Architecture

RocksDB is a key-value store, not a relational database. Each Meadow record is serialized as a JSON value stored under a structured key. This has important implications:

- **No SQL dialect** -- The provider does not use FoxHound for query generation
- **No JOINs** -- Cross-entity queries are not supported
- **No aggregations** -- Beyond COUNT, no aggregate functions are available
- **In-memory filtering** -- All filter operations require scanning records and evaluating filters in memory

### Direct Key Lookup

When reading a record by its primary key (GUID or ID depending on KeyMode), the provider performs a direct key lookup against RocksDB. This is an O(1) operation and is extremely fast regardless of the total number of records in the store.

### In-Memory Filter Engine

For queries with filters, sorts, or pagination, the provider:

1. Scans all records in the scope prefix range
2. Deserializes each record from JSON
3. Evaluates filter conditions against each record in memory
4. Applies sorting in memory
5. Applies pagination (begin/cap) in memory
6. Returns the matching result set

This means that filtered reads scale linearly with the total number of records in the scope. For large datasets with complex filter requirements, consider a SQL-based provider instead.

## CRUD Operations

### Create

Serializes the record as JSON and stores it under the generated key.

```javascript
meadow.doCreate(
	meadow.query.addRecord({ Title: 'Dune', Author: 'Frank Herbert' }),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('New ID:', pRecord.IDBook);
		console.log('Stored with key: M-E-Book-' + pRecord.GUIDBook);
	});
```

### Read

Performs a direct key lookup when filtering by the primary key, or an in-memory scan for other filters.

```javascript
// Direct key lookup (O(1))
meadow.doRead(
	meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pRecord) =>
	{
		console.log('Title:', pRecord.Title);
	});

// In-memory filtered scan
meadow.doReads(
	meadow.query.setCap(25).setBegin(0).addFilter('Author', 'Frank Herbert', '='),
	(pError, pQuery, pRecords) =>
	{
		pRecords.forEach((pBook) => console.log(pBook.Title));
	});
```

### Update

Reads the existing record by key, merges the updated fields, and writes the updated record back.

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

Executes a soft delete by setting the Deleted flag on the stored record.

```javascript
meadow.doDelete(
	meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pResult) =>
	{
		console.log('Deleted records:', pResult);
	});
```

### Undelete

Reverses a soft delete by clearing the Deleted flag.

```javascript
meadow.doUndelete(
	meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pResult) =>
	{
		console.log('Restored records:', pResult);
	});
```

### Count

Scans the scope prefix and counts matching records in memory.

```javascript
meadow.doCount(
	meadow.query,
	(pError, pQuery, pCount) =>
	{
		console.log('Total books:', pCount);
	});
```

## Limitations

| Feature | Supported | Notes |
|---------|-----------|-------|
| Direct key lookup | Yes | O(1) performance |
| Filtered reads | Yes | In-memory post-scan filtering |
| Sorting | Yes | In-memory after scan |
| Pagination (begin/cap) | Yes | In-memory after scan |
| COUNT | Yes | In-memory count after scan |
| JOINs | No | Not supported in key-value model |
| Aggregations (SUM, AVG) | No | Only COUNT is available |
| FoxHound dialect | No | Provider uses its own filter engine |

## When to Use RocksDB

| Use Case | Recommendation |
|----------|---------------|
| High-throughput key lookups | Excellent -- O(1) reads by key |
| Embedded applications | Excellent -- no server process required |
| Write-heavy workloads | Good -- RocksDB is optimized for writes |
| Complex filtered queries | Consider SQL providers instead |
| JOIN-heavy data models | Use MySQL, MSSQL, or PostgreSQL |
| Browser applications | Use ALASQL provider instead |

## Full Setup Example

A complete working example using RocksDB for local key-value storage:

```javascript
const libFable = require('fable').new(
	{
		RocksDB:
		{
			RocksDBFolder: './data/bookstore',
			KeyMode: 'GUID'
		}
	});

const libMeadow = require('meadow');
const libMeadowConnectionRocksDB = require('meadow-connection-rocksdb');

// Register the connection service
libFable.serviceManager.addServiceType('MeadowRocksDBProvider', libMeadowConnectionRocksDB);
libFable.serviceManager.instantiateServiceProvider('MeadowRocksDBProvider');

// Create the DAL
const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('RocksDB')
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

// Insert a record
meadow.doCreate(
	meadow.query.addRecord({ Title: 'Dune', Author: 'Frank Herbert' }),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('Created book with ID:', pRecord.IDBook);
		console.log('GUID:', pRecord.GUIDBook);
		console.log('Key: M-E-Book-' + pRecord.GUIDBook);

		// Direct key lookup
		meadow.doRead(
			meadow.query.addFilter('IDBook', pRecord.IDBook),
			(pError, pQuery, pRecord) =>
			{
				console.log('Read back:', pRecord.Title, 'by', pRecord.Author);
			});
	});
```

## Error Handling

All operations follow the same error handling pattern:

- Storage errors are stored in `pQuery.parameters.result.error`
- Key generation or serialization failures are logged as warnings
- File system errors (e.g., missing RocksDBFolder) bubble through the callback

## Related Documentation

- [Providers Overview](README.md) -- Comparison of all providers
- [SQLite Provider](sqlite.md) -- Embedded SQL alternative
- [ALASQL Provider](alasql.md) -- In-memory SQL alternative
- [meadow-connection-rocksdb](https://github.com/stevenvelozo/meadow-connection-rocksdb) -- Connection module source
