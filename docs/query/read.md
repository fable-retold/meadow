# Read

> Retrieve single or multiple records from the database

Meadow provides two read methods: `doRead` for fetching a single record and `doReads` for fetching multiple records with pagination, filtering, and performance profiling.

## doRead - Single Record

### Method Signature

```javascript
meadow.doRead(pQuery, fCallBack)
```

### Callback

```javascript
fCallBack(pError, pQuery, pRecord)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pError` | object/null | Error object if the operation failed, null on success |
| `pQuery` | object | The query that was executed |
| `pRecord` | object/undefined | The marshaled record, or `undefined` if not found |

### Basic Usage

```javascript
// Read a single book by ID
meadow.doRead(meadow.query.addFilter('IDBook', 42),
	(pError, pQuery, pRecord) =>
	{
		if (pError)
		{
			return console.log('Read error:', pError);
		}
		if (!pRecord)
		{
			return console.log('Book not found');
		}
		console.log('Found:', pRecord.Title, 'by', pRecord.Author);
	});
```

### Reading by GUID

```javascript
meadow.doRead(meadow.query.addFilter('GUIDBook', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
	(pError, pQuery, pRecord) =>
	{
		if (pRecord)
		{
			console.log('Found book:', pRecord.Title);
		}
	});
```

### Reading with Multiple Filters

```javascript
const tmpQuery = meadow.query
	.addFilter('Author', 'Asimov')
	.addFilter('InPrint', 1);

meadow.doRead(tmpQuery,
	(pError, pQuery, pRecord) =>
	{
		// Returns the first matching record
		if (pRecord)
		{
			console.log('Found:', pRecord.Title);
		}
	});
```

### How It Works

<!-- bespoke diagram: edit diagrams/how-it-works-3.mmd or .hints.json, then: npx pict-renderer-graph build modules/meadow/meadow/docs/query -->
![How It Works](diagrams/how-it-works-3.svg)

The read operation returns only the first matching record. If no record matches, the callback receives `undefined` as the record parameter (not an error).

---

## doReads - Multiple Records

### Method Signature

```javascript
meadow.doReads(pQuery, fCallBack)
```

### Callback

```javascript
fCallBack(pError, pQuery, pRecords)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pError` | object/null | Error object if the operation failed, null on success |
| `pQuery` | object | The query that was executed |
| `pRecords` | array | Array of marshaled records (empty array if none found) |

### Basic Usage

```javascript
// Read all books (up to default cap)
meadow.doReads(meadow.query,
	(pError, pQuery, pRecords) =>
	{
		if (pError)
		{
			return console.log('Read error:', pError);
		}
		console.log('Found', pRecords.length, 'books');
		pRecords.forEach((pBook) =>
		{
			console.log('-', pBook.Title);
		});
	});
```

### Pagination

```javascript
// Page 1: first 25 records
meadow.doReads(meadow.query.setCap(25).setBegin(0),
	(pError, pQuery, pRecords) =>
	{
		console.log('Page 1:', pRecords.length, 'records');
	});

// Page 2: next 25 records
meadow.doReads(meadow.query.setCap(25).setBegin(25),
	(pError, pQuery, pRecords) =>
	{
		console.log('Page 2:', pRecords.length, 'records');
	});
```

### Filtering

```javascript
// Read books by a specific author
meadow.doReads(meadow.query.addFilter('Author', 'Philip K. Dick'),
	(pError, pQuery, pRecords) =>
	{
		console.log('Found', pRecords.length, 'books by PKD');
	});

// Read with multiple filters
const tmpQuery = meadow.query
	.addFilter('Author', 'Asimov')
	.addFilter('PublishYear', 1950, '>')
	.setCap(10);

meadow.doReads(tmpQuery,
	(pError, pQuery, pRecords) =>
	{
		console.log('Found', pRecords.length, 'post-1950 Asimov books');
	});
```

### Sorting

```javascript
// Read books sorted by title
const tmpQuery = meadow.query
	.addSort({ Column: 'Title', Direction: 'ASC' })
	.setCap(50);

meadow.doReads(tmpQuery,
	(pError, pQuery, pRecords) =>
	{
		pRecords.forEach((pBook) =>
		{
			console.log(pBook.Title);
		});
	});
```

