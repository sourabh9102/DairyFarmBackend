const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db = require("../config/db");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: "../config/config.env" });
const { User } = require("../models/User");
const { Subscription } = require("../models/Subscription");
const { Contact } = require("../models/Contact");
const { Support } = require("../models/Support");
const { Category } = require("../models/Category");
const { Product } = require("../models/Product");
const { Cart } = require("../models/Cart");
const { Op, where } = require("sequelize");
const Address = require("../models/Address");
const { ProductImages } = require("../models/ProductImages");
const Order = require("../models/Order");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    return cb(null, "../public/images");
  },
  filename: function (req, file, cb) {
    return cb(null, `${Date.now()}_${file.originalname}`);
  },
});
const upload = multer({ storage: storage });

router.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const [users, created] = await User.findOrCreate({
      where: {
        email: req.body.email,
      },
      defaults: {
        password: hashedPassword,
        fname: req.body.fname,
        phone: req.body.phone,
      },
    });

    if (!created) {
      return res.status(400).json({
        success: false,
        message: "Email/Phone number already registered.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User registered successfully.",
      data: users.toJSON(),
    });
  } catch (error) {
    console.error("Error during registration:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error during registration." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({
      where: {
        email: req.body.email,
      },
    });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    bcrypt.compare(
      req.body.password,
      user.password,
      async (bcryptErr, bcryptRes) => {
        if (bcryptErr) {
          console.log(
            "An error occurred during password comparison:",
            bcryptErr
          );
          return res
            .status(500)
            .json({ success: false, message: "Error comparing passwords." });
        }

        if (bcryptRes) {
          req.session.fname = user.fname;
          const name = user.name;
          const temp_token = jwt.sign({ name }, process.env.JWT_SECRET_KEY, {
            expiresIn: "1d",
          });
          res.cookie("temp_token", temp_token);

          try {
            await User.update(
              { temp_token },
              {
                where: {
                  email: req.body.email,
                },
              }
            );

            const otp = generateOTP();
            await User.update(
              { otp },
              {
                where: {
                  email: req.body.email,
                },
              }
            );

            sendOTPByEmail(req.body.email, otp);

            return res.json({ Login: true, temp_token, data: user });
          } catch (updateErr) {
            console.error(
              "Error updating token and OTP in the database:",
              updateErr
            );
            return res
              .status(500)
              .send("Couldn't update token and OTP in the database.");
          }
        } else {
          return res.status(401).json({ Login: false });
        }
      }
    );
  } catch (error) {
    console.log("An error occurred:", error);
    return res
      .status(500)
      .json({ success: false, message: "An error occurred." });
  }
});

function generateOTP() {
  let digits = "0123456789";
  let limit = 4;
  let otp = "";

  for (let i = 0; i < limit; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }

  return otp;
}
async function sendOTPByEmail(email, otp) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const options = {
    from: "tech.bht@gmail.com",
    to: email,
    subject: "Email account verify",
    html: `<p>Enter the OTP: ${otp} to verify your email account</p>`,
  };

  try {
    await transporter.sendMail(options);
  } catch (error) {
    console.log(error);
    throw new Error("Couldn't send OTP email.");
  }
}

router.post("/subscribe", async (req, res) => {
  try {
    const { subscribeEmail } = req.body;

    const newSubscription = await Subscription.create(
      { subscribeEmail },
      { fields: ["subscribeEmail"] }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error inserting email into the database:", error);
    return res.status(500).json({
      success: false,
      message: "Error inserting email into the database.",
    });
  }
});

router.post("/productOverview", async (req, res) => {
  try {
    const productId = req.body.id;
    console.log("productId backend:", productId);

    const products = await Product.findAll({
      where: {
        id: productId,
      },
    });

    console.log("products", products);

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Error fetching product data:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching product data." });
  }
});

router.post("/filter", async (req, res) => {
  try {
    const categoryId = req.body.category_id;
    console.log("Request Body:", req.body);
    console.log("categoryId backend:", categoryId);

    if (!categoryId) {
      return res
        .status(400)
        .json({ success: false, message: "categoryId is required." });
    }

    const products = await Product.findAll({
      where: { category_id: categoryId },
    });

    console.log("products", products);

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Error fetching product data:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching product data." });
  }
});

router.post("/filterByType", async (req, res) => {
  try {
    const productType = req.body.type;
    console.log("productType backend", productType);

    const filteredProductType = await Product.findAll({
      where: {
        type: productType,
      },
    });
    console.log("filtered product type:", productType);

    res.status(200).json({ success: true, filteredProductType });
  } catch (error) {
    console.error("Error fetching product data:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching product data." });
  }
});

