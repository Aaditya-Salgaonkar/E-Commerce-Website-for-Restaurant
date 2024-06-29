var express = require('express')
var ejs = require('ejs')
var bodyParser=require('body-parser');


var app = express();

app.use(express.static('public')); //to use public folder
app.set('view engine','ejs'); //tells express to set view engine to ejs

app.listen(8080);
app.use(bodyParser.urlencoded({extended:true}));

// localhost:8080
app.get('/', function (req, res) {
    res.render('pages/index');            //dont write extension
});