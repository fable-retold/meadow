// ##### Part of the **[retold](https://fable-retold.io/)** system
/**
* @license MIT
* @author <steven@velozo.com>
*/

/**
* Load the schema and metadata from a package file
*
* @method loadFromPackageFile
* @return {Object} Returns a new Meadow, or false if it failed
*/
var loadFromPackageFile = function(pMeadow, pPackage)
{
	// Use the package loader to grab the configuration objects and clone a new Meadow.
	var tmpPackage = false;
	try
	{
		tmpPackage = require(pPackage);
	}
	catch(pError)
	{
		pMeadow.fable.log.error('Error loading Fable package', {Package:pPackage});
		return false;
	}

	// Spool up a new Meadow object
	var tmpNewMeadow = pMeadow.new(pMeadow.fable);

	// Safely set the parameters
	if (typeof(tmpPackage.Scope) === 'string')
	{
		tmpNewMeadow.setScope(tmpPackage.Scope);
	}
	
	if (typeof(tmpPackage.Domain) === 'string')
	{
		tmpNewMeadow.setDomain(tmpPackage.Domain);
	}

	if (typeof(tmpPackage.DefaultIdentifier) === 'string')
	{
		tmpNewMeadow.setDefaultIdentifier(tmpPackage.DefaultIdentifier);
	}
	if (Array.isArray(tmpPackage.Schema))
	{
		tmpNewMeadow.setSchema(tmpPackage.Schema);
	}
	if (typeof(tmpPackage.JsonSchema) === 'object')
	{
		tmpNewMeadow.setJsonSchema(tmpPackage.JsonSchema);
	}
	if (typeof(tmpPackage.DefaultObject) === 'object')
	{
		tmpNewMeadow.setDefault(tmpPackage.DefaultObject);
	}

	if (typeof(tmpPackage.Authorization) === 'object')
	{
		tmpNewMeadow.setAuthorizer(tmpPackage.Authorization);
	}

	return tmpNewMeadow;
};

module.exports = loadFromPackageFile;