# Schema

> Define your data model once -- get validation, defaults, audit tracking, and authorization for free

Meadow's schema system is the foundation of every data entity. It defines column structure, validation rules, default object templates, and authorization policies in a single declarative configuration. The schema drives everything from query generation to automatic audit stamping.

## Overview

A Meadow schema consists of four complementary parts:

<!-- bespoke diagram: edit diagrams/overview.mmd or .hints.json, then: npx pict-renderer-graph build modules/meadow/meadow/docs/schema -->
![Overview](diagrams/overview.svg)

Each part is optional and can be set independently, but together they provide a complete data model definition.

## Column Schema

The column schema is an array of objects that defines the columns in your entity. Each column has a `Column` name, a `Type`, and an optional `Size`.

```javascript
const tmpSchema =
[
	{ Column: 'IDBook', Type: 'AutoIdentity' },
	{ Column: 'GUIDBook', Type: 'AutoGUID' },
	{ Column: 'Title', Type: 'String', Size: '255' },
	{ Column: 'Author', Type: 'String', Size: '128' },
	{ Column: 'PageCount', Type: 'Numeric' },
	{ Column: 'Price', Type: 'Decimal', Size: '12,2' },
	{ Column: 'InPrint', Type: 'Boolean' },
	{ Column: 'PublishDate', Type: 'DateTime' },
	{ Column: 'Synopsis', Type: 'Text' },
	{ Column: 'Metadata', Type: 'JSON' },
	{ Column: 'Extras', Type: 'JSONProxy', StorageColumn: 'ExtrasJSON' },
	{ Column: 'CreateDate', Type: 'CreateDate' },
	{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
	{ Column: 'UpdateDate', Type: 'UpdateDate' },
	{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
	{ Column: 'DeleteDate', Type: 'DeleteDate' },
	{ Column: 'DeletingIDUser', Type: 'DeleteIDUser' },
	{ Column: 'Deleted', Type: 'Deleted' }
];

meadow.setSchema(tmpSchema);
```

### Column Types

| Type | Description | SQL Mapping | Default Value |
|------|-------------|-------------|---------------|
| `AutoIdentity` | Auto-increment primary key | `INT UNSIGNED AUTO_INCREMENT` | N/A (generated) |
| `AutoGUID` | Automatically generated GUID | `CHAR(36)` | `'00000000-0000-0000-0000-000000000000'` |
| `String` | Variable-length string | `VARCHAR(Size)` | `''` |
| `Text` | Long text field | `TEXT` | `null` |
| `Numeric` | Integer field | `INT` | `0` |
| `Integer` | Integer field (alias) | `INT` | `0` |
| `Decimal` | Decimal number | `DECIMAL(precision,scale)` | `0` |
| `Boolean` | Boolean flag | `INT` / `BOOLEAN` | `0` |
| `DateTime` | Date/time field | `DATETIME` | `null` |
| `JSON` | Structured JSON data | `LONGTEXT` (MySQL) / `TEXT` (others) | `{}` |
| `JSONProxy` | JSON with different SQL column name | `LONGTEXT` / `TEXT` (on `StorageColumn`) | `{}` |

### JSON Column Types

The `JSON` and `JSONProxy` types store structured data as serialized JSON text in SQL databases. Meadow handles serialization and deserialization automatically in the provider layer.

**JSON** -- the SQL column and object property share the same name:

```javascript
{ Column: 'Metadata', Type: 'JSON' }
```

On create/update, the object value is `JSON.stringify`'d into the `Metadata` TEXT column. On read, the text is `JSON.parse`'d back into an object on `record.Metadata`.

**JSONProxy** -- the SQL column name differs from the JavaScript property:

```javascript
{ Column: 'Preferences', Type: 'JSONProxy', StorageColumn: 'PreferencesJSON' }
```

On create/update, the value from `record.Preferences` is `JSON.stringify`'d and stored in the `PreferencesJSON` SQL column. On read, `PreferencesJSON` is parsed and mapped to `record.Preferences`. The storage column (`PreferencesJSON`) is never exposed on the marshaled record object.

This separation is useful when you want a clean API surface (`record.Preferences`) while keeping a database naming convention that makes the storage format explicit (`PreferencesJSON`).

For object-store providers (MongoDB, RocksDB), JSON values are stored and retrieved as native objects -- no serialization is needed.

JSON columns support the standard `Column` and `Type` properties, plus:

| Property | Required | Description |
|----------|----------|-------------|
| `StorageColumn` | JSONProxy only | The actual SQL column name for storage |

See [JSON Columns](json-columns.md) for detailed examples and filtering.

### Audit Column Types

These special types trigger automatic behavior during CRUD operations:

| Type | Description | Auto-Populated |
|------|-------------|----------------|
| `CreateDate` | Timestamp when record was created | Set to current UTC time on `doCreate` |
| `CreateIDUser` | User who created the record | Set from `query.IDUser` on `doCreate` |
| `UpdateDate` | Timestamp of last update | Set to current UTC time on `doUpdate` |
| `UpdateIDUser` | User who last updated | Set from `query.IDUser` on `doUpdate` |
| `DeleteDate` | Timestamp of soft deletion | Set to current UTC time on `doDelete` |
| `DeleteIDUser` | User who soft deleted | Set from `query.IDUser` on `doDelete` |
| `Deleted` | Soft delete flag | Set to `1` on `doDelete`, `0` on `doUndelete` |

### Column Properties

| Property | Required | Description |
|----------|----------|-------------|
| `Column` | Yes | The column name in the database |
| `Type` | Yes | One of the column types listed above |
| `Size` | No | For `String`: max length (e.g., `'255'`). For `Decimal`: precision and scale (e.g., `'12,2'`) |

## JSON Schema Validation

