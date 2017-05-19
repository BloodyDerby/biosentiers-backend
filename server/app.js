const bodyParser = require('body-parser');
const config = require('../config');
const errors = require('./lib/express-errors');
const express = require('express');
const log4js = require('log4js');
const path = require('path');

const app = express();

// Configure the view engine (used only for error pages; all other pages
// are served statically from the build directory).
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(bodyParser.json());

// Log all HTTP requests.
app.use(require('./lib/express-logger'));

// Serve API requests.
app.use('/api', require('./api'));

// Catch 404 (e.g. missing asset) and forward to the next error handler.
app.use(errors.catch404);

// Handle errors.
app.use(errors.handler);

module.exports = app;
