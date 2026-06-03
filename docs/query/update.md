# Update

> Modify existing records in the database

The `doUpdate` method modifies an existing record and returns the fully hydrated updated object. Meadow automatically handles audit stamping, safely ignores identity and create-only fields, and reads back the record after updating to ensure you receive the current state.

## Method Signature

```javascript
meadow.doUpdate(pQuery, fCallBack)
```

### Callback

```javascript
fCallBack(pError, pUpdateQuery, pReadQuery, pRecord)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pError` | object/null | Error object if the operation failed, null on success |
| `pUpdateQuery` | object | The query used for the UPDATE operation |
| `pReadQuery` | object | The query used to read back the updated record |
| `pRecord` | object | The fully hydrated record after update |

## Basic Usage

```javascript
const tmpQuery = meadow.query
	.addRecord(
		{
			IDBook: 42,
			Title: 'Updated Title',
			Price: 19.99
		});

meadow.doUpdate(tmpQuery,
	(pError, pUpdateQuery, pReadQuery, pRecord) =>
	{
		if (pError)
		{
			return console.log('Update failed:', pError);
		}
		console.log('Updated:', pRecord.Title, '- New price:', pRecord.Price);
		console.log('Last modified:', pRecord.UpdateDate);
	});
```

## How It Works

The update operation follows a multi-step waterfall:

<!-- bespoke diagram: edit diagrams/how-it-works-5.mmd or .hints.json, then: npx pict-renderer-graph build modules/meadow/meadow/docs/query -->
![How It Works](diagrams/how-it-works-5.svg)

## Record Identification

The record you pass to `addRecord()` **must** include the default identifier (e.g., `IDBook`). Meadow uses this to build the WHERE clause:

```javascript
// The default identifier must be present
const tmpQuery = meadow.query
	.addRecord(
		{
			IDBook: 42,      // Required: identifies which record to update
			Title: 'New Title'
		});

meadow.doUpdate(tmpQuery,
	(pError, pUpdateQuery, pReadQuery, pRecord) =>
	{
		// Meadow automatically added: WHERE IDBook = 42
	});
```

If the default identifier is missing, the operation fails with an error to prevent accidental mass updates.

## Auto-Populated Fields

When your schema includes these column types, Meadow handles them automatically during updates:

| Schema Type | Behavior on Update |
|-------------|-------------------|
| `AutoIdentity` | **Ignored** - cannot modify the primary key |
| `AutoGUID` | **Ignored** - not modified on update |
| `CreateDate` | **Ignored** - creation timestamp is immutable |
| `CreateIDUser` | **Ignored** - creating user is immutable |
| `UpdateDate` | Set to `NOW()` automatically |
| `UpdateIDUser` | Set to the current user ID |
| `DeleteDate` | **Ignored** on standard update |
| `DeleteIDUser` | **Ignored** on standard update |
| `Deleted` | Included if present in the record |

## Partial Updates

Only fields present in the record are modified. Other columns remain unchanged:

```javascript
// Only update the Title -- Author, Price, etc. stay the same
const tmpQuery = meadow.query
	.addRecord(
		{
			IDBook: 42,
			Title: 'Just the Title Changes'
		});

meadow.doUpdate(tmpQuery,
	(pError, pUpdateQuery, pReadQuery, pRecord) =>
	{
		// pRecord.Author is unchanged
		// pRecord.Price is unchanged
		// pRecord.Title is 'Just the Title Changes'
		// pRecord.UpdateDate is NOW()
	});
```

## Disabling Auto-Stamps

For data migration or special operations, you can disable automatic timestamp and user stamping:

```javascript
const tmpQuery = meadow.query
	.addRecord(
		{
			IDBook: 42,
			Title: 'Migrated Data'
		});

// Disable auto-date stamp (UpdateDate will not be set to NOW())
tmpQuery.query.disableAutoDateStamp = true;

// Disable auto-user stamp (UpdateIDUser will not be set)
tmpQuery.query.disableAutoUserStamp = true;

meadow.doUpdate(tmpQuery,
	(pError, pUpdateQuery, pReadQuery, pRecord) =>
	{
		// UpdateDate and UpdatingIDUser were not modified
	});
```

## Safety: Filter Requirement

Meadow requires at least one filter on the query before executing an update. The default identifier filter is added automatically from the record, but if somehow no filters are present, the operation aborts:

```javascript
// This will fail safely:
// "Automated update missing filters... aborting!"
```

This prevents accidental `UPDATE ... SET ...` without a WHERE clause.

## Error Handling

Common error conditions:

```javascript
meadow.doUpdate(tmpQuery,
	(pError, pUpdateQuery, pReadQuery, pRecord) =>
	{
		if (pError)
		{
			// Possible errors:
			// - "No record submitted" (missing addRecord)
			// - "Automated update missing default identifier"
			//     (record doesn't have IDBook or equivalent)
			// - "Automated update missing filters... aborting!"
			//     (safety check failed)
			// - "No record updated." (database returned no affected rows)
			// - "No record found to update!" (read-back found nothing)
			// - Provider-specific database errors
			console.log('Error:', pError);
		}
	});
```

## Raw Query Override

The Update operation does not support raw query overrides for the UPDATE step itself. However, the read-back step respects the `Read` override, so custom JOINs and computed columns appear in the returned record.

## Full Example

```javascript
const libFable = require('fable').new();
const libMeadow = require('meadow');

const meadow = libMeadow.new(libFable, 'Book')
	.setProvider('MySQL')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'Price', Type: 'Decimal', Size: '18,2' },
		{ Column: 'InPrint', Type: 'Boolean' },
		{ Column: 'CreateDate', Type: 'CreateDate' },
		{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
		{ Column: 'UpdateDate', Type: 'UpdateDate' },
		{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
		{ Column: 'Deleted', Type: 'Deleted' }
	]);

// Set the user performing the update
meadow.setIDUser(5);

// Update the price and print status of book 42
const tmpQuery = meadow.query
	.addRecord(
		{
			IDBook: 42,
			Price: 24.99,
			InPrint: true
		});

meadow.doUpdate(tmpQuery,
	(pError, pUpdateQuery, pReadQuery, pRecord) =>
	{
		if (pError)
		{
			return console.log('Update failed:', pError);
		}

		// pRecord now contains the full updated record:
		// {
		//   IDBook: 42,                      (unchanged)
		//   GUIDBook: '0x...',               (unchanged)
		//   Title: 'Original Title',         (unchanged)
		//   Author: 'Original Author',       (unchanged)
		//   Price: 24.99,                    (updated)
		//   InPrint: true,                   (updated)
		//   CreateDate: '2024-01-15...',     (unchanged)
		//   CreatingIDUser: 1,               (unchanged)
		//   UpdateDate: '2024-06-20...',     (auto: NOW())
		//   UpdatingIDUser: 5,               (auto: from setIDUser)
		//   Deleted: 0                       (unchanged)
		// }
		console.log('Updated book', pRecord.IDBook);
		console.log('New price:', pRecord.Price);
		console.log('Modified at:', pRecord.UpdateDate, 'by user', pRecord.UpdatingIDUser);
	});
```