router.post("/sort", async (req, res) => {
  try {
    const sortProduct = req.body.sort;
    const filteredProductsToSort = req.body.filteredProducts;

    let order;
    if (sortProduct === "rating") {
      order = [["rating", "DESC"]];
    } else if (sortProduct === "priceAsc") {
      order = [["price", "ASC"]];
    } else if (sortProduct === "priceDesc") {
      order = [["price", "DESC"]];
    }

    const sortedProducts = await Product.findAll({
      where: {
        id: {
          [Op.in]: filteredProductsToSort.map((product) => product.id),
        },
      },
      order: order,
    });

    res.status(200).json({ success: true, sortedProducts });
  } catch (error) {
    console.error("Error fetching product data:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching product data." });
  }
});

router.post("/profilePicUpload", upload.single("file"), async (req, res) => {
  try {
    console.log("req.body", req.body);
    console.log("req.file", req.file);
    const userId = req.body.userId;
    const profileImage = req.file.filename;

    const imageUrl = `/${profileImage}`;

    console.log("profileImage", profileImage);
    console.log("imageUrl", imageUrl);

    await User.update({ profileImage: imageUrl }, { where: { id: userId } });

    console.log("Profile image uploaded for user with ID:", userId);
    return res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully.",
      profileImage: imageUrl,
    });
  } catch (error) {
    console.error("Error updating user profile photo:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error updating user profile photo." });
  }
});

router.post("/updateProfile", async (req, res) => {
  try {
    console.log("req.body.token", req.body.token);
    console.log("req.body", req.body);
    const token = req.body.token;
    const { email, fname, uname, address } = req.body;
    console.log("Update user: email =", email, ", fname =", fname);
    console.log("user ki all detail", req.body.user);

    console.log("Received token:", req.body.token);

    const [updateCount, updatedUsers] = await User.update(
      {
        fname,
        uname,
        email,
        address,
      },
      { where: { token: req.body.token } }
    );

    if (updateCount > 0) {
      console.log(
        `User profile updated successfully. ${updateCount} row(s) affected.`
      );
      res.status(200).json({
        success: true,
        message: "User profile updated successfully.",
        updateCount,
      });
    } else {
      console.log(
        `User not found or no changes were made. ${updateCount} row(s) affected.`
      );
      res.status(404).json({
        success: false,
        message: "User not found or no changes were made.",
        updateCount,
      });
    }
  } catch (error) {
    console.error("Error updating user profile:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error updating user profile." });
  }
});

