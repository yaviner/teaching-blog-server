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
const bcrypt = require('bcryptjs');

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
app.use(flash()); // Allow messages to be saved in req object for use in templates when rendering
app.use(bodyParser.urlencoded({ extended: false })); // Parse form submissions
app.use(bodyParser.json()); // parse application/json
app.use(express.static('public')); 
app.engine('handlebars', hbs.engine); // Register the handlebars templating engine
app.set('view engine', 'handlebars'); // Set handlebars as our default template engine

/************************
*    PASSPORT CONFIG    *
*************************/
app.use(passport.initialize());
app.use(passport.session());

// Authentication using username and password
passport.use(new LocalStrategy({
        passReqToCallback: true // Passes req to the function, so we can put messages there if needed
    },
    function (req, username, password, done) {
        const q = `SELECT * FROM users WHERE username = ?;`
        db.query(q, [username], function (err, results, fields) {
            if (err) return done(err);

            // User, if it exists, will be the first row returned
            // There should also only _be_ one row
            const user = results[0];
            if (!user) {
                return done(null, false, req.flash('loginMessage', 'User not found'));
            }

            // User exists, check password against hash
            const userHash = user.hash;
            bcrypt.compare(password, userHash, function(err, matches) {
                if (!matches) {
                    return done(null, false, req.flash('loginMessage', 'Incorrect username and/or password'));
                }
                // Otherwise, they match, send back the user
                return done(null, user);
            });
        })
    }
))

// Tells passport what information to include in the session
// Just need ID for lookup later
passport.serializeUser(function(user, done) {
    done(null, user.id);
});

// Tells passport how to get user from information in session
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
        res.render('register', { registerMessage: req.flash('registerMessage') })
    }
});

app.post('/register', function (req, res) {
    const username = req.body.username;
    const pass = req.body.password;
    if (!username || !pass) {
        req.flash('registerMessage', 'Username and password are required.')
        return res.redirect('/register');
    }
    // Check if user exists, first
    const checkExists = `SELECT * FROM users WHERE username = ?`
    db.query(checkExists, [username], function (err, results, fields) {
        if (err) {
            console.error(err);
            return res.status(500).send('Something bad happened...'); // Important: Don't execute other code
        }
        if (results[0]) {
            req.flash('registerMessage', 'That username is already taken.');
            return res.redirect('/register');
        }
        // Otherwise, user doesn't exist yet, let's create them!
        
        // Generate salt and pass for the user
        bcrypt.genSalt(10, function (err, salt) {
            if (err) throw err;
            bcrypt.hash(pass, salt, function (err, hash) {
                if (err) throw err;
                // Add user to database with username and hash
                const q = `INSERT INTO users(id, username, hash) VALUES (null, ?, ?)`;
                db.query(q, [username, hash], function (err, results, fields) {
                    if (err) console.error(err);
                    console.log(results);
                    req.flash('registerMessage', 'Account created successfully.');
                    res.redirect('/register');
                })
            })
        });
    })
});

app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});

//
// Logged In Functionality
//

app.get('/admin', requireLoggedIn, function (req, res) {
    const user = req.user;
    res.render('admin', { user: user, adminMessage: req.flash.adminMessage } )
});

// Add new post
app.post('/article', requireLoggedIn, function (req, res) {
    // One style of escaping
    const title = req.body.title;
    const summary = req.body.summary;
    const fulltext = req.body.fulltext;
    const image = req.body.image;
    
    const q = `INSERT INTO posts VALUES (null, ?, ?, ?, ?, NOW())`
    db.query(q, [title, summary, fulltext, image], function (err, results, fields) {
        if (err) {
            console.error(err);
            return res.status(500).send('Failed. Oops.');
        } else {
            req.flash('adminMessage', 'Post added successfully!');
            return res.redirect('/admin');
        }
    })
});

function requireLoggedIn(req, res, next) {
    const user = req.user;
    if (!user) {
        return res.status(401).send('Not authorized.')
    }
    next();
}

// 404 handler
app.use(function (req, res, next) {
    res.status(404).send("Sorry can't find that!");
});

// Listen in on a port to handle requests
const listener = app.listen(process.env.PORT || 5000, function () {
    console.log(`BLOG APP listening on port ${listener.address().port}`);
});
