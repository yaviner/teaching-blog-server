const express = require('express'); // Import Express
const app = express(); // Instantiate Express

/************************
* REGULAR DEPENDENCIES  *
*************************/

const moment = require('moment');
const mysql = require('mysql');
// Set up database connection
const db = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: process.env.DB_USER,  // Environment variable. Start app like: 'DB_USER=app DB_PASS=test nodemond index.js'
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

/************************
*   IMPORT MIDDLEWARE   *
*************************/

const session = require('express-session');
const bodyParser = require('body-parser');
const exphbs = require('express-handlebars'); 
// Set up handlebars with a simple date formatting helper
const hbs = exphbs.create({
    helpers: {
        formatDate: function (date) {
            return moment(date).format('MMM DD, YYYY');
        }
    }
})

const logger = require('./middleware/logger');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const flash = require('express-flash');

/************************
*  REGISTER MIDDLEWARE  *
*************************/

app.use(logger.log); // Log all the things
app.use(session({ 
    secret: 'ha8hWp,yoZF',  // random characters for secret
    cookie: { maxAge: 60000 }, // cookie expires after some time
    saveUninitialized: true,
    resave: true
}))
app.use(flash());
app.use(bodyParser.urlencoded({ extended: false })); // Parse form submissions
app.use(bodyParser.json()); // parse application/json
app.use(express.static('public')); 
app.engine('handlebars', hbs.engine); // Register the handlebars templating engine
app.set('view engine', 'handlebars'); // Set handlebars as our default template engine

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({
        passReqToCallback: true
    },
    function (req, username, password, done) {
        const q = `SELECT * FROM users WHERE username = ? AND password = ?;`
        db.query(q, [username, password], function (err, results, fields) {
            console.log(results);
            if (err) {
                return done(err);
            }
            const user = results[0];
            if (!user) {
                return done(null, false, req.flash('loginMessage', 'Incorrect username and/or password'));
            }
            return done(null, user);
        })
    }
))

passport.serializeUser(function(user, done) {
    done(null, user.id);
});

passport.deserializeUser(function(id, done) {
    const q = `SELECT * FROM users WHERE id = ?;`
    db.query(q, [id], function (err, results, fields) {
        done(err, results[0])
    });
})


/************************
*        ROUTES         *
*************************/

// Homepage
app.get('/', function (req, res) {
    const q = `SELECT * FROM posts`;
    db.query(q, function (err, results, fields) {
        if (err) {
            console.error(err);
        }
        const templateData = {
            articles: results
        };

        res.render('homepage', templateData);
    });
    
});

// Individual blog post
app.get('/blog/:postid', function (req, res) {
    const postId = req.params.postid;
    const q = `SELECT * FROM posts WHERE id = ?`; // Fill in the blanks style escaping
    db.query(q, [postId], function (err, results, fields) {
        if (err) {
            console.error(err);
        }
        const templateData = {
            article: results[0]
        }
        res.render('singlePost', templateData);
    });
});

//
// ACCOUNT MANAGEMENT
//

app.get('/login', function (req, res) {
    const user = req.user;
    if (user) {
        res.redirect('/admin');
    } else {
        res.render('login', { loginMessage: req.flash('loginMessage') })
    }
});

app.post('/login', 
    passport.authenticate('local', {
        successRedirect: '/admin',
        failureRedirect: '/login',
        failureFlash: true
    })
);

app.get('/register', function (req, res) {
    const user = req.user;
    if (user) {
        res.redirect('/admin');
    } else {
        res.render('register');
    }
});

app.post('/register', function (req, res) {
    res.send('Registration Flow. TODO');
});

app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});

//
// Logged In Functionality
//

app.get('/admin', function (req, res) {
    const user = req.user;
    console.log('admin', user);
    if (!user) {
        res.redirect('/login');
    } else {
        res.send('ADMIN PAGE. TODO');
    }
});

// Add new post
app.post('/article', function (req, res) {
    // One style of escaping
    const title = mysql.escape(req.body.title);
    const summary = mysql.escape(req.body.summary);
    const fulltext = mysql.escape(req.body.fulltext);
    const image = mysql.escape(req.body.image);
    
    const q = `INSERT INTO posts VALUES (null, ${title}, ${summary}, ${fulltext}, ${image}, NOW())`
    db.query(q, function (err, results, fields) {
        if (err) {
            console.error(err);
            res.status(500).send('Failed. Oops.');
        } else {
            res.send('Success!');
        }
    })
});

// 404 handler
app.use(function (req, res, next) {
    res.status(404).send("Sorry can't find that!");
});

// Listen in on a port to handle requests
const listener = app.listen(process.env.PORT || 5000, function () {
    console.log(`BLOG APP listening on port ${listener.address().port}`);
});
