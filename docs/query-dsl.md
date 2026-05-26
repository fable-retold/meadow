# Query DSL

Meadow uses [FoxHound](https://github.com/fable-retold/foxhound) as its query DSL. FoxHound provides a fluent, chainable API for building database queries without writing raw SQL. Meadow wraps FoxHound and manages query lifecycle, cloning, and schema injection.

## Getting a Query

Access a new query through the `meadow.query` property:

```javascript
var tmpQuery = tmpBookDAL.query;
```

Every access to `.query` returns a fresh, independent clone of the internal FoxHound instance. The clone comes pre-configured with the Meadow entity scope and schema.

## Query Cloning and Isolation

Each call to `meadow.query` produces an isolated query object. Configuring one query never affects another:

```javascript
var tmpQueryA = tmpBookDAL.query
	.addFilter('Author', 'Asimov')
	.setCap(10);

var tmpQueryB = tmpBookDAL.query
	.addFilter('Author', 'Herbert')
	.setCap(50);

// tmpQueryA and tmpQueryB are completely independent.
// tmpQueryA filters for Asimov with cap 10.
// tmpQueryB filters for Herbert with cap 50.
```

This isolation is critical for concurrent operations. You can safely build multiple queries in parallel without state leakage.

## Filtering

Add filters to constrain which records are returned. The `addFilter` method accepts a column name, a value, and an optional operator.

### Basic Syntax

```javascript
// Equality (default operator)
tmpQuery.addFilter('Author', 'Frank Herbert');

// With explicit operator
tmpQuery.addFilter('YearPublished', 1960, '>=');
```

### Supported Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equal to (default) | `addFilter('Status', 'Active')` |
| `!=` | Not equal to | `addFilter('Status', 'Deleted', '!=')` |
| `>` | Greater than | `addFilter('Price', 10, '>')` |
| `<` | Less than | `addFilter('Price', 100, '<')` |
| `>=` | Greater than or equal | `addFilter('YearPublished', 2000, '>=')` |
| `<=` | Less than or equal | `addFilter('YearPublished', 2020, '<=')` |
| `LIKE` | Pattern match | `addFilter('Title', '%Dune%', 'LIKE')` |
| `IN` | Value in set | `addFilter('IDBook', '1,2,3', 'IN')` |

### Combining Filters

Multiple filters are combined with `AND` logic:

```javascript
var tmpQuery = tmpBookDAL.query
	.addFilter('Author', 'Frank Herbert')
	.addFilter('YearPublished', 1965, '>=')
	.addFilter('YearPublished', 1985, '<=');
```

This generates a query equivalent to:

```sql
WHERE Author = 'Frank Herbert'
  AND YearPublished >= 1965
  AND YearPublished <= 1985
  AND Deleted = 0
```

Note that `Deleted = 0` is added automatically when the schema contains a `Deleted` column. See [Soft Deletes](soft-deletes.md) for details.

## Pagination

Control result set size and offset with `setCap` and `setBegin`.

### setCap(n)

Limits the number of records returned:

```javascript
// Return at most 25 records
var tmpQuery = tmpBookDAL.query
	.setCap(25);
```

### setBegin(n)

Sets the starting offset for pagination:

```javascript
// Skip the first 50 records, return the next 25
var tmpQuery = tmpBookDAL.query
	.setCap(25)
	.setBegin(50);
```

### Pagination Example

```javascript
var tmpPageSize = 20;
var tmpPageNumber = 3;

var tmpQuery = tmpBookDAL.query
	.setCap(tmpPageSize)
	.setBegin(tmpPageSize * tmpPageNumber);

tmpBookDAL.doReads(tmpQuery,
	function (pError, pQuery, pRecords)
	{
		console.log('Page', tmpPageNumber, ':', pRecords.length, 'records');
	});
```

## Sorting

Add sort directives with `addSort`. Each sort directive is an object with `Column` and `Direction` properties.

```javascript
var tmpQuery = tmpBookDAL.query
	.addSort({ Column: 'Author', Direction: 'ASC' })
	.addSort({ Column: 'Title', Direction: 'DESC' });
```

Sort directives are applied in the order they are added.

## Column Selection

Restrict which columns are returned with `setDataElements`. This is useful for performance when you only need specific fields.

```javascript
var tmpQuery = tmpBookDAL.query
	.setDataElements(['IDBook', 'Title', 'Author']);

tmpBookDAL.doReads(tmpQuery,
	function (pError, pQuery, pRecords)
	{
		// Each record only contains IDBook, Title, and Author
	});
```

## Distinct

Return only unique rows with `setDistinct`:

```javascript
var tmpQuery = tmpBookDAL.query
	.setDataElements(['Author'])
	.setDistinct(true);

tmpBookDAL.doReads(tmpQuery,
	function (pError, pQuery, pRecords)
	{
		// Returns unique authors only
	});
```

## Record Attachment

Attach a record to the query for create and update operations using `addRecord`:

```javascript
// For doCreate
var tmpQuery = tmpBookDAL.query
	.addRecord(
		{
			Title: 'Neuromancer',
			Author: 'William Gibson',
			YearPublished: 1984
		});

tmpBookDAL.doCreate(tmpQuery,
	function (pError, pCreateQuery, pReadQuery, pRecord)
	{
		console.log('Created:', pRecord.IDBook);
	});

// For doUpdate (must include the default identifier)
var tmpQuery = tmpBookDAL.query
	.addRecord(
		{
			IDBook: 5,
			Title: 'Neuromancer (Anniversary Edition)'
		});

tmpBookDAL.doUpdate(tmpQuery,
	function (pError, pUpdateQuery, pReadQuery, pRecord)
	{
		console.log('Updated:', pRecord.Title);
	});
```

For updates, the record must include the default identifier column (e.g. `IDBook`). Meadow automatically adds a filter on this column to ensure only the intended record is updated.

## Delete Tracking Control

By default, queries exclude records where `Deleted = 1`. To include deleted records in your results, disable delete tracking on the query:

```javascript
var tmpQuery = tmpBookDAL.query
	.setDisableDeleteTracking(true);

tmpBookDAL.doReads(tmpQuery,
	function (pError, pQuery, pRecords)
	{
		// pRecords includes both active and soft-deleted records
	});
```

## User Identity

The user identity attached to a query is used for auto-stamping `CreateIDUser`, `UpdateIDUser`, and `DeleteIDUser` columns.

### Setting User Identity on the DAL

The preferred approach is to set the user ID on the Meadow instance, which applies to all queries:

```javascript
tmpBookDAL.setIDUser(42);
```

### Setting User Identity Per Query

Override the user identity on an individual query:

```javascript
var tmpQuery = tmpBookDAL.query;
tmpQuery.query.IDUser = 99;
```

The per-query value takes precedence over the DAL-level value.

### Disabling Auto-Stamps

To prevent automatic date and user stamps on a query, set the disable flags:

```javascript
var tmpQuery = tmpBookDAL.query
	.addRecord(
		{
			IDBook: 5,
			Title: 'Manual Update'
		});

// Prevent automatic UpdateDate stamping
tmpQuery.query.disableAutoDateStamp = true;

// Prevent automatic UpdatingIDUser stamping
tmpQuery.query.disableAutoUserStamp = true;

tmpBookDAL.doUpdate(tmpQuery,
	function (pError, pUpdateQuery, pReadQuery, pRecord)
	{
		// UpdateDate and UpdatingIDUser were not changed
	});
```

See [Audit Tracking](audit-tracking.md) for more details on how auto-stamping works.
