const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv").config();

app.use(express.json());

const port = 4000;
const whitelist = [
  "https://orvela-ecommerce.onrender.com",
  "http://localhost:4000",
  "http://localhost:3500",
  "http://localhost:3000",
];

// Set up CORS options
const corsOptions = {
  origin: (origin, callback) => {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: "GET,POST,PUT,DELETE",
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Allow credentials (cookies, authorization headers, etc.) to be sent
};

app.use(cors(corsOptions));

// Database connection with mongoDB
let MONGODB_URL = process.env.DATABASE_URL;
mongoose.connect(MONGODB_URL);

// API Creation
app.get("/", (req, res) => {
  res.send("express app is running");
});

// image storage

const storage = multer.diskStorage({
  destination: "./upload/images",
  filename: (req, file, cb) => {
    return cb(
      null,
      `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`
    );
  },
});

const upload = multer({ storage: storage });

// creating upload endpoint for images

app.use("/images", express.static("upload/images"));

app.post("/upload", upload.single("product"), (req, res) => {
  res.json({
    success: 1,
    image_url:
      `https://orvela-ecommerce-api.onrender.com/images/${req.file.filename}` ||
      `http://localhost:${port}/images/${req.file.filename}`,
  });
});

// Schema for creating products

const Product = mongoose.model("Product", {
  id: {
    type: Number,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    reqired: true,
  },
  new_price: {
    type: Number,
    required: true,
  },
  old_price: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  available: {
    type: Boolean,
    default: true,
  },
});

//// API FOR ADDING A PRODUCT
app.post("/addproduct", async (req, res) => {
  let products = await Product.find({});
  let id;
  if (products.length > 0) {
    let last_product_array = products.slice(-1);
    let last_product = last_product_array[0];
    id = last_product.id + 1;
  } else {
    id = 1;
  }
  const product = new Product({
    id: id,
    name: req.body.name,
    image: req.body.image,
    category: req.body.category,
    new_price: req.body.new_price,
    old_price: req.body.old_price,
  });
  await product.save();
  res.json({
    success: true,
    name: req.body.name,
  });
});

/// API FOR DELETING PRODUCTS
app.post("/removeproduct", async (req, res) => {
  await Product.findOneAndDelete({ id: req.body.id });
  res.json({
    success: true,
    name: req.body.name,
  });
});

/// API for getting all products

app.get("/allproducts", async (req, res) => {
  let products = await Product.find({});
  res.send(products);
});

// USER SCHEMA
const Users = mongoose.model("User", {
  username: {
    type: String,
  },
  email: {
    type: String,
    unique: true,
  },
  password: {
    type: String,
  },
  cartData: {
    type: Object,
  },
  date: {
    type: Date,
    default: Date.now(),
  },
});

// Creating Endpoint for user registration
app.post("/signup", async (req, res) => {
  let check = await Users.findOne({ email: req.body.email });
  if (check) {
    return res
      .status(400)
      .json({ success: false, error: "Email already in use" });
  }
  let cart = {};
  for (let i = 0; i < 300; i++) {
    cart[i] = 0;
  }
  const user = new Users({
    username: req.body.username,
    email: req.body.email,
    password: req.body.password,
    cartData: cart,
  });
  await user.save();
  const data = {
    user: {
      id: user.id,
    },
  };
  const token = jwt.sign(data, "secret_ecom");
  res.json({ success: true, token });
});

// Endpoint for user login
app.post("/login", async (req, res) => {
  let user = await Users.findOne({ email: req.body.email });
  if (user) {
    const passCompare = req.body.password === user.password;
    if (passCompare) {
      const data = {
        user: {
          id: user.id,
        },
      };
      const token = jwt.sign(data, "secret_ecom");
      res.json({ success: true, token });
    } else {
      res.json({ success: false, error: "Wrong password" });
    }
  } else {
    res.json({ success: false, error: "User email doesn't exists" });
  }
});

// creating api for new collection
app.get("/newcollections", async (req, res) => {
  let products = await Product.find({});
  let newcollection = products.slice(1).slice(-8);
  res.send(newcollection);
});

// api for womens popular section
app.get("/popularinwomen", async (req, res) => {
  let products = await Product.find({ category: "women" });
  let popular_in_women = products.slice(0, 4);
  res.send(popular_in_women);
});

// middleware for user cart
const fetchUser = async (req, res, next) => {
  const token = req.header("auth-token");
  if (!token) {
    return res.status(401).send("Access denied");
  } else {
    try {
      const data = jwt.verify(token, "secret_ecom");
      req.user = data.user;
      next();
    } catch (error) {
      res.status(401).send({ error: "please authenticate properly" });
    }
  }
};
// API for cart
app.post("/addtocart", fetchUser, async (req, res) => {
  try {
    // Log the incoming request body and user data for debugging
    /* console.log("Request body:", req.body);
    console.log("Authenticated user:", req.user); */

    // Ensure itemId is present in the request body
    if (!req.body.itemId) {
      return res.status(400).send({ error: "Item ID is required" });
    }

    // Fetch user data from the database
    let userData = await Users.findOne({ _id: req.user.id });

    if (!userData) {
      return res.status(404).send({ error: "User not found" });
    }

    // Ensure cartData is initialized
    if (!userData.cartData) {
      userData.cartData = {};
    }

    // Increment the item count in the cartData
    const itemId = req.body.itemId;
    if (!userData.cartData[itemId]) {
      userData.cartData[itemId] = 0; // Initialize if not present
    }
    userData.cartData[itemId] += 1;

    // Update the user data in the database
    await Users.findOneAndUpdate(
      { _id: req.user.id },
      { cartData: userData.cartData }
    );

    // Send success response
    res.send({ success: "item added successfully" });
  } catch (error) {
    // Log the error for debugging
    console.error("Error in /addtocart:", error);

    // Send error response
    res.status(500).send({ error: "An error occurred while adding to cart" });
  }
});

// creating API for removing item from cart
app.post("/removefromcart", fetchUser, async (req, res) => {
  let userData = await Users.findOne({ _id: req.user.id });
  if (userData.cartData[req.body.itemId] > 0) {
    userData.cartData[req.body.itemId] -= 1;
    await Users.findByIdAndUpdate(
      { _id: req.user.id },
      { cartData: userData.cartData }
    );
    res.send({ success: "item removed successfully" });
  }
});

// loading cart data
app.post("/getcart", fetchUser, async (req, res) => {
  let userData = await Users.findOne({ _id: req.user.id });
  res.json(userData.cartData);
});

///errors

app.listen(port, (error) => {
  if (!error) {
    console.log("Server running on port " + port);
  } else {
    console.log("Error: " + error);
  }
});