router.post("/cart", async (req, res) => {
  try {
    const { cartItems, userId } = req.body;
    console.log("Cart Items cart ke try me:", cartItems);
    console.log("req.body cart ke try me:", req.body);

    if (cartItems && cartItems.length > 0) {
      const formattedCartItems = cartItems.map((item) => ({
        cart_id: null,
        user_id: userId,
        quantity: item.quantity,
        product_id: item.id,
      }));

      await Cart.bulkCreate(formattedCartItems, {
        fields: ["cart_id", "user_id", "quantity", "product_id"],
      });

      console.log("Cart Items formattedCartItems:", formattedCartItems);

      res.status(200).json({
        success: true,
        message: "Cart items transferred successfully.",
      });
    } else {
      res.status(200).json({
        success: true,
        message: "Cart is empty. No items transferred.",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

router.get("/productImages/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId, 10);
    console.log("productId backend ke andar", productId);

    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID provided.",
      });
    }

    const productImages = await ProductImages.findAll({
      where: {
        product_Id: productId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Product images fetched successfully.",
      images: productImages,
    });
  } catch (error) {
    console.error("Error fetching product images:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching product images." });
  }
});

// router.post("/orderSummary", async (req, res) => {
//   try {
//     const { trackingId } = req.body;
//     console.log("Tracking ID:", trackingId);

//     const orderData = await Order.findOne({
//       where: {
//         trackingId: trackingId,
//       },
//     });

//     if (!orderData) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found for the provided tracking ID",
//       });
//     }

//     const productId = orderData.productId;

//     const productData = await Product.findByPk(productId);

//     if (!productData) {
//       return res.status(404).json({
//         success: false,
//         message: "Product not found for the retrieved product ID",
//       });
//     }

//     console.log("orderData", orderData);
//     console.log("productData", productData);

//     return res.status(200).json({
//       success: true,
//       orderData: orderData,
//       productData: productData,
//     });
//   } catch (error) {
//     console.error("Error creating order summary:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error creating order summary",
//       error: error.message,
//     });
//   }
// });

router.post("/orderHistory", async (req, res) => {
  try {
    const userId = req.body.userId;
    console.log("userId backend me", userId);
    const orderHistory = await Order.findAll({
      where: {
        userId,
      },
      include: [
        {
          model: Product,
          attributes: ["id", "name", "imageSrc", "price"],
        },
      ],
    });

    console.log("orderHistory backend me", orderHistory);

    if (!orderHistory || orderHistory.length == 0) {
      return res.status(404).json({
        success: false,
        message: "Order history not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order history fetched successfully",
      orderHistory,
    });
  } catch (error) {
    console.error("Error fetching order history:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching order history",
      error: error.message,
    });
  }
});

router.post("/order", async (req, res) => {
  try {
    const orders = req.body.orderData;

    let totalSubtotal = 0;
    let totalTax = 0;
    let totalShippingCost = 0;
    let totalTotal = 0;

    const orderDetailsArray = [];
    const billedAddressArray = [];
    const productDataArray = [];

    const trackingId = Math.floor(1000 + Math.random() * 9000);

    for (const orderData of orders) {
      const {
        id,
        userId,
        billingAddress: { address, fname, lname, email },
        paymentMethod,
        quantity,
      } = orderData;

      const billedAddress = {
        fname,
        lname,
        email,
        address,
      };

      const productData = await Product.findByPk(id);
      console.log("productData backend me", productData);

      const subtotal = productData.price * quantity;
      const tax = 0;
      const shippingCost = 0;
      const total = subtotal + tax + shippingCost;

      totalSubtotal += subtotal;
      totalTax += tax;
      totalShippingCost += shippingCost;
      totalTotal += total;

      const order = await Order.create({
        userId,
        dateTime: new Date(),
        subtotal,
        tax,
        shippingCost,
        total,
        paymentMethod,
        status: "Placed",
        billingAddress: address,
        id,
        trackingId,
        quantity,
      });

      orderDetailsArray.push(order);
      billedAddressArray.push(billedAddress);
      productDataArray.push(productData);
    }

    return res.status(200).json({
      success: true,
      message: "Orders created successfully",
      orders: orderDetailsArray,
      billedAddresses: billedAddressArray,
      productData: productDataArray,
      sums: {
        totalSubtotal,
        totalTax,
        totalShippingCost,
        totalTotal,
      },
    });
  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating order",
      error: error.message,
    });
  }
});

router.post("/showAddress", async (req, res) => {
  try {
    const { userId } = req.body;
    const userAddress = await Address.findAll({
      where: {
        user_id: userId,
      },
    });
    return res.status(200).json({
      success: true,
      message: "Data fetched successfully.",
      data: userAddress,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user data",
      error: error.message,
    });
  }
});

