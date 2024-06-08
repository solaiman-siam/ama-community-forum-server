require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();

// middleware
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8vxmi4o.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

async function run() {
  try {
    const userCollection = client.db("amaDB").collection("users");
    const postCollection = client.db("amaDB").collection("posts");
    const announcementCollection = client
      .db("amaDB")
      .collection("announcements");

    // jwt token send to client side
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "100d",
      });
      res.cookie("token", token, { ...cookieOptions }).send({ success: true });
    });

    // remove token to cookie
    app.post("/logout", async (req, res) => {
      const user = req.body;
      res
        .clearCookie("cookie", { ...cookieOptions, maxAge: 0 })
        .send({ success: true });
    });

    // stripe payment related api
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // update role
    app.post("/make-admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // search user via username
    app.get("/search-users", async (req, res) => {
      const searchWord = req.query.keyword;
      const result = await userCollection
        .find({
          name: { $regex: searchWord, $options: "i" },
        })
        .toArray();
      res.send(result);
    });

    // get all users
    app.get("/manage-users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // get all announcement
    app.get("/all-announcement", async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });

    // add announcement to db
    app.post("/add-announcement", async (req, res) => {
      const announcementData = req.body;
      const result = await announcementCollection.insertOne(announcementData);
      res.send(result);
    });

    // get tag search post
    app.get("/tag-search", async (req, res) => {
      const tag = req.query.tag;
      const query = { tag: tag };
      const result = await postCollection.find(query).toArray();
      res.send(result);
    });

    // delete a post
    app.delete("/delete-post/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await postCollection.deleteOne(query);
      res.send(result);
    });

    // get recent 3 user post
    app.get("/recent-post/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const sort = { date: -1 };
      const result = await postCollection.find(query).sort(sort).toArray();
      res.send(result);
    });

    // get all post
    app.get("/all-post", async (req, res) => {
      const sort = { date: -1 };
      const result = await postCollection.find().sort(sort).toArray();
      res.send(result);
    });

    // get users post
    app.get("/my-post/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await postCollection.find(query).toArray();
      res.send(result);
    });

    // save post data to db
    app.post("/add-post", async (req, res) => {
      const postData = req.body;
      const result = await postCollection.insertOne(postData);
      res.send(result);
    });

    // save new logged  user info
    app.post("/users", async (req, res) => {
      const userData = req.body;

      const query = { email: userData?.email };

      const isExist = await userCollection.findOne(query);
      if (isExist) {
        return;
      }

      const result = await userCollection.insertOne(userData);
      res.send(result);
    });

    // get logged user
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// testing method
app.get("/", (req, res) => {
  res.send("ama is running");
});

app.listen(port, () => {
  console.log("ama is running port", port);
});
