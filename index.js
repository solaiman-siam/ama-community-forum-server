require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
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

async function run() {
  try {
    const userCollection = client.db("amaDB").collection("users");
    const postCollection = client.db("amaDB").collection("posts");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = process.env.ACCESS_TOKEN_SECRET;

      jwt.sign(user, token, { expiresIn: "100d" });
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
