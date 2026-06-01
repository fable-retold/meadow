# MongoDB Provider

> Document-based storage with automatic counter management and sentinel value support

The MongoDB provider connects Meadow to MongoDB databases via the [meadow-connection-mongodb](https://fable-retold.github.io/meadow-connection-mongodb/) module. It uses the FoxHound MongoDB dialect for query generation, providing document-based storage without schema migration. Auto-increment counters, GUID generation, and timestamp sentinels are handled automatically.

## Setup

### Install Dependencies

```bash
npm install meadow meadow-connection-mongodb
```

### Register the Connection

```javascript
const libFable = require('fable').new(
	{
		MongoDB:
		{
			URL: 'mongodb://localhost:27017',
			Database: 'myapp'
		}
	});

const libMeadowConnectionMongoDB = require('meadow-connection-mongodb');

// Register the connection service
libFable.serviceManager.addServiceType('MeadowMongoDBProvider', libMeadowConnectionMongoDB);
libFable.serviceManager.instantiateServiceProvider('MeadowMongoDBProvider');
```

### Create a Meadow DAL

```javascript
const libMeadow = require('meadow');

const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('MongoDB')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'PageCount', Type: 'Numeric' },
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
| `MongoDB.URL` | string | -- | MongoDB connection URL |
| `MongoDB.Database` | string | -- | Database name |

### No Schema Migration

Unlike SQL-based providers, MongoDB does not require table creation or schema migration. Collections are created automatically when the first document is inserted. This makes MongoDB well-suited for rapid development and evolving data models.

## Document Storage

### The `_id` Field

MongoDB automatically assigns an `_id` field to every document. The Meadow MongoDB provider works alongside this native identifier while maintaining Meadow's own identity system (`IDBook`, `GUIDBook`, etc.). Your application code interacts with Meadow's identity columns as usual; the underlying `_id` is managed transparently.

### Auto-Increment Counters

MongoDB does not natively support auto-increment integer identifiers. The Meadow MongoDB provider implements auto-increment behavior using a dedicated `_meadow_counters` collection. When a record is created with an `AutoIdentity` column:

1. The provider queries the `_meadow_counters` collection for the current counter value
2. The counter is atomically incremented
3. The new value is assigned to the identity column on the inserted document

This ensures unique, sequential integer IDs across concurrent inserts.

### Sentinel Values

The MongoDB provider supports sentinel values that are resolved at write time:

| Sentinel | Resolved To | Description |
|----------|-------------|-------------|
| `$$NOW` | Current timestamp | Sets the field to the current date and time |
| `$$AUTOINCREMENT` | Next counter value | Assigns the next auto-increment integer from `_meadow_counters` |
| `$$AUTOGUID` | New GUID | Generates a new globally unique identifier |

Sentinels are placed in record fields and expanded by the provider before the document is written to MongoDB:

```javascript
meadow.doCreate(
	meadow.query.addRecord(
		{
			Title: 'Dune',
			Author: 'Frank Herbert',
			CreateDate: '$$NOW',
			GUIDBook: '$$AUTOGUID'
		}),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('Created at:', pRecord.CreateDate);
		console.log('GUID:', pRecord.GUIDBook);
	});
```

## CRUD Operations

### Create

Inserts a new document into the collection and returns the auto-generated identity value.

```javascript
meadow.doCreate(
	meadow.query.addRecord({ Title: 'Dune', Author: 'Frank Herbert' }),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('New ID:', pRecord.IDBook);
	});
```

**Internally:**
- Builds query: `pQuery.setDialect('MongoDB').buildCreateQuery()`
- Resolves sentinel values ($$NOW, $$AUTOINCREMENT, $$AUTOGUID)
- Increments the counter in `_meadow_counters`
- Inserts the document into the collection

### Read

Queries the collection and returns matching documents.

```javascript
// Single record
meadow.doRead(
	meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pRecord) =>
	{
		console.log('Title:', pRecord.Title);
	});

// Multiple records
meadow.doReads(
	meadow.query.setCap(25).setBegin(0).addSort({ Column: 'Title', Direction: 'ASC' }),
	(pError, pQuery, pRecords) =>
	{
		pRecords.forEach((pBook) => console.log(pBook.Title));
	});
```

**Internally:**
- Builds query: `pQuery.setDialect('MongoDB').buildReadQuery()`
- Translates filters to MongoDB query objects
- Applies sort, skip, and limit from the query parameters

### Update

Updates matching documents in the collection.

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

**Internally:**
- Builds query: `pQuery.setDialect('MongoDB').buildUpdateQuery()`
- Resolves sentinel values before applying the update

### Delete

Executes a soft delete (sets the Deleted flag) and returns the affected document count.

```javascript
meadow.doDelete(
	meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pResult) =>
	{
		console.log('Deleted documents:', pResult);
	});
```

**Internally:**
- Builds query: `pQuery.setDialect('MongoDB').buildDeleteQuery()`
- Updates the Deleted field rather than removing the document

### Undelete

Reverses a soft delete.

```javascript
meadow.doUndelete(
	meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pResult) =>
	{
		console.log('Restored documents:', pResult);
	});
```

### Count

Returns the count of matching documents.

```javascript
meadow.doCount(
	meadow.query.addFilter('Author', 'Frank Herbert', '='),
	(pError, pQuery, pCount) =>
	{
		console.log('Books by Herbert:', pCount);
	});
```

**Internally:**
- Builds query: `pQuery.setDialect('MongoDB').buildCountQuery()`
- Returns the integer count of matching documents

## Full Setup Example

A complete working example connecting to MongoDB and performing CRUD operations:

```javascript
const libFable = require('fable').new(
	{
		MongoDB:
		{
			URL: 'mongodb://localhost:27017',
			Database: 'bookstore'
		}
	});

const libMeadow = require('meadow');
const libMeadowConnectionMongoDB = require('meadow-connection-mongodb');

// Register the connection service
libFable.serviceManager.addServiceType('MeadowMongoDBProvider', libMeadowConnectionMongoDB);
libFable.serviceManager.instantiateServiceProvider('MeadowMongoDBProvider');

// Create the DAL
const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('MongoDB')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'PageCount', Type: 'Numeric' },
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
	meadow.query.addRecord({ Title: 'Dune', Author: 'Frank Herbert', PageCount: 412 }),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		console.log('Created book with ID:', pRecord.IDBook);
		console.log('GUID:', pRecord.GUIDBook);

		// Read it back
		meadow.doRead(
			meadow.query.addFilter('IDBook', pRecord.IDBook),
			(pError, pQuery, pRecord) =>
			{
				console.log('Read back:', pRecord.Title, 'by', pRecord.Author);

				// Count all books
				meadow.doCount(
					meadow.query,
					(pError, pQuery, pCount) =>
					{
						console.log('Total books in collection:', pCount);
					});
			});
	});
```

## Error Handling

All operations follow the same error handling pattern:

- Database errors are stored in `pQuery.parameters.result.error`
- Connection errors bubble up through the callback as `pError`
- Counter increment failures are logged and reported through the error callback

## Docker Development

For local MongoDB development:

```bash
docker run -d \
	--name meadow-mongodb \
	-p 27017:27017 \
	mongo:7
```

## Related Documentation

- [Providers Overview](README.md) -- Comparison of all providers
- [MySQL Provider](mysql.md) -- Relational database alternative
- [ALASQL Provider](alasql.md) -- In-memory alternative
- [meadow-connection-mongodb](https://fable-retold.github.io/meadow-connection-mongodb/) -- Connection module source