router.post("/address", async (req, res) => {
  try {
    const { userId, formData } = req.body;
    console.log("user id address ka", userId);
    const { fname, lname, email, address } = formData;

    console.log("req.body address ka", req.body);

    const newAddress = await Address.create(
      { fname, lname, email, address, user_id: userId },
      { fields: [`fname`, `lname`, `email`, `address`, `user_id`] }
    );

    console.log("newAddress address ka", newAddress);

    return res.status(200).json({
      success: true,
      message: "Data inserted successfully.",
      data: newAddress,
    });
  } catch (error) {
    console.error("Error inserting user data:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error. Please check your data.",
      });
    }

    return res
      .status(500)
      .json({ success: false, message: "Error inserting user data." });
  }
});

router.post("/contact", async (req, res) => {
  try {
    const { fname, lname, email, message } = req.body;

    const newContact = await Contact.create(
      { fname, lname, email, message },
      { fields: ["fname", "lname", "email", "message"] }
    );

    return res.status(200).json({
      success: true,
      message: "Data inserted successfully.",
      data: newContact,
    });
  } catch (error) {
    console.error("Error inserting user data:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error inserting user data." });
  }
});

router.post("/support", async (req, res) => {
  try {
    const { fname, lname, email, phone, subject, message } = req.body;

    const newSupport = await Support.create(
      { fname, lname, email, phone, subject, message },
      { fields: ["fname", "lname", "email", "phone", "subject", "message"] }
    );

    return res.status(200).json({
      success: true,
      message: "Data inserted successfully.",
      data: newSupport,
    });
  } catch (error) {
    console.error("Error inserting user data:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error inserting user data." });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    console.log("enteredOtp:", enteredOtp);
    const temp_token = req.cookies.temp_token;

    const user = await User.findOne({
      where: { temp_token },
    });

    console.log("user ki detail:", user);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const storedOtp = user.otp;
    console.log("storedOtp:", storedOtp);

    if (storedOtp !== undefined) {
      if (storedOtp == enteredOtp) {
        const token = jwt.sign(
          { userId: user.id },
          process.env.JWT_SECRET_KEY,
          { expiresIn: 300 }
        );
        res.cookie("token", token);

        await user.update({ token, temp_token: null });

        res.clearCookie("temp_token");
        console.log("token in backend verify:", token);

        console.log("user response ka:", user);

        const cartItems = await Cart.findAll({
          where: {
            user_id: user.id,
          },
        });

        console.log("cartItems verify findall ka:", cartItems);

        if (!cartItems || cartItems.length === 0) {
          return res.status(200).json({
            success: true,
            message: "Token successfully stored in the database.",
            token,
            data: user,
            cartItems: [],
            productDetails: [],
          });
        }

        const productIds = cartItems.map((cartItem) => cartItem.product_id);
        const productDetails = await Product.findAll({
          where: {
            id: productIds,
          },
        });

        console.log("productDetails verify ka", productDetails);

        return res.status(200).json({
          success: true,
          message: "Token successfully stored in the database.",
          token,
          data: user,
          cartItems,
          productDetails,
        });
      } else {
        return res
          .status(401)
          .json({ success: false, message: "Invalid OTP." });
      }
    } else {
      console.log("No OTP found.");
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
  } catch (error) {
    console.error("Error during OTP verification:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error during OTP verification." });
  }
});

router.post("/verifyEmail", async (req, res) => {
  try {
    const enteredEmail = req.body.email;
    console.log("enteredEmail:", enteredEmail);

    const user = await User.findOne({
      where: { email: enteredEmail },
    });

    console.log("user ki detail:", user);

    if (!user) {
      console.log("Email not found");
      return res.status(400).json({ error: "Email not found" });
    }

    const email = user.email;

    console.log("user ka email:", email);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    let digits = "0123456789";
    let limit = 4;
    let otp = "";

    for (let i = 0; i < limit; i++) {
      otp += digits[Math.floor(Math.random() * 10)];
    }

    const options = {
      from: "tech.bht@gmail.com",
      to: email,
      subject: "Testing node emails",
      html: `<p>Enter the OTP: ${otp} to verify your email account</p>`,
    };

    transporter.sendMail(options, async (error, info) => {
      if (error) {
        console.log(error);
        return res.status(500).send("Couldn't send OTP email.");
      } else {
        try {
          await user.update({ otp });

          setTimeout(async () => {
            await user.update({ otp: null });
          }, 60000);
        } catch (updateErr) {
          console.error("Error updating OTP in the database:", updateErr);
          return res.status(500).send("Couldn't update OTP in the database.");
        }
      }
    });

    const temp_token = jwt.sign({ email }, process.env.JWT_SECRET_KEY, {
      expiresIn: "1d",
    });
    res.cookie("temp_token", temp_token);

    console.log("user ka token:", temp_token);

    try {
      await user.update({ temp_token });
    } catch (updateErr) {
      console.error("Error updating token in the database:", updateErr);
      return res.status(500).send("Couldn't update token in the database.");
    }

    return res.status(200).json({ success: true, temp_token });
  } catch (error) {
    console.log("Error in /verifyEmail route:", error);
    return res
      .status(500)
      .json({ success: false, message: "An error occurred." });
  }
});

router.post("/forgotPass", async (req, res) => {
  try {
    const newPwd1 = req.body.password1;
    const newPwd2 = req.body.password2;
    const temp_token = req.cookies.temp_token;

    const user = await User.findOne({
      where: { temp_token },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    if (newPwd1 === newPwd2) {
      const saltRounds = 10;
      const salt = await bcrypt.genSalt(saltRounds);
      const hash = await bcrypt.hash(newPwd1, salt);

      await User.update(
        { password: hash },
        {
          where: { temp_token },
        }
      );

      return res
        .status(200)
        .json({ success: true, message: "Password updated successfully." });
    } else {
      console.log("Password do not match");
      return res
        .status(401)
        .json({ success: false, message: "Password did not match." });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "An error occurred." });
  }
});

router.post("/changePass", async (req, res) => {
  try {
    const newPwd1 = req.body.password1;
    const newPwd2 = req.body.password2;
    console.log("Passwords:", newPwd1, newPwd2);

    const token = req.cookies.token;

    const user = await User.findOne({
      where: { token },
    });

    console.log("Database Query Result:", user);

    if (!user) {
      console.error("User not found for token:", token);
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    if (newPwd1 === newPwd2) {
      const saltRounds = 10;
      const salt = await bcrypt.genSalt(saltRounds);
      const hash = await bcrypt.hash(newPwd1, salt);

      await user.update({ password: hash });

      return res
        .status(200)
        .json({ success: true, message: "Password updated successfully." });
    } else {
      console.log("Password do not match");
      return res
        .status(401)
        .json({ success: false, message: "Password did not match." });
    }
  } catch (error) {
    console.error("Error during password change:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during password change.",
    });
  }
});

router.post("/logout", async (req, res) => {
  try {
    await req.session.destroy();
    res.clearCookie("token");
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ Status: "Error" });
  }
});

// -----------------Payments------------------

// This is a public sample test API key.
// Don’t submit any personally identifiable information in requests made with this key.
// Sign in to see your own test API key embedded in code samples.
const stripe = require("stripe")(
  "sk_test_51OryymSD2MHCmuStecjaEbRAVTjXp2yXoOROvDnH5WGRKoV8cl1dugau6McEy3C4nZeE11lMbd7GP6X1F74RKbmE00BJSV94ne"
);

const calculateOrderAmount = (items) => {
  // Replace this constant with a calculation of the order's amount
  // Calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 1400;
};

router.post("/createPaymentIntent", async (req, res) => {
  const { items } = req.body;
  console.log("req.body", req.body);

  // Create a PaymentIntent with the order amount and currency
  const paymentIntent = await stripe.paymentIntents.create({
    amount: calculateOrderAmount(items),
    currency: "inr",
    // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
    automatic_payment_methods: {
      enabled: true,
    },
  });

  res.send({
    clientSecret: paymentIntent.client_secret,
  });
});

module.exports = router;
