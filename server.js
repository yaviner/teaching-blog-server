const express = require('express'); // Import Express
const app = express(); // Instantiate Express

/*****************************************
* REGULAR (non-middleware) DEPENDENCIES  *
*****************************************/

const moment = require('moment'); // Date parsing library
const mysql = require('mysql'); // Can create connections to MySQL
// Set up database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: 3306,
    user: process.env.DB_USER,  // Environment variable. Start app like: 'DB_USER=app DB_PASS=test nodemond index.js' OR use .env
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});
const bcrypt = require('bcryptjs');
const sgMail = require('@sendgrid/mail');

/*******************************************
*   IMPORT MIDDLEWARE AND EXPRESS HELPERS  *
*******************************************/

const session = require('express-session'); // Used to create, set, and update cookies to maintain user sessions
const bodyParser = require('body-parser'); // Used to parse incoming POSTed data
const exphbs = require('express-handlebars');  // Templating engine
// Set up handlebars with a custom simple date formatting helper
const hbs = exphbs.create({
    helpers: {
        formatDate: function (date) {
            return moment(date).format('MMM DD, YYYY');
        }
    }
})

const logger = require('./middleware/logger');
const passport = require('passport'); // Authentication middleware
const LocalStrategy = require('passport-local').Strategy;
const flash = require('express-flash');

/************************
*  REGISTER MIDDLEWARE  *
*************************/

app.use(logger.log); // Log all the things
// Initialize and configure Express sessions
// These settings are OK for us
app.use(session({ 
    secret: 'ha8hWp,yoZF',  // random characters for secret
    cookie: { maxAge: 60000 }, // cookie expires after some time
    saveUninitialized: true,
    resave: true
}))
app.use(flash()); // Allow messages to be saved in req object for use in templates when rendering
app.use(bodyParser.urlencoded({ extended: false })); // Parse form submissions
app.use(bodyParser.json()); // parse application/json
app.use(express.static('public')); // Static files will use the 'public' folder as their root
app.engine('handlebars', hbs.engine); // Register the handlebars templating engine
app.set('view engine', 'handlebars'); // Set handlebars as our default template engine

/************************
*    PASSPORT CONFIG    *
*************************/
app.use(passport.initialize()); // Needed to use Passport at all
app.use(passport.session()); // Needed to allow for persistent sessions with passport

// Configure authentication using username and password
// In all callback functions that we use with passport we will expect a last argument, 'done'
// 'done' is analagous to 'next' in middleware (and of course we could name it 'next')
passport.use(new LocalStrategy({
        passReqToCallback: true // Passes req to the callback function, so we can put messages there if needed
    },
    function (req, username, password, done) {
        // Find the user based off their username
        const q = `SELECT * FROM users WHERE username = ?;`
        db.query(q, [username], function (err, results, fields) {
            if (err) return done(err);

            // User, if it exists, will be the first row returned
            // There should also only _be_ one row, provided usernames are unique in the app (and they should be!)
            const user = results[0]

            // 'done' here is looking for the following arguments: error, user, and a message or callback
            if (!user) {
                return done(null, false, req.flash('loginMessage', 'User not found')); // req.flash stores a temporary key/value
            }

            // User exists, check password against hash
            const userHash = user.hash; // Grab the hash of the user
            // Hash and compare the provided password with the stored hash.
            // This is an async function, so we have to use a callback to receive the results and continue
            bcrypt.compare(password, userHash, function(err, matches) {
                if (!matches) {
                    return done(null, false, req.flash('loginMessage', 'Incorrect username and/or password'));
                }
                // Otherwise, they match -- success! -- send passport the user (see: serializeUser)
                return done(null, user);
            });
        })
    }
))

// Tells passport what information to include in the session
// This will be run after authentication
// Just need ID for lookup later
passport.serializeUser(function(user, done) {
    done(null, user.id);
});

// Tells passport how to get user from information in session
// This will run on every request for which session data exists in a cookie.
passport.deserializeUser(function(id, done) {
    const q = `SELECT * FROM users WHERE id = ?;`
    db.query(q, [id], function (err, results, fields) {
        done(err, results[0]) // results[0] will be stored _in req.user_ for use in later middleware
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
app.get('/blog/post/:postid', function (req, res) {
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
        // If we already have a user, don't let them see the login page, just send them to the admin!
        res.redirect('/admin');
    } else {
        res.render('login', { loginMessage: req.flash('loginMessage') })
    }
});

app.post('/login', 
    // In this case, invoke the local authentication strategy.
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
// All arguments after the route path ('/admin') are middleware – we can actually have multiple defined for one route!
app.get('/admin', requireLoggedIn, function (req, res) {
    const user = req.user;
    res.render('admin', { user: user, adminMessage: req.flash.adminMessage } )
});

// Add new post
app.post('/article', requireLoggedIn, function (req, res) {
    // One style of escaping
    const title = req.body.title;
    const summary = req.body.summary;
    const fulltext = req.body.full_text;
    const image = req.body.image;
    
    const q = `INSERT INTO posts(id, title, time, summary, full_text, image, author) VALUES (null, ?, NOW(), ?, ?, ?, ?)`
    db.query(q, [title, summary, fulltext, image, req.user.id], function (err, results, fields) {
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
        return res.status(401).redirect('/login')
    }
    next();
}

// SENDGRID TEST
app.get('/mailtest', function (req, res) {
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // const msg = {
    //     to: 'yaviner@gmail.com',
    //     from: 'yaviner@teachingfoodblog.com',
    //     subject: 'Sending with SendGrid is Fun',
    //     text: 'and easy to do anywhere, even with Node.js',
    //     html: '<strong>and easy to do anywhere, even with Node.js</strong>',
    // };
    // sgMail.send(msg);
    res.send('Nope, you can\'t send email.')
})

// 404 handler
app.use(function (req, res, next) {
    res.status(404).send("Sorry can't find that!");
});

// Listen in on a port to handle requests
const listener = app.listen(process.env.PORT || 5000, function () {
    console.log(`BLOG APP listening on port ${listener.address().port}`);
});
