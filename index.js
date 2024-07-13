// Import required modules
const express = require('express');
const ejs = require('ejs');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const session = require('express-session');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

// MySQL connection setup
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'project_' // Replace with your actual database name
};

const paypal = require('paypal-rest-sdk');

paypal.configure({
  mode: 'sandbox', // 'sandbox' or 'live'
  client_id: 'ARg05Rga5pE2nt8Mevz1uhB7Iy6IAQ5mavDsfm35hW1N1bAqKTU1n_06kL0S-H59JQ52lePPU1cvej7j', // Use environment variables
  client_secret: 'EIZY6JxNtSLKOPFkcSGi68X2SuQlTbPPAIWglhyUYc01GY8K4OoAt8UXRFv2rCT0SeNzJl0oACCrr147' // Use environment variables
});

const connection = mysql.createConnection(dbConfig);

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    throw err; // Handle connection error gracefully
  }
  console.log('Connected to MySQL database');
});

// Express setup
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'secret', resave: true, saveUninitialized: true }));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper functions
function isProductInCart(cart, id) {
  return cart.some(item => item.id === id);
}

function calculateTotal(cart, req) {
  let total = 0;
  cart.forEach(item => {
    total += (item.sale_price ? item.sale_price : item.price) * item.quantity;
  });
  req.session.total = total || 0;
  return total;
}

// Routes
app.get('/', (req, res) => {
  connection.query('SELECT * FROM products', (err, result) => {
    if (err) {
      console.error('Error retrieving products:', err);
      res.status(500).send('Internal Server Error');
    } else {
      res.render('pages/index', { result });
    }
  });
});

app.post('/add_to_cart', (req, res) => {
  const { id, name, price, sale_price, quantity, image } = req.body;
  const product = { id, name, price, sale_price, quantity, image };

  if (req.session.cart) {
    if (!isProductInCart(req.session.cart, id)) {
      req.session.cart.push(product);
    }
  } else {
    req.session.cart = [product];
  }

  calculateTotal(req.session.cart, req);
  res.redirect('/cart');
});

app.get('/cart', (req, res) => {
  const { cart, total } = req.session;
  res.render('pages/cart', { cart, total });
});

app.post('/remove_product', (req, res) => {
  const { id } = req.body;
  req.session.cart = req.session.cart.filter(item => item.id !== id);
  calculateTotal(req.session.cart, req);
  res.redirect('/cart');
});

app.post('/edit_product_quantity', (req, res) => {
  const { id, increase_product_quantity, decrease_product_quantity } = req.body;

  // Initialize cart if it's undefined
  req.session.cart = req.session.cart || [];

  let { cart } = req.session;

  if (increase_product_quantity) {
    cart = cart.map(item => {
      if (item.id === id) {
        item.quantity++;
      }
      return item;
    });
  }

  if (decrease_product_quantity) {
    cart = cart.map(item => {
      if (item.id === id && item.quantity > 1) {
        item.quantity--;
      }
      return item;
    });
  }

  req.session.cart = cart;
  calculateTotal(cart, req);
  res.redirect('/cart');
});

app.post('/place_order', (req, res) => {
  const { name, email, phone, city, address } = req.body;
  const { cart, total } = req.session;
  const status = 'not paid';
  const date = new Date();

  // Ensure total is defined and has a valid value
  if (typeof total !== 'number' || isNaN(total)) {
    console.error('Invalid or missing total value:', total);
    return res.status(400).send('Invalid total value');
  }

  const order = {
    cost: total,
    name,
    email,
    status,
    city,
    address,
    phone,
    date,
  };

  connection.query('INSERT INTO orders SET ?', order, (err, result) => {
    if (err) {
      console.error('Error placing order:', err);
      return res.status(500).send('Internal Server Error');
    } else {
      const order_id = result.insertId;

      const orderItems = cart.map(item => [
        order_id,
        item.id,
        item.name,
        item.price,
        item.image,
        item.quantity,
        new Date()
      ]);

      connection.query('INSERT INTO order_items (order_id, product_ids, product_name, product_price, product_image, product_quantity, order_date) VALUES ?', [orderItems], (err, result) => {
        if (err) {
          console.error('Error inserting order items:', err);
          return res.status(500).send('Internal Server Error');
        } else {
          
          req.session.order_id = order_id; // Save order ID in session
          return res.redirect('/payment');
        }
      });
    }
  });
});

app.get('/checkout', (req, res) => {
  const { total } = req.session;
  res.render('pages/checkout', { total });
});

app.get('/payment', (req, res) => {
  const { total } = req.session;
  res.render('pages/payment', { total });
});

app.get('/thank_you', (req, res) => {
  const { order_id } = req.session;
  res.render('pages/thank_you', { order_id });
});

app.get('/single_product', (req, res) => {
  const { id } = req.query;
  connection.query('SELECT * FROM products WHERE id = ?', id, (err, result) => {
    if (err) {
      console.error('Error retrieving product details:', err);
      res.status(500).send('Internal Server Error');
    } else {
      res.render('pages/single_product', { result });
    }
  });
});

app.get('/products', (req, res) => {
  connection.query('SELECT * FROM products', (err, result) => {
    if (err) {
      console.error('Error retrieving products:', err);
      res.status(500).send('Internal Server Error');
    } else {
      res.render('pages/products', { result });
    }
  });
});

app.get('/about', (req, res) => {
  res.render('pages/about');
});

app.get('/readmore', (req, res) => {
  res.render('pages/readmore');
});

// PayPal Integration
const base = 'https://api-m.sandbox.paypal.com';

app.get('/create-order', (req, res) => {
  // Generate access token
  generateAccessToken((err, accessToken) => {
    if (err) {
      console.error('Failed to generate access token:', err);
      return res.status(500).json({ error: 'Failed to generate access token' });
    }

    // Create order using PayPal SDK
    createOrder(accessToken, (err, order) => {
      if (err) {
        console.error('Failed to create order:', err);
        return res.status(500).json({ error: 'Failed to create order' });
      }

      // Send the order details as JSON response
      res.json(order);
    });
  });
});

// Function to generate access token
function generateAccessToken(callback) {
  paypal.generateToken(function (error, token) {
    if (error) {
      console.error('Failed to generate access token:', error);
      callback(error);
    } else {
      callback(null, token);
    }
  });
}

// Function to create order
function createOrder(accessToken, callback) {
  // Example order creation parameters (modify as needed)
  const orderParams = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: '100.00' // Example amount
        }
      }
    ]
  };

  paypal.order.create(orderParams, { auth: accessToken }, function (error, order) {
    if (error) {
      console.error('Failed to create order:', error);
      callback(error);
    } else {
      callback(null, order);
    }
  });
}

// Server listening
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
