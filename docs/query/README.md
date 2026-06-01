# Query Objects

> Building and configuring queries with the FoxHound DSL

Every data operation in Meadow begins with a query object. Meadow uses [FoxHound](https://fable-retold.github.io/foxhound/) as its query DSL, generating dialect-specific SQL from a fluent, chainable API. You never need to construct FoxHound directly -- Meadow gives you a fresh, pre-configured query every time you access the `.query` property.

## Getting a Query Object

```javascript
const tmpQuery = meadow.query;
```

This returns a **cloned** FoxHound instance with the entity scope and schema already set. Each call to `.query` returns a new independent clone, so queries never leak state between operations.

```javascript
// These are two completely separate queries
const tmpQueryA = meadow.query.addFilter('IDBook', 1);
const tmpQueryB = meadow.query.addFilter('Author', 'Asimov');

// tmpQueryA and tmpQueryB do not affect each other
```

## Chainable Methods

Query methods return the query object itself, so you can chain them together fluently.

### Filtering

```javascript
// Simple equality filter
meadow.query.addFilter('IDBook', 42)

// Multiple filters (AND)
meadow.query
	.addFilter('Author', 'Herbert')
	.addFilter('InPrint', 1)

// Filter with operator
meadow.query.addFilter('Price', 20, '>')

// Filter with IN clause (array value)
meadow.query.addFilter('IDCategory', [1, 3, 5])
```

Supported filter operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IN`

### Pagination

```javascript
// Limit to 25 records starting from record 50
meadow.query
	.setCap(25)
	.setBegin(50)
```

| Method | Description |
|--------|-------------|
| `setCap(pNumber)` | Maximum records to return (SQL `LIMIT`) |
| `setBegin(pNumber)` | Starting offset (SQL `OFFSET`) |

### Sorting

```javascript
// Sort by Title ascending
meadow.query.addSort({ Column: 'Title', Direction: 'ASC' })

// Multiple sort columns
meadow.query
	.addSort({ Column: 'Author', Direction: 'ASC' })
	.addSort({ Column: 'PublishDate', Direction: 'DESC' })
```

### Column Selection

```javascript
// Only retrieve specific columns
meadow.query.setDataElements(['IDBook', 'Title', 'Author'])
```

### Distinct Queries

```javascript
// Return only unique combinations
meadow.query
	.setDistinct(true)
	.setDataElements(['Author', 'Publisher'])
```

### Records for Create and Update

```javascript
// Add a record for insert or update
meadow.query.addRecord({ Title: 'Neuromancer', Author: 'William Gibson' })
```

The `addRecord()` method attaches data that will be used by create and update operations. For updates, only the fields present in the record will be modified.

### Delete Tracking

```javascript
// Include soft-deleted records in results
meadow.query.setDisableDeleteTracking(true)
```

By default, queries automatically exclude records where the `Deleted` column is `1`. Use `setDisableDeleteTracking(true)` to include them.

## Query Lifecycle

When you pass a query to a CRUD method, Meadow handles the rest:

```
1. meadow.query          -> Clone a fresh FoxHound query with scope and schema
2. .addFilter(...)       -> Configure the query parameters
3. .addRecord(...)       -> Attach data (for create/update)
4. meadow.doRead(query)  -> Meadow sets the dialect, builds SQL, executes via provider
5. callback(error, ...)  -> Results returned through callback
```

You never need to call `setDialect()` or `buildReadQuery()` yourself -- Meadow's behavior modules handle dialect selection and SQL generation based on the configured provider.

## User Identity

Meadow stamps user identity into create, update, and delete operations automatically. Set the user ID before operations:

```javascript
// Set user ID for audit stamping
meadow.setIDUser(currentUserID);

// Or set it per-query
const tmpQuery = meadow.query;
tmpQuery.query.IDUser = currentUserID;
```

This user ID is written to `CreateIDUser`, `UpdateIDUser`, and `DeleteIDUser` columns when those schema types are present.

### Disabling Auto-Stamps

For special cases like data migration, you can disable automatic stamping:

```javascript
const tmpQuery = meadow.query.addRecord(migrationRecord);
tmpQuery.query.disableAutoDateStamp = true;  // Skip UpdateDate = NOW()
tmpQuery.query.disableAutoUserStamp = true;  // Skip UpdateIDUser = :IDUser
```

## Query State

Under the hood, the query object carries state that Meadow and the provider use:

| Property | Description |
|----------|-------------|
| `query.scope` | Entity/table name |
| `query.cap` | Record limit |
| `query.begin` | Record offset |
| `query.dataElements` | Selected columns |
| `query.sort` | Sort configuration |
| `query.filter` | Filter conditions |
| `query.records` | Records for create/update |
| `query.schema` | Column schema definitions |
| `query.IDUser` | User ID for audit stamps |
| `query.disableDeleteTracking` | Include soft-deleted records |
| `query.disableAutoDateStamp` | Skip auto date stamps |
| `query.disableAutoUserStamp` | Skip auto user stamps |
| `result.executed` | Whether the query has been run |
| `result.value` | Result data (ID, rows, count) |

## CRUD Operations

Each CRUD operation uses the query object differently. See the detailed documentation for each:

- [Create](create.md) - Insert new records
- [Read](read.md) - Retrieve single and multiple records
- [Update](update.md) - Modify existing records
- [Delete](delete.md) - Soft delete and undelete records
- [Count](count.md) - Count records matching criteria
