# Count

> Count records matching query criteria

The `doCount` method returns the number of records matching your query filters. It automatically excludes soft-deleted records (unless disabled) and includes slow query profiling for performance monitoring.

## Method Signature

```javascript
meadow.doCount(pQuery, fCallBack)
```

### Callback

```javascript
fCallBack(pError, pQuery, pCount)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pError` | object/null | Error object if the operation failed, null on success |
| `pQuery` | object | The query that was executed |
| `pCount` | number | The record count |

## Basic Usage

```javascript
// Count all records
meadow.doCount(meadow.query,
	(pError, pQuery, pCount) =>
	{
		if (pError)
		{
			return console.log('Count failed:', pError);
		}
		console.log('Total books:', pCount);
	});
```

## Filtered Counts

```javascript
// Count books by a specific author
meadow.doCount(meadow.query.addFilter('Author', 'Asimov'),
	(pError, pQuery, pCount) =>
	{
		console.log('Asimov books:', pCount);
	});

// Count books published after 2000
meadow.doCount(meadow.query.addFilter('PublishYear', 2000, '>'),
	(pError, pQuery, pCount) =>
	{
		console.log('Post-2000 books:', pCount);
	});

// Count with multiple filters
const tmpQuery = meadow.query
	.addFilter('Author', 'Herbert')
	.addFilter('InPrint', 1);

meadow.doCount(tmpQuery,
	(pError, pQuery, pCount) =>
	{
		console.log('Herbert books in print:', pCount);
	});
```

## How It Works

<!-- bespoke diagram: edit diagrams/how-it-works.mmd or .hints.json, then: npx pict-renderer-graph build modules/meadow/meadow/docs/query -->
![How It Works](diagrams/how-it-works.svg)

## Soft Delete Filtering

By default, the count excludes soft-deleted records:

```javascript
// Count only active records (default)
meadow.doCount(meadow.query,
	(pError, pQuery, pActiveCount) =>
	{
		console.log('Active books:', pActiveCount);
	});

// Count ALL records including soft-deleted
meadow.doCount(meadow.query.setDisableDeleteTracking(true),
	(pError, pQuery, pTotalCount) =>
	{
		console.log('Total books (including deleted):', pTotalCount);
	});
```

## Slow Query Profiling

Like `doReads`, the count operation profiles execution time and logs a warning for slow queries:

```javascript
// Configure the threshold (default: 200ms)
const _Fable = require('fable').new(
	{
		QueryThresholdWarnTime: 500
	});
```

When a count query exceeds the threshold, Meadow logs a warning with the provider name, SQL body, parameters, and full interpolated query.

## Pagination Pattern

Count is commonly used together with `doReads` to implement pagination:

```javascript
const PAGE_SIZE = 25;
let currentPage = 0;

// First, get the total count
meadow.doCount(meadow.query.addFilter('Author', 'Asimov'),
	(pError, pQuery, pTotalCount) =>
	{
		const totalPages = Math.ceil(pTotalCount / PAGE_SIZE);
		console.log('Total records:', pTotalCount, 'Pages:', totalPages);

		// Then fetch the current page
		const tmpQuery = meadow.query
			.addFilter('Author', 'Asimov')
			.setCap(PAGE_SIZE)
			.setBegin(currentPage * PAGE_SIZE)
			.addSort({ Column: 'Title', Direction: 'ASC' });

		meadow.doReads(tmpQuery,
			(pError, pQuery, pRecords) =>
			{
				console.log(`Page ${currentPage + 1} of ${totalPages}:`);
				pRecords.forEach((pBook) =>
				{
					console.log('  -', pBook.Title);
				});
			});
	});
```

## Error Handling

```javascript
meadow.doCount(meadow.query,
	(pError, pQuery, pCount) =>
	{
		if (pError)
		{
			// Possible errors:
			// - "Count did not return valid results."
			//     (provider returned non-numeric value)
			// - Provider-specific database errors
			console.log('Error:', pError);
		}
	});
```

## Raw Query Override

The count operation respects the `Count` raw query override:

```javascript
// Override with a custom count query
meadow.rawQueries.setQuery('Count',
	'SELECT COUNT(DISTINCT Author) AS RowCount FROM Book WHERE Deleted = 0');

meadow.doCount(meadow.query,
	(pError, pQuery, pCount) =>
	{
		// pCount is the number of unique authors
	});
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
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'PublishYear', Type: 'Numeric' },
		{ Column: 'Deleted', Type: 'Deleted' }
	]);

// Count all active books
meadow.doCount(meadow.query,
	(pError, pQuery, pTotal) =>
	{
		console.log('Total active books:', pTotal);
	});

// Count by author
meadow.doCount(meadow.query.addFilter('Author', 'Bradbury'),
	(pError, pQuery, pCount) =>
	{
		console.log('Bradbury books:', pCount);
	});

// Count including soft-deleted for an audit report
meadow.doCount(meadow.query.setDisableDeleteTracking(true),
	(pError, pQuery, pAllCount) =>
	{
		meadow.doCount(meadow.query,
			(pError, pQuery, pActiveCount) =>
			{
				const deletedCount = pAllCount - pActiveCount;
				console.log('Active:', pActiveCount);
				console.log('Deleted:', deletedCount);
				console.log('Total:', pAllCount);
			});
	});
```
