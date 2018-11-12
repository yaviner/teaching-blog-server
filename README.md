# Blog Server
Barebones example blog with authentication, backed by a MySQL database.

## Prerequisites
You must have a MySQL database available to connect to. It should have the following tables, at minimum:

### users
| id  | username | hash    |
| --- | -------- | ------- |

### posts
| id  | title | summary | full_text | image | date |
| --- | ----- | ------- | -------- | ----- | ---- |

## Installing
`npm install`

## Running
You need to pass appropriate environment variables in order for the database connection to be made. Example:
`DB_USER=myuser DB_PASSWORD=mypass DB_NAME=blog nodemon index.js`
