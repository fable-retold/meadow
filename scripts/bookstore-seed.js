#!/usr/bin/env node
/**
 * Bookstore Schema and Seed Data Generator for Meadow Tests.
 *
 * Emits dialect-specific DDL and INSERT statements to stdout. Each row's
 * GUIDBook / GUIDAuthor value is minted with fable-uuid's getUUID() so the
 * seeded records land with distinct v4 UUIDs instead of the table default
 * '00000000-0000-0000-0000-000000000000'. This matters because comprehensions
 * key records by GUID and duplicates collapse onto a single entry.
 *
 * Usage:
 *   node bookstore-seed.js --dialect <mysql|postgresql|mssql>
 *
 * The docker-*-test-db.sh scripts pipe this script's stdout into the database
 * client running inside the corresponding container.
 */

const libFableUUID = require('fable-uuid');

const tmpUUID = new libFableUUID();

// ---------------------------------------------------------------------------
// Seed data — mirrors the first 20 books and 21 authors from the prior static
// bookstore-seed.sql. Kept inline so the generator is single-file.
// ---------------------------------------------------------------------------

const BOOKS = [
	{ Title: 'The Hunger Games',                                          Type: 'Paper', Genre: 'UNKNOWN', ISBN: '439023483',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1447303603m/2767052.jpg',  PublicationYear: 2008 },
	{ Title: 'Harry Potter and the Philosopher\'s Stone',                 Type: 'Paper', Genre: 'UNKNOWN', ISBN: '439554934',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1474154022m/3.jpg',        PublicationYear: 1997 },
	{ Title: 'Twilight',                                                  Type: 'Paper', Genre: 'UNKNOWN', ISBN: '316015849',  Language: 'en-US', ImageURL: 'https://images.gr-assets.com/books/1361039443m/41865.jpg',    PublicationYear: 2005 },
	{ Title: 'To Kill a Mockingbird',                                     Type: 'Paper', Genre: 'UNKNOWN', ISBN: '61120081',   Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1361975680m/2657.jpg',     PublicationYear: 1960 },
	{ Title: 'The Great Gatsby',                                          Type: 'Paper', Genre: 'UNKNOWN', ISBN: '743273567',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1490528560m/4671.jpg',     PublicationYear: 1925 },
	{ Title: 'The Fault in Our Stars',                                    Type: 'Paper', Genre: 'UNKNOWN', ISBN: '525478817',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1360206420m/11870085.jpg', PublicationYear: 2012 },
	{ Title: 'The Hobbit or There and Back Again',                        Type: 'Paper', Genre: 'UNKNOWN', ISBN: '618260307',  Language: 'en-US', ImageURL: 'https://images.gr-assets.com/books/1372847500m/5907.jpg',     PublicationYear: 1937 },
	{ Title: 'The Catcher in the Rye',                                    Type: 'Paper', Genre: 'UNKNOWN', ISBN: '316769177',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1398034300m/5107.jpg',     PublicationYear: 1951 },
	{ Title: 'Angels & Demons',                                           Type: 'Paper', Genre: 'UNKNOWN', ISBN: '1416524797', Language: 'en-CA', ImageURL: 'https://images.gr-assets.com/books/1303390735m/960.jpg',      PublicationYear: 2000 },
	{ Title: 'Pride and Prejudice',                                       Type: 'Paper', Genre: 'UNKNOWN', ISBN: '679783261',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1320399351m/1885.jpg',     PublicationYear: 1813 },
	{ Title: 'The Kite Runner',                                           Type: 'Paper', Genre: 'UNKNOWN', ISBN: '1594480001', Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1484565687m/77203.jpg',    PublicationYear: 2003 },
	{ Title: 'Divergent',                                                 Type: 'Paper', Genre: 'UNKNOWN', ISBN: '62024035',   Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1328559506m/13335037.jpg', PublicationYear: 2011 },
	{ Title: 'Nineteen Eighty-Four',                                      Type: 'Paper', Genre: 'UNKNOWN', ISBN: '451524934',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1348990566m/5470.jpg',     PublicationYear: 1949 },
	{ Title: 'Animal Farm: A Fairy Story',                                Type: 'Paper', Genre: 'UNKNOWN', ISBN: '452284244',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1424037542m/7613.jpg',     PublicationYear: 1945 },
	{ Title: 'Het Achterhuis: Dagboekbrieven 14 juni 1942 - 1 augustus 1944', Type: 'Paper', Genre: 'UNKNOWN', ISBN: '553296981', Language: 'eng', ImageURL: 'https://images.gr-assets.com/books/1358276407m/48855.jpg',    PublicationYear: 1947 },
	{ Title: 'Män som hatar kvinnor',                                     Type: 'Paper', Genre: 'UNKNOWN', ISBN: '307269752',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1327868566m/2429135.jpg',  PublicationYear: 2005 },
	{ Title: 'Catching Fire',                                             Type: 'Paper', Genre: 'UNKNOWN', ISBN: '439023491',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1358273780m/6148028.jpg',  PublicationYear: 2009 },
	{ Title: 'Harry Potter and the Prisoner of Azkaban',                  Type: 'Paper', Genre: 'UNKNOWN', ISBN: '043965548X', Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1499277281m/5.jpg',        PublicationYear: 1999 },
	{ Title: 'The Fellowship of the Ring',                                Type: 'Paper', Genre: 'UNKNOWN', ISBN: '618346252',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1298411339m/34.jpg',       PublicationYear: 1954 },
	{ Title: 'Mockingjay',                                                Type: 'Paper', Genre: 'UNKNOWN', ISBN: '439023513',  Language: 'eng',   ImageURL: 'https://images.gr-assets.com/books/1358275419m/7260188.jpg',  PublicationYear: 2010 }
];

const AUTHORS = [
	'Suzanne Collins',
	'J.K. Rowling',
	'Mary GrandPré',
	'Stephenie Meyer',
	'Harper Lee',
	'F. Scott Fitzgerald',
	'John Green',
	'J.R.R. Tolkien',
	'J.D. Salinger',
	'Dan Brown',
	'Jane Austen',
	'Khaled Hosseini',
	'Veronica Roth',
	'George Orwell',
	'Erich Fromm',
	'Anne Frank',
	'Eleanor Roosevelt',
	'B.M. Mooyaart-Doubleday',
	'Stieg Larsson',
	'Reg Keeland',
	'Rufus Beck'
];

// ---------------------------------------------------------------------------
// SQL-literal quoting — escape single quotes by doubling them.
// ---------------------------------------------------------------------------
function sqlQuote(pValue)
{
	return '\'' + String(pValue).replace(/'/g, '\'\'') + '\'';
}

// ---------------------------------------------------------------------------
// MySQL emitter
// ---------------------------------------------------------------------------
function emitMySQL()
{
	const tmpOut = [];
	tmpOut.push('-- Bookstore Schema and Seed Data for Meadow MySQL Tests');
	tmpOut.push('-- Generated by scripts/bookstore-seed.js (GUIDs minted via fable-uuid)');
	tmpOut.push('');
	tmpOut.push('-- Schema');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    Book');
	tmpOut.push('    (');
	tmpOut.push('        IDBook INT UNSIGNED NOT NULL AUTO_INCREMENT,');
	tmpOut.push('        GUIDBook CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate DATETIME,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        UpdateDate DATETIME,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        Deleted TINYINT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        DeleteDate DATETIME,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        Title CHAR(200) NOT NULL DEFAULT \'\',');
	tmpOut.push('        Type CHAR(32) NOT NULL DEFAULT \'\',');
	tmpOut.push('        Genre CHAR(128) NOT NULL DEFAULT \'\',');
	tmpOut.push('        ISBN CHAR(64) NOT NULL DEFAULT \'\',');
	tmpOut.push('        Language CHAR(12) NOT NULL DEFAULT \'\',');
	tmpOut.push('        ImageURL CHAR(254) NOT NULL DEFAULT \'\',');
	tmpOut.push('        PublicationYear INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('');
	tmpOut.push('        PRIMARY KEY (IDBook)');
	tmpOut.push('    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    BookAuthorJoin');
	tmpOut.push('    (');
	tmpOut.push('        IDBookAuthorJoin INT UNSIGNED NOT NULL AUTO_INCREMENT,');
	tmpOut.push('        GUIDBookAuthorJoin CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        IDBook INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        IDAuthor INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('');
	tmpOut.push('        PRIMARY KEY (IDBookAuthorJoin)');
	tmpOut.push('    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    Author');
	tmpOut.push('    (');
	tmpOut.push('        IDAuthor INT UNSIGNED NOT NULL AUTO_INCREMENT,');
	tmpOut.push('        GUIDAuthor CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate DATETIME,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        UpdateDate DATETIME,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        Deleted TINYINT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        DeleteDate DATETIME,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        Name CHAR(200) NOT NULL DEFAULT \'\',');
	tmpOut.push('');
	tmpOut.push('        PRIMARY KEY (IDAuthor)');
	tmpOut.push('    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    BookPrice');
	tmpOut.push('    (');
	tmpOut.push('        IDBookPrice INT UNSIGNED NOT NULL AUTO_INCREMENT,');
	tmpOut.push('        GUIDBookPrice CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate DATETIME,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        UpdateDate DATETIME,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        Deleted TINYINT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        DeleteDate DATETIME,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        Price DECIMAL(8,2),');
	tmpOut.push('        StartDate DATETIME,');
	tmpOut.push('        EndDate DATETIME,');
	tmpOut.push('        Discountable TINYINT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        CouponCode CHAR(16) NOT NULL DEFAULT \'\',');
	tmpOut.push('        IDBook INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('');
	tmpOut.push('        PRIMARY KEY (IDBookPrice)');
	tmpOut.push('    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    Review');
	tmpOut.push('    (');
	tmpOut.push('        IDReviews INT UNSIGNED NOT NULL AUTO_INCREMENT,');
	tmpOut.push('        GUIDReviews CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate DATETIME,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        UpdateDate DATETIME,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        Deleted TINYINT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        DeleteDate DATETIME,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        Text TEXT,');
	tmpOut.push('        Rating INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('        IDBook INT NOT NULL DEFAULT \'0\',');
	tmpOut.push('');
	tmpOut.push('        PRIMARY KEY (IDReviews)');
	tmpOut.push('    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
	tmpOut.push('');
	tmpOut.push('-- Seed Data: First 20 books from books.csv');
	tmpOut.push('-- Inserted in CSV order so IDBook matches CSV row number');
	tmpOut.push('');
	tmpOut.push('INSERT INTO Book (GUIDBook, Title, Type, Genre, ISBN, Language, ImageURL, PublicationYear, CreateDate, CreatingIDUser, UpdateDate, UpdatingIDUser) VALUES');
	const tmpBookRows = BOOKS.map((pBook) =>
	{
		return '(' + [
			sqlQuote(tmpUUID.getUUID()),
			sqlQuote(pBook.Title),
			sqlQuote(pBook.Type),
			sqlQuote(pBook.Genre),
			sqlQuote(pBook.ISBN),
			sqlQuote(pBook.Language),
			sqlQuote(pBook.ImageURL),
			pBook.PublicationYear,
			'NOW()', '99999', 'NOW()', '99999'
		].join(', ') + ')';
	});
	tmpOut.push(tmpBookRows.join(',\n') + ';');
	tmpOut.push('');
	tmpOut.push('-- Seed Data: Authors for the first 20 books');
	tmpOut.push('');
	tmpOut.push('INSERT INTO Author (GUIDAuthor, Name, CreateDate, CreatingIDUser, UpdateDate, UpdatingIDUser) VALUES');
	const tmpAuthorRows = AUTHORS.map((pName) =>
	{
		return '(' + [
			sqlQuote(tmpUUID.getUUID()),
			sqlQuote(pName),
			'NOW()', '99999', 'NOW()', '99999'
		].join(', ') + ')';
	});
	tmpOut.push(tmpAuthorRows.join(',\n') + ';');
	tmpOut.push('');
	return tmpOut.join('\n');
}

// ---------------------------------------------------------------------------
// PostgreSQL emitter
// ---------------------------------------------------------------------------
function emitPostgreSQL()
{
	const tmpOut = [];
	tmpOut.push('-- Bookstore Schema and Seed Data for Meadow PostgreSQL Tests');
	tmpOut.push('-- Generated by scripts/bookstore-seed.js (GUIDs minted via fable-uuid)');
	tmpOut.push('');
	tmpOut.push('-- Schema');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    Book');
	tmpOut.push('    (');
	tmpOut.push('        IDBook SERIAL PRIMARY KEY,');
	tmpOut.push('        GUIDBook CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate TIMESTAMP,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        UpdateDate TIMESTAMP,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Deleted SMALLINT NOT NULL DEFAULT 0,');
	tmpOut.push('        DeleteDate TIMESTAMP,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Title VARCHAR(200) NOT NULL DEFAULT \'\',');
	tmpOut.push('        Type VARCHAR(32) NOT NULL DEFAULT \'\',');
	tmpOut.push('        Genre VARCHAR(128) NOT NULL DEFAULT \'\',');
	tmpOut.push('        ISBN VARCHAR(64) NOT NULL DEFAULT \'\',');
	tmpOut.push('        Language VARCHAR(12) NOT NULL DEFAULT \'\',');
	tmpOut.push('        ImageURL VARCHAR(254) NOT NULL DEFAULT \'\',');
	tmpOut.push('        PublicationYear INT NOT NULL DEFAULT 0');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    BookAuthorJoin');
	tmpOut.push('    (');
	tmpOut.push('        IDBookAuthorJoin SERIAL PRIMARY KEY,');
	tmpOut.push('        GUIDBookAuthorJoin CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        IDBook INT NOT NULL DEFAULT 0,');
	tmpOut.push('        IDAuthor INT NOT NULL DEFAULT 0');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    Author');
	tmpOut.push('    (');
	tmpOut.push('        IDAuthor SERIAL PRIMARY KEY,');
	tmpOut.push('        GUIDAuthor CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate TIMESTAMP,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        UpdateDate TIMESTAMP,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Deleted SMALLINT NOT NULL DEFAULT 0,');
	tmpOut.push('        DeleteDate TIMESTAMP,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Name VARCHAR(200) NOT NULL DEFAULT \'\'');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    BookPrice');
	tmpOut.push('    (');
	tmpOut.push('        IDBookPrice SERIAL PRIMARY KEY,');
	tmpOut.push('        GUIDBookPrice CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate TIMESTAMP,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        UpdateDate TIMESTAMP,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Deleted SMALLINT NOT NULL DEFAULT 0,');
	tmpOut.push('        DeleteDate TIMESTAMP,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Price DECIMAL(8,2),');
	tmpOut.push('        StartDate TIMESTAMP,');
	tmpOut.push('        EndDate TIMESTAMP,');
	tmpOut.push('        Discountable SMALLINT NOT NULL DEFAULT 0,');
	tmpOut.push('        CouponCode VARCHAR(16) NOT NULL DEFAULT \'\',');
	tmpOut.push('        IDBook INT NOT NULL DEFAULT 0');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE IF NOT EXISTS');
	tmpOut.push('    Review');
	tmpOut.push('    (');
	tmpOut.push('        IDReviews SERIAL PRIMARY KEY,');
	tmpOut.push('        GUIDReviews CHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate TIMESTAMP,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        UpdateDate TIMESTAMP,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Deleted SMALLINT NOT NULL DEFAULT 0,');
	tmpOut.push('        DeleteDate TIMESTAMP,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Text TEXT,');
	tmpOut.push('        Rating INT NOT NULL DEFAULT 0,');
	tmpOut.push('        IDBook INT NOT NULL DEFAULT 0');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('-- Seed Data: First 20 books from books.csv');
	tmpOut.push('');
	tmpOut.push('INSERT INTO Book (GUIDBook, Title, Type, Genre, ISBN, Language, ImageURL, PublicationYear, CreateDate, CreatingIDUser, UpdateDate, UpdatingIDUser) VALUES');
	const tmpBookRows = BOOKS.map((pBook) =>
	{
		return '(' + [
			sqlQuote(tmpUUID.getUUID()),
			sqlQuote(pBook.Title),
			sqlQuote(pBook.Type),
			sqlQuote(pBook.Genre),
			sqlQuote(pBook.ISBN),
			sqlQuote(pBook.Language),
			sqlQuote(pBook.ImageURL),
			pBook.PublicationYear,
			'NOW()', '99999', 'NOW()', '99999'
		].join(', ') + ')';
	});
	tmpOut.push(tmpBookRows.join(',\n') + ';');
	tmpOut.push('');
	tmpOut.push('-- Seed Data: Authors for the first 20 books');
	tmpOut.push('');
	tmpOut.push('INSERT INTO Author (GUIDAuthor, Name, CreateDate, CreatingIDUser, UpdateDate, UpdatingIDUser) VALUES');
	const tmpAuthorRows = AUTHORS.map((pName) =>
	{
		return '(' + [
			sqlQuote(tmpUUID.getUUID()),
			sqlQuote(pName),
			'NOW()', '99999', 'NOW()', '99999'
		].join(', ') + ')';
	});
	tmpOut.push(tmpAuthorRows.join(',\n') + ';');
	tmpOut.push('');
	return tmpOut.join('\n');
}

// ---------------------------------------------------------------------------
// MSSQL emitter. MSSQL has no CREATE TABLE IF NOT EXISTS, so wrap each create
// in an IF OBJECT_ID(...) IS NULL block. GO batch separators are emitted so
// sqlcmd treats each CREATE/INSERT group as its own batch.
// ---------------------------------------------------------------------------
function emitMSSQL()
{
	const tmpOut = [];
	tmpOut.push('-- Bookstore Schema and Seed Data for Meadow MSSQL Tests');
	tmpOut.push('-- Generated by scripts/bookstore-seed.js (GUIDs minted via fable-uuid)');
	tmpOut.push('');
	tmpOut.push('IF OBJECT_ID(\'Book\', \'U\') IS NULL');
	tmpOut.push('BEGIN');
	tmpOut.push('    CREATE TABLE Book');
	tmpOut.push('    (');
	tmpOut.push('        IDBook INT IDENTITY(1,1) NOT NULL PRIMARY KEY,');
	tmpOut.push('        GUIDBook VARCHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate DATETIME,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        UpdateDate DATETIME,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Deleted TINYINT NOT NULL DEFAULT 0,');
	tmpOut.push('        DeleteDate DATETIME,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Title NVARCHAR(200) NOT NULL DEFAULT \'\',');
	tmpOut.push('        Type VARCHAR(32) NOT NULL DEFAULT \'\',');
	tmpOut.push('        Genre VARCHAR(128) NOT NULL DEFAULT \'\',');
	tmpOut.push('        ISBN VARCHAR(64) NOT NULL DEFAULT \'\',');
	tmpOut.push('        Language VARCHAR(12) NOT NULL DEFAULT \'\',');
	tmpOut.push('        ImageURL VARCHAR(254) NOT NULL DEFAULT \'\',');
	tmpOut.push('        PublicationYear INT NOT NULL DEFAULT 0');
	tmpOut.push('    );');
	tmpOut.push('END;');
	tmpOut.push('GO');
	tmpOut.push('');
	tmpOut.push('IF OBJECT_ID(\'BookAuthorJoin\', \'U\') IS NULL');
	tmpOut.push('BEGIN');
	tmpOut.push('    CREATE TABLE BookAuthorJoin');
	tmpOut.push('    (');
	tmpOut.push('        IDBookAuthorJoin INT IDENTITY(1,1) NOT NULL PRIMARY KEY,');
	tmpOut.push('        GUIDBookAuthorJoin VARCHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        IDBook INT NOT NULL DEFAULT 0,');
	tmpOut.push('        IDAuthor INT NOT NULL DEFAULT 0');
	tmpOut.push('    );');
	tmpOut.push('END;');
	tmpOut.push('GO');
	tmpOut.push('');
	tmpOut.push('IF OBJECT_ID(\'Author\', \'U\') IS NULL');
	tmpOut.push('BEGIN');
	tmpOut.push('    CREATE TABLE Author');
	tmpOut.push('    (');
	tmpOut.push('        IDAuthor INT IDENTITY(1,1) NOT NULL PRIMARY KEY,');
	tmpOut.push('        GUIDAuthor VARCHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate DATETIME,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        UpdateDate DATETIME,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Deleted TINYINT NOT NULL DEFAULT 0,');
	tmpOut.push('        DeleteDate DATETIME,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Name NVARCHAR(200) NOT NULL DEFAULT \'\'');
	tmpOut.push('    );');
	tmpOut.push('END;');
	tmpOut.push('GO');
	tmpOut.push('');
	tmpOut.push('IF OBJECT_ID(\'BookPrice\', \'U\') IS NULL');
	tmpOut.push('BEGIN');
	tmpOut.push('    CREATE TABLE BookPrice');
	tmpOut.push('    (');
	tmpOut.push('        IDBookPrice INT IDENTITY(1,1) NOT NULL PRIMARY KEY,');
	tmpOut.push('        GUIDBookPrice VARCHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate DATETIME,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        UpdateDate DATETIME,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Deleted TINYINT NOT NULL DEFAULT 0,');
	tmpOut.push('        DeleteDate DATETIME,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Price DECIMAL(8,2),');
	tmpOut.push('        StartDate DATETIME,');
	tmpOut.push('        EndDate DATETIME,');
	tmpOut.push('        Discountable TINYINT NOT NULL DEFAULT 0,');
	tmpOut.push('        CouponCode VARCHAR(16) NOT NULL DEFAULT \'\',');
	tmpOut.push('        IDBook INT NOT NULL DEFAULT 0');
	tmpOut.push('    );');
	tmpOut.push('END;');
	tmpOut.push('GO');
	tmpOut.push('');
	tmpOut.push('IF OBJECT_ID(\'Review\', \'U\') IS NULL');
	tmpOut.push('BEGIN');
	tmpOut.push('    CREATE TABLE Review');
	tmpOut.push('    (');
	tmpOut.push('        IDReviews INT IDENTITY(1,1) NOT NULL PRIMARY KEY,');
	tmpOut.push('        GUIDReviews VARCHAR(36) NOT NULL DEFAULT \'00000000-0000-0000-0000-000000000000\',');
	tmpOut.push('        CreateDate DATETIME,');
	tmpOut.push('        CreatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        UpdateDate DATETIME,');
	tmpOut.push('        UpdatingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Deleted TINYINT NOT NULL DEFAULT 0,');
	tmpOut.push('        DeleteDate DATETIME,');
	tmpOut.push('        DeletingIDUser INT NOT NULL DEFAULT 0,');
	tmpOut.push('        Text NVARCHAR(MAX),');
	tmpOut.push('        Rating INT NOT NULL DEFAULT 0,');
	tmpOut.push('        IDBook INT NOT NULL DEFAULT 0');
	tmpOut.push('    );');
	tmpOut.push('END;');
	tmpOut.push('GO');
	tmpOut.push('');
	tmpOut.push('-- Seed Data: First 20 books from books.csv');
	tmpOut.push('-- Inserted only when the Book table is empty so re-runs don\'t duplicate data');
	tmpOut.push('');
	tmpOut.push('IF NOT EXISTS (SELECT 1 FROM Book)');
	tmpOut.push('BEGIN');
	tmpOut.push('    INSERT INTO Book (GUIDBook, Title, Type, Genre, ISBN, Language, ImageURL, PublicationYear, CreateDate, CreatingIDUser, UpdateDate, UpdatingIDUser) VALUES');
	const tmpBookRows = BOOKS.map((pBook) =>
	{
		return '    (' + [
			sqlQuote(tmpUUID.getUUID()),
			'N' + sqlQuote(pBook.Title),
			sqlQuote(pBook.Type),
			sqlQuote(pBook.Genre),
			sqlQuote(pBook.ISBN),
			sqlQuote(pBook.Language),
			sqlQuote(pBook.ImageURL),
			pBook.PublicationYear,
			'GETUTCDATE()', '99999', 'GETUTCDATE()', '99999'
		].join(', ') + ')';
	});
	tmpOut.push(tmpBookRows.join(',\n') + ';');
	tmpOut.push('END;');
	tmpOut.push('GO');
	tmpOut.push('');
	tmpOut.push('IF NOT EXISTS (SELECT 1 FROM Author)');
	tmpOut.push('BEGIN');
	tmpOut.push('    INSERT INTO Author (GUIDAuthor, Name, CreateDate, CreatingIDUser, UpdateDate, UpdatingIDUser) VALUES');
	const tmpAuthorRows = AUTHORS.map((pName) =>
	{
		return '    (' + [
			sqlQuote(tmpUUID.getUUID()),
			'N' + sqlQuote(pName),
			'GETUTCDATE()', '99999', 'GETUTCDATE()', '99999'
		].join(', ') + ')';
	});
	tmpOut.push(tmpAuthorRows.join(',\n') + ';');
	tmpOut.push('END;');
	tmpOut.push('GO');
	tmpOut.push('');
	return tmpOut.join('\n');
}

// ---------------------------------------------------------------------------
// Oracle emitter. Oracle has no CREATE TABLE IF NOT EXISTS; the docker script
// runs this seed once against a fresh container, so plain CREATE TABLE is fine.
// Output is sqlplus-friendly: SET DEFINE OFF stops the '&' in "Angels & Demons"
// from being read as a substitution variable, and WHENEVER SQLERROR EXIT
// FAILURE makes a bad statement fail the piped load. Identity columns + the
// 23ai multi-row VALUES clause keep it close to the other dialects.
// ---------------------------------------------------------------------------
function emitOracle()
{
	const tmpOut = [];
	tmpOut.push('-- Bookstore Schema and Seed Data for Meadow Oracle Tests');
	tmpOut.push('-- Generated by scripts/bookstore-seed.js (GUIDs minted via fable-uuid)');
	tmpOut.push('SET DEFINE OFF');
	tmpOut.push('WHENEVER SQLERROR EXIT FAILURE');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE Book');
	tmpOut.push('    (');
	tmpOut.push('        IDBook NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,');
	tmpOut.push('        GUIDBook VARCHAR2(36) DEFAULT \'00000000-0000-0000-0000-000000000000\' NOT NULL,');
	tmpOut.push('        CreateDate TIMESTAMP,');
	tmpOut.push('        CreatingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        UpdateDate TIMESTAMP,');
	tmpOut.push('        UpdatingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        Deleted NUMBER(1) DEFAULT 0 NOT NULL,');
	tmpOut.push('        DeleteDate TIMESTAMP,');
	tmpOut.push('        DeletingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        Title VARCHAR2(200) DEFAULT \' \' NOT NULL,');
	tmpOut.push('        Type VARCHAR2(32) DEFAULT \' \' NOT NULL,');
	tmpOut.push('        Genre VARCHAR2(128) DEFAULT \' \' NOT NULL,');
	tmpOut.push('        ISBN VARCHAR2(64) DEFAULT \' \' NOT NULL,');
	tmpOut.push('        Language VARCHAR2(12) DEFAULT \' \' NOT NULL,');
	tmpOut.push('        ImageURL VARCHAR2(254) DEFAULT \' \' NOT NULL,');
	tmpOut.push('        PublicationYear NUMBER DEFAULT 0 NOT NULL');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE BookAuthorJoin');
	tmpOut.push('    (');
	tmpOut.push('        IDBookAuthorJoin NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,');
	tmpOut.push('        GUIDBookAuthorJoin VARCHAR2(36) DEFAULT \'00000000-0000-0000-0000-000000000000\' NOT NULL,');
	tmpOut.push('        IDBook NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        IDAuthor NUMBER DEFAULT 0 NOT NULL');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE Author');
	tmpOut.push('    (');
	tmpOut.push('        IDAuthor NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,');
	tmpOut.push('        GUIDAuthor VARCHAR2(36) DEFAULT \'00000000-0000-0000-0000-000000000000\' NOT NULL,');
	tmpOut.push('        CreateDate TIMESTAMP,');
	tmpOut.push('        CreatingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        UpdateDate TIMESTAMP,');
	tmpOut.push('        UpdatingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        Deleted NUMBER(1) DEFAULT 0 NOT NULL,');
	tmpOut.push('        DeleteDate TIMESTAMP,');
	tmpOut.push('        DeletingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        Name VARCHAR2(200) DEFAULT \' \' NOT NULL');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE BookPrice');
	tmpOut.push('    (');
	tmpOut.push('        IDBookPrice NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,');
	tmpOut.push('        GUIDBookPrice VARCHAR2(36) DEFAULT \'00000000-0000-0000-0000-000000000000\' NOT NULL,');
	tmpOut.push('        CreateDate TIMESTAMP,');
	tmpOut.push('        CreatingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        UpdateDate TIMESTAMP,');
	tmpOut.push('        UpdatingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        Deleted NUMBER(1) DEFAULT 0 NOT NULL,');
	tmpOut.push('        DeleteDate TIMESTAMP,');
	tmpOut.push('        DeletingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        Price NUMBER(8,2),');
	tmpOut.push('        StartDate TIMESTAMP,');
	tmpOut.push('        EndDate TIMESTAMP,');
	tmpOut.push('        Discountable NUMBER(1) DEFAULT 0 NOT NULL,');
	tmpOut.push('        CouponCode VARCHAR2(16) DEFAULT \' \' NOT NULL,');
	tmpOut.push('        IDBook NUMBER DEFAULT 0 NOT NULL');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('CREATE TABLE Review');
	tmpOut.push('    (');
	tmpOut.push('        IDReviews NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,');
	tmpOut.push('        GUIDReviews VARCHAR2(36) DEFAULT \'00000000-0000-0000-0000-000000000000\' NOT NULL,');
	tmpOut.push('        CreateDate TIMESTAMP,');
	tmpOut.push('        CreatingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        UpdateDate TIMESTAMP,');
	tmpOut.push('        UpdatingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        Deleted NUMBER(1) DEFAULT 0 NOT NULL,');
	tmpOut.push('        DeleteDate TIMESTAMP,');
	tmpOut.push('        DeletingIDUser NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        Text CLOB,');
	tmpOut.push('        Rating NUMBER DEFAULT 0 NOT NULL,');
	tmpOut.push('        IDBook NUMBER DEFAULT 0 NOT NULL');
	tmpOut.push('    );');
	tmpOut.push('');
	tmpOut.push('-- Seed Data: First 20 books from books.csv');
	tmpOut.push('-- Inserted in CSV order so IDBook matches CSV row number');
	tmpOut.push('');
	tmpOut.push('INSERT INTO Book (GUIDBook, Title, Type, Genre, ISBN, Language, ImageURL, PublicationYear, CreateDate, CreatingIDUser, UpdateDate, UpdatingIDUser) VALUES');
	const tmpBookRows = BOOKS.map((pBook) =>
	{
		return '    (' + [
			sqlQuote(tmpUUID.getUUID()),
			sqlQuote(pBook.Title),
			sqlQuote(pBook.Type),
			sqlQuote(pBook.Genre),
			sqlQuote(pBook.ISBN),
			sqlQuote(pBook.Language),
			sqlQuote(pBook.ImageURL),
			pBook.PublicationYear,
			'SYS_EXTRACT_UTC(SYSTIMESTAMP)', '99999', 'SYS_EXTRACT_UTC(SYSTIMESTAMP)', '99999'
		].join(', ') + ')';
	});
	tmpOut.push(tmpBookRows.join(',\n') + ';');
	tmpOut.push('');
	tmpOut.push('-- Seed Data: Authors for the first 20 books');
	tmpOut.push('');
	tmpOut.push('INSERT INTO Author (GUIDAuthor, Name, CreateDate, CreatingIDUser, UpdateDate, UpdatingIDUser) VALUES');
	const tmpAuthorRows = AUTHORS.map((pName) =>
	{
		return '    (' + [
			sqlQuote(tmpUUID.getUUID()),
			sqlQuote(pName),
			'SYS_EXTRACT_UTC(SYSTIMESTAMP)', '99999', 'SYS_EXTRACT_UTC(SYSTIMESTAMP)', '99999'
		].join(', ') + ')';
	});
	tmpOut.push(tmpAuthorRows.join(',\n') + ';');
	tmpOut.push('');
	tmpOut.push('COMMIT;');
	tmpOut.push('EXIT');
	tmpOut.push('');
	return tmpOut.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseDialect()
{
	const tmpArgs = process.argv.slice(2);
	let tmpDialect = null;
	for (let i = 0; i < tmpArgs.length; i++)
	{
		if (tmpArgs[i] === '--dialect' && (i + 1) < tmpArgs.length)
		{
			tmpDialect = tmpArgs[i + 1];
			break;
		}
		if (tmpArgs[i].startsWith('--dialect='))
		{
			tmpDialect = tmpArgs[i].slice('--dialect='.length);
			break;
		}
	}
	return tmpDialect;
}

const tmpDialect = parseDialect();

switch (tmpDialect)
{
	case 'mysql':
		process.stdout.write(emitMySQL());
		break;
	case 'postgresql':
		process.stdout.write(emitPostgreSQL());
		break;
	case 'mssql':
		process.stdout.write(emitMSSQL());
		break;
	case 'oracle':
		process.stdout.write(emitOracle());
		break;
	default:
		process.stderr.write('Usage: bookstore-seed.js --dialect <mysql|postgresql|mssql|oracle>\n');
		process.exit(1);
}