Meadow supports JSON Schema v4 for validating objects before they reach the database. Validation uses the [is-my-json-valid](https://github.com/mafintosh/is-my-json-valid) library with greedy mode enabled.

```javascript
meadow.setJsonSchema({
	title: 'Book',
	description: 'A book in the catalog',
	type: 'object',
	properties:
	{
		IDBook:
		{
			description: 'The unique identifier for a book',
			type: 'integer'
		},
		Title:
		{
			description: 'The book title',
			type: 'string'
		},
		Author:
		{
			description: 'The book author',
			type: 'string'
		},
		PageCount:
		{
			description: 'Number of pages',
			type: 'integer'
		}
	},
	required: ['Title']
});
```

### Validating Objects

```javascript
// Valid object
const tmpResult = meadow.schemaFull.validateObject(
	{ IDBook: 1, Title: 'Dune', Author: 'Frank Herbert', PageCount: 412 });
// { Valid: true, Errors: [] }

// Invalid object (missing required field)
const tmpResult = meadow.schemaFull.validateObject(
	{ IDBook: 2, Author: 'Isaac Asimov' });
// { Valid: false, Errors: [...] }
```

The `validateObject` method returns an object with:

| Property | Type | Description |
|----------|------|-------------|
| `Valid` | boolean | Whether the object passed validation |
| `Errors` | array | Validation errors (empty when valid) |

## Default Object

The default object is a template that gets merged with submitted record data during `doCreate` operations. This ensures every column has a value even if the caller doesn't provide one.

```javascript
meadow.setDefault({
	IDBook: null,
	GUIDBook: '',
	Title: 'Untitled',
	Author: 'Unknown',
	PageCount: 0,
	Price: 0,
	InPrint: false,
	Synopsis: null,
	CreateDate: false,
	CreatingIDUser: 0,
	UpdateDate: false,
	UpdatingIDUser: 0,
	Deleted: 0,
	DeletingIDUser: 0,
	DeleteDate: false
});
```

### How Default Merging Works

During `doCreate`, Meadow merges the default object with the submitted record:

```javascript
// Internally, Meadow does:
// finalRecord = extend({}, defaultObject, submittedRecord)

// If you create with:
meadow.doCreate(
	meadow.query.addRecord({ Title: 'Neuromancer', Author: 'William Gibson' }),
	(pError, pCreateQuery, pReadQuery, pRecord) =>
	{
		// pRecord will contain:
		// {
		//   IDBook: <auto-generated>,
		//   GUIDBook: <auto-generated>,
		//   Title: 'Neuromancer',       <- from submitted record
		//   Author: 'William Gibson',   <- from submitted record
		//   PageCount: 0,               <- from default object
		//   Price: 0,                   <- from default object
		//   InPrint: false,             <- from default object
		//   ...
		// }
	});
```

## Authorizer

The authorizer defines role-based access control for each CRUD operation. Roles map to permission rules that Meadow-Endpoints uses to gate API access.

```javascript
meadow.setAuthorizer({
	Unauthenticated:
	{
		Create: 'Deny',
		Read: 'Deny',
		Reads: 'Deny',
		Update: 'Deny',
		Delete: 'Deny',
		Count: 'Deny',
		Schema: 'Deny'
	},
	User:
	{
		Create: 'Allow',
		Read: 'Allow',
		Reads: 'Allow',
		Update: 'Mine',
		Delete: 'Mine',
		Count: 'Allow',
		Schema: 'Allow'
	},
	Administrator:
	{
		Create: 'Allow',
		Read: 'Allow',
		Reads: 'Allow',
		Update: 'Allow',
		Delete: 'Allow',
		Count: 'Allow',
		Schema: 'Allow'
	}
});
```

### Permission Values

| Value | Description |
|-------|-------------|
| `'Allow'` | Full access to the operation |
| `'Deny'` | No access to the operation |
| Custom string | Contextual filter (e.g., `'Mine'`, `'MyCustomer'`) applied by Meadow-Endpoints behaviors |

### Operations

| Operation | CRUD Method | Description |
|-----------|-------------|-------------|
| `Create` | `doCreate` | Insert new records |
| `Read` | `doRead` | Retrieve a single record |
| `Reads` | `doReads` | Retrieve multiple records |
| `ReadsBy` | `doReads` | Retrieve by alternate key |
| `ReadMax` | `doRead` | Retrieve max value |
| `ReadSelectList` | `doReads` | Retrieve select lists |
| `Update` | `doUpdate` | Modify existing records |
| `Delete` | `doDelete` | Soft delete records |
| `Count` | `doCount` | Count records |
| `CountBy` | `doCount` | Count by alternate key |
| `Schema` | -- | Access schema metadata |
| `Validate` | -- | Validate objects |
| `New` | -- | Generate default objects |

### Default Role Names

Meadow uses a default set of role names (configurable via `MeadowRoleNames` in Fable settings):

```javascript
['Unauthenticated', 'User', 'Manager', 'Director', 'Executive', 'Administrator']
```

## Loading from a Package File

The most common way to define a complete schema is through a package JSON file that bundles all four parts together.

### Package File Format

```json
{
	"Scope": "Book",
	"Domain": "Library",
	"DefaultIdentifier": "IDBook",
	"Schema": [
		{ "Column": "IDBook", "Type": "AutoIdentity" },
		{ "Column": "GUIDBook", "Type": "AutoGUID" },
		{ "Column": "Title", "Type": "String", "Size": "255" },
		{ "Column": "Author", "Type": "String", "Size": "128" },
		{ "Column": "CreateDate", "Type": "CreateDate" },
		{ "Column": "CreatingIDUser", "Type": "CreateIDUser" },
		{ "Column": "UpdateDate", "Type": "UpdateDate" },
		{ "Column": "UpdatingIDUser", "Type": "UpdateIDUser" },
		{ "Column": "DeleteDate", "Type": "DeleteDate" },
		{ "Column": "DeletingIDUser", "Type": "DeleteIDUser" },
		{ "Column": "Deleted", "Type": "Deleted" }
	],
	"JsonSchema": {
		"title": "Book",
		"type": "object",
		"properties": {
			"IDBook": { "type": "integer" },
			"Title": { "type": "string" },
			"Author": { "type": "string" }
		},
		"required": ["Title"]
	},
	"DefaultObject": {
		"IDBook": null,
		"GUIDBook": "",
		"Title": "Untitled",
		"Author": "Unknown"
	},
	"Authorization": {
		"Unauthenticated": { "Read": "Deny", "Create": "Deny" },
		"User": { "Read": "Allow", "Create": "Allow" },
		"Administrator": { "Read": "Allow", "Create": "Allow" }
	}
}
```

### Loading from File

```javascript
const meadow = require('meadow')
	.new(libFable)
	.loadFromPackage(__dirname + '/Book.json');
```

The `loadFromPackage` method reads the JSON file and calls:
- `setScope(package.Scope)`
- `setDefaultIdentifier(package.DefaultIdentifier)`
- `setSchema(package.Schema)`
- `setJsonSchema(package.JsonSchema)`
- `setDefault(package.DefaultObject)`
- `setAuthorizer(package.Authorization)`

### Loading from Object

If you already have the package definition as a JavaScript object:

```javascript
const meadow = require('meadow')
	.new(libFable)
	.loadFromPackageObject({
		Scope: 'Book',
		DefaultIdentifier: 'IDBook',
		Schema:
		[
			{ Column: 'IDBook', Type: 'AutoIdentity' },
			{ Column: 'Title', Type: 'String', Size: '255' }
		],
		DefaultObject:
		{
			IDBook: null,
			Title: 'Untitled'
		}
	});
```

### Package Properties

| Property | Required | Description |
|----------|----------|-------------|
| `Scope` | Yes | Entity name (e.g., `'Book'`) |
| `Domain` | No | Domain grouping for organization |
| `DefaultIdentifier` | Yes | Primary key column name (e.g., `'IDBook'`) |
| `Schema` | Yes | Column schema array |
| `JsonSchema` | No | JSON Schema v4 for validation |
| `DefaultObject` | No | Default values template |
| `Authorization` | No | Role-based access control rules |

## API Reference

### Meadow Schema Methods

All schema methods are chainable and return the Meadow instance.

| Method | Parameters | Description |
|--------|------------|-------------|
| `setSchema(pSchema)` | Array of column definitions | Set the column schema |
| `setJsonSchema(pJsonSchema)` | JSON Schema v4 object | Set validation schema |
| `setDefault(pDefault)` | Default values object | Set default object template |
| `setAuthorizer(pAuthorizer)` | Authorization rules object | Set role-based access rules |
| `loadFromPackage(pPath)` | File path to JSON | Load all schema parts from a file |
| `loadFromPackageObject(pObject)` | Package object | Load all schema parts from an object |
| `validateObject(pObject)` | Object to validate | Validate against JSON Schema |

### Meadow Schema Properties

| Property | Type | Description |
|----------|------|-------------|
| `schema` | array | The column definition array |
| `schemaFull` | MeadowSchema | The full schema object with all methods |
| `jsonSchema` | object | The JSON Schema v4 definition |
| `defaultIdentifier` | string | The primary key column name |
| `defaultGUIdentifier` | string | The GUID column name (derived from identifier) |

## Provider Synchronization

When you call `setSchema()`, Meadow automatically synchronizes the schema with the active provider. This is important for providers like ALASQL that create tables dynamically based on the schema definition.

```javascript
// Internally, Meadow calls:
// provider.setSchema(scope, schema, defaultIdentifier, defaultGUIdentifier)

// This means you can change schemas at runtime:
meadow.setSchema(updatedSchema);
// The provider is automatically updated
```

## Related Documentation

- [Query Overview](query/README.md) -- How queries interact with schema-defined columns
- [Providers Overview](providers/README.md) -- How providers use schema for SQL generation
- [Create Operation](query/create.md) -- How default objects and auto-stamps work during create
