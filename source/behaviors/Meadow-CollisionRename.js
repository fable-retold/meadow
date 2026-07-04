// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/
var libCrypto = require('crypto');

/**
* Meadow Behavior - Soft-Deleted Collision Rename
*
* When an INSERT (or upsert-create branch) would collide on a UNIQUE
* constraint AND the conflicting existing row is soft-deleted (Deleted=1),
* rename the soft-deleted row's conflicting column(s) so the new row can
* take that slot. Frees downstream schemas from needing dialect-specific
* `WHERE Deleted=0` partial-index syntax to keep soft-deleted rows out of
* the unique-index domain.
*
* Renamed-value format: `__mdsd_{16hex}` where the hex is the first 16
* characters of sha1("{IDRecord}:{Column}:{OriginalValue}"). Deterministic,
* bounded length (~22 chars), and forensics-traceable: given a soft-deleted
* row's pk + original value, recompute the hash to verify the renamed slot.
*
* The schema opts in via per-column `Unique: true` (single-column constraint)
* or `UniqueGroup: "<name>"` (composite index — all columns sharing a group
* name). Columns of `Type: AutoGUID` are treated as implicitly unique. If a
* schema declares no unique columns, this is a no-op.
*/

var COLLISION_RENAME_PREFIX = '__mdsd_';
var COLLISION_RENAME_HASH_LENGTH = 16;

var buildRenamedValue = function (pIDRecord, pColumn, pOriginalValue)
{
	var tmpInput = String(pIDRecord) + ':' + String(pColumn) + ':' + String(pOriginalValue);
	var tmpHash = libCrypto.createHash('sha1').update(tmpInput).digest('hex').slice(0, COLLISION_RENAME_HASH_LENGTH);
	return COLLISION_RENAME_PREFIX + tmpHash;
};

/**
* Walk a meadow schema and collect unique-constraint groupings.
*
* Returns an array of { Columns, GroupName }, where Columns is the list of
* columns participating in the constraint and GroupName is null for single
* columns or the user's UniqueGroup name for composite constraints.
*/
var collectUniqueConstraints = function (pSchema)
{
	var tmpConstraints = [];
	if (!Array.isArray(pSchema))
	{
		return tmpConstraints;
	}

	var tmpGroups = {};

	for (var i = 0; i < pSchema.length; i++)
	{
		var tmpEntry = pSchema[i];

		// AutoGUID columns are implicitly unique. The pre-flight handles
		// BOTH soft-deleted-rename AND live-conflict error here, replacing
		// the old standalone GUID-conflict check in Meadow-Create — one
		// Read covers both behaviors instead of two.
		if (tmpEntry.Type === 'AutoGUID')
		{
			tmpConstraints.push({ Columns: [tmpEntry.Column], GroupName: '__autoguid_' + tmpEntry.Column, AutoGUID: true });
		}

		if (tmpEntry.Unique === true)
		{
			tmpConstraints.push({ Columns: [tmpEntry.Column], GroupName: null, AutoGUID: false });
		}

		if (typeof (tmpEntry.UniqueGroup) === 'string' && tmpEntry.UniqueGroup.length > 0)
		{
			if (!tmpGroups[tmpEntry.UniqueGroup])
			{
				tmpGroups[tmpEntry.UniqueGroup] = { Columns: [], GroupName: tmpEntry.UniqueGroup, AutoGUID: false };
			}
			tmpGroups[tmpEntry.UniqueGroup].Columns.push(tmpEntry.Column);
		}
	}

	var tmpGroupNames = Object.keys(tmpGroups);
	for (var g = 0; g < tmpGroupNames.length; g++)
	{
		tmpConstraints.push(tmpGroups[tmpGroupNames[g]]);
	}

	return tmpConstraints;
};

/**
* Find the schema entry for the soft-delete flag column, if any.
* Returns the column name (e.g. "Deleted") or null when no soft-delete
* tracking is configured.
*/
var findDeletedColumn = function (pSchema)
{
	if (!Array.isArray(pSchema))
	{
		return null;
	}
	for (var i = 0; i < pSchema.length; i++)
	{
		if (pSchema[i].Type === 'Deleted')
		{
			return pSchema[i].Column;
		}
	}
	return null;
};

/**
* For one constraint: scan for matching rows (with delete tracking
* disabled), and rename any that are soft-deleted on the constraint
* columns. Live conflicts pass through untouched so the regular DB
* unique-index error fires.
*/
var processConstraint = function (pMeadow, pNewRecord, pConstraint, pDeletedColumn, fCallback)
{
	for (var i = 0; i < pConstraint.Columns.length; i++)
	{
		var tmpColumn = pConstraint.Columns[i];
		// If the new record doesn't supply a value for every column in the
		// constraint, no meaningful conflict query can be formed — skip.
		if (!Object.prototype.hasOwnProperty.call(pNewRecord, tmpColumn))
		{
			return fCallback();
		}
		var tmpValue = pNewRecord[tmpColumn];
		if (tmpValue === '' || tmpValue === null || typeof (tmpValue) === 'undefined')
		{
			return fCallback();
		}
		// AutoGUID gating mirrors the old Meadow-Create Step 0 check: only
		// scan when the value is at least 5 chars (FoxHound's GUID min) and
		// not the schema's '0x0000000000000000' placeholder. Without these,
		// schemas with placeholder defaults would trigger spurious renames.
		if (pConstraint.AutoGUID && (typeof (tmpValue) !== 'string' || tmpValue.length < 5 || tmpValue === '0x0000000000000000'))
		{
			return fCallback();
		}
	}

	var tmpReadQuery = pMeadow.query.clone().setDisableDeleteTracking(true);
	for (var c = 0; c < pConstraint.Columns.length; c++)
	{
		tmpReadQuery.addFilter(pConstraint.Columns[c], pNewRecord[pConstraint.Columns[c]]);
	}

	pMeadow.provider.Read(tmpReadQuery, function ()
	{
		if (tmpReadQuery.error)
		{
			return fCallback(tmpReadQuery.error);
		}

		var tmpRows = tmpReadQuery.result.value;
		if (!Array.isArray(tmpRows) || tmpRows.length < 1)
		{
			return fCallback();
		}

		var tmpSoftDeletedRows = [];
		for (var r = 0; r < tmpRows.length; r++)
		{
			var tmpFlag = pDeletedColumn ? tmpRows[r][pDeletedColumn] : 0;
			// Backends are inconsistent: SQLite returns the integer 1, MySQL
			// can return a Buffer or boolean, MongoDB a boolean, etc. Treat
			// any truthy value as soft-deleted.
			if (tmpFlag == 1 || tmpFlag === true)
			{
				tmpSoftDeletedRows.push(tmpRows[r]);
			}
		}

		if (tmpSoftDeletedRows.length < 1)
		{
			// AutoGUID columns get an explicit pre-flight error to preserve
			// the legacy Meadow-Create Step 0 contract: callers expect the
			// "Record with GUID X already exists!" string before the INSERT
			// fires, not a downstream DB unique-index error. User-defined
			// Unique columns keep deferring to the DB so the error surface
			// for those isn't expanded by this refactor.
			if (pConstraint.AutoGUID)
			{
				var tmpGUIDValue = pNewRecord[pConstraint.Columns[0]];
				return fCallback('Record with GUID ' + tmpGUIDValue + ' already exists!');
			}
			return fCallback();
		}

		var tmpRenameNext = function (pIndex)
		{
			if (pIndex >= tmpSoftDeletedRows.length)
			{
				return fCallback();
			}

			var tmpRow = tmpSoftDeletedRows[pIndex];
			var tmpRowID = tmpRow[pMeadow.defaultIdentifier];
			var tmpRenameRecord = {};
			tmpRenameRecord[pMeadow.defaultIdentifier] = tmpRowID;
			for (var k = 0; k < pConstraint.Columns.length; k++)
			{
				var tmpCol = pConstraint.Columns[k];
				tmpRenameRecord[tmpCol] = buildRenamedValue(tmpRowID, tmpCol, tmpRow[tmpCol]);
			}

			var tmpUpdateQuery = pMeadow.query.clone()
				.setDisableDeleteTracking(true)
				.addRecord(tmpRenameRecord)
				.addFilter(pMeadow.defaultIdentifier, tmpRowID);

			// Use the meadow's IDUser so audit columns get a sensible value
			// — the rename is a side effect of the new record's create, so
			// the same user identity drives both.
			tmpUpdateQuery.query.IDUser = pMeadow.userIdentifier;

			pMeadow.provider.Update(tmpUpdateQuery, function ()
			{
				if (tmpUpdateQuery.error)
				{
					return fCallback(tmpUpdateQuery.error);
				}
				return tmpRenameNext(pIndex + 1);
			});
		};

		tmpRenameNext(0);
	});
};

/**
* Top-level: walk all unique constraints in the schema and rename any
* soft-deleted conflicts so the imminent INSERT can take the slot.
*/
var renameSoftDeletedConflicts = function (pMeadow, pNewRecord, fCallback)
{
	var tmpConstraints = collectUniqueConstraints(pMeadow.schema);
	if (tmpConstraints.length < 1)
	{
		return fCallback();
	}

	var tmpDeletedColumn = findDeletedColumn(pMeadow.schema);
	// If there's no Deleted column in the schema, soft-delete tracking
	// isn't a concept here — nothing can be soft-deleted, so nothing to
	// rename. Bail out early.
	if (!tmpDeletedColumn)
	{
		return fCallback();
	}

	var tmpProcessNext = function (pIndex)
	{
		if (pIndex >= tmpConstraints.length)
		{
			return fCallback();
		}

		processConstraint(pMeadow, pNewRecord, tmpConstraints[pIndex], tmpDeletedColumn, function (pError)
		{
			if (pError)
			{
				return fCallback(pError);
			}
			return tmpProcessNext(pIndex + 1);
		});
	};

	tmpProcessNext(0);
};

module.exports = renameSoftDeletedConflicts;
module.exports.buildRenamedValue = buildRenamedValue;
module.exports.collectUniqueConstraints = collectUniqueConstraints;
module.exports.findDeletedColumn = findDeletedColumn;
module.exports.COLLISION_RENAME_PREFIX = COLLISION_RENAME_PREFIX;
module.exports.COLLISION_RENAME_HASH_LENGTH = COLLISION_RENAME_HASH_LENGTH;