### Column Selection

```javascript
// Only retrieve specific columns for efficiency
const tmpQuery = meadow.query
	.setDataElements(['IDBook', 'Title', 'Author'])
	.setCap(100);

meadow.doReads(tmpQuery,
	(pError, pQuery, pRecords) =>
	{
		// pRecords still contain all schema default fields,
		// but only the selected columns will have DB values
	});
```

### Distinct Queries

```javascript
// Get unique author/publisher combinations
const tmpQuery = meadow.query
	.setDistinct(true)
	.setDataElements(['Author', 'Publisher']);

meadow.doReads(tmpQuery,
	(pError, pQuery, pRecords) =>
	{
		pRecords.forEach((pRow) =>
		{
			console.log(pRow.Author, '-', pRow.Publisher);
		});
	});
```

### How It Works

<!-- bespoke diagram: edit diagrams/how-it-works-4.mmd or .hints.json, then: npx pict-renderer-graph build modules/meadow/meadow/docs/query -->
![How It Works](diagrams/how-it-works-4.svg)

---

## Soft Delete Filtering

By default, both `doRead` and `doReads` automatically exclude soft-deleted records (where `Deleted = 1`). This filter is applied at the SQL dialect level.

```javascript
// Default: only active records
meadow.doReads(meadow.query,
	(pError, pQuery, pRecords) =>
	{
		// Soft-deleted records are excluded
	});

// Include soft-deleted records
meadow.doReads(meadow.query.setDisableDeleteTracking(true),
	(pError, pQuery, pRecords) =>
	{
		// ALL records returned, including soft-deleted ones
	});
```

## Slow Query Profiling

The `doReads` method (and `doCount`) automatically profiles query execution time. If a query exceeds the configured threshold, a warning is logged:

```javascript
// Configure the threshold (default: 200ms)
const _Fable = require('fable').new(
	{
		QueryThresholdWarnTime: 500  // Warn for queries over 500ms
	});
```

The slow query log includes the provider name, SQL body, parameters, and the fully interpolated query string for easy debugging.

## Raw Query Override

Both read operations respect the `Read` raw query override:

```javascript
// Override the generated SELECT with custom SQL
meadow.rawQueries.setQuery('Read',
	'SELECT b.*, a.Name AS AuthorName FROM Book b LEFT JOIN Author a ON b.IDAuthor = a.IDAuthor WHERE b.IDBook = :IDBook');

// This custom query is used for doRead
meadow.doRead(meadow.query.addFilter('IDBook', 1),
	(pError, pQuery, pRecord) =>
	{
		// pRecord will include the AuthorName from the JOIN
	});
```

For `doReads`, use the `Reads` override key:

```javascript
meadow.rawQueries.setQuery('Reads',
	'SELECT b.*, COUNT(r.IDReview) AS ReviewCount FROM Book b LEFT JOIN Review r ON b.IDBook = r.IDBook GROUP BY b.IDBook');
```

## Full Example

```javascript
const libFable = require('fable').new(
	{
		QueryThresholdWarnTime: 300
	});
const libMeadow = require('meadow');

const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('MySQL')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'PublishYear', Type: 'Numeric' },
		{ Column: 'Price', Type: 'Decimal', Size: '18,2' },
		{ Column: 'CreateDate', Type: 'CreateDate' },
		{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
		{ Column: 'Deleted', Type: 'Deleted' }
	]);

// Read a single book
meadow.doRead(meadow.query.addFilter('IDBook', 1),
	(pError, pQuery, pBook) =>
	{
		if (!pError && pBook)
		{
			console.log('Book:', pBook.Title);
		}
	});

// Read a filtered, sorted, paginated list
const tmpQuery = meadow.query
	.addFilter('PublishYear', 1980, '>=')
	.addSort({ Column: 'Title', Direction: 'ASC' })
	.setCap(10)
	.setBegin(0);

meadow.doReads(tmpQuery,
	(pError, pQuery, pBooks) =>
	{
		if (!pError)
		{
			console.log('Post-1980 books (page 1):');
			pBooks.forEach((pBook) =>
			{
				console.log(`  ${pBook.Title} (${pBook.PublishYear}) - $${pBook.Price}`);
			});
		}
	});
```
