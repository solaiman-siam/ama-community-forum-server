require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const e = require("express");
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

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).send({ message: "unauthorized access" });
  }
  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
      if (error) {
        res.status(401).send({ message: "unauthorized access" });
      }
      req.decoded = decoded;
      next();
    });
  }
};

async function run() {
  try {
    const userCollection = client.db("amaDB").collection("users");
    const postCollection = client.db("amaDB").collection("posts");
    const commentCollection = client.db("amaDB").collection("comments");
    const alltagsCollection = client.db("amaDB").collection("alltags");
    const feedbackCollection = client.db("amaDB").collection("feedback");
    const tagCollection = client.db("amaDB").collection("tags");
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

    // add upvote to db
    app.post("/upVote/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const downVoteCount = await postCollection.findOne(query);

      if (downVoteCount.downVote > 0) {
        const updateOne = { $inc: { downVote: -1 } };
        const result = await postCollection.updateOne(query, updateOne);
      }

      const updateOne = { $inc: { upVote: 1 } };
      const result = await postCollection.updateOne(query, updateOne);
      res.send(result);
    });

    // add downvote to db
    app.post("/downVote/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const upVoteCount = await postCollection.findOne(query);
      if (upVoteCount.upVote > 0) {
        const updateOne = { $inc: { upVote: -1 } };
        const result = await postCollection.updateOne(query, updateOne);
      }
      const updateOne = { $inc: { downVote: 1 } };
      const result = await postCollection.updateOne(query, updateOne);
      res.send(result);
    });

    // get all post
    app.get("/all-post", async (req, res) => {
      const pages = parseInt(req.query.pages) - 1;
      const size = parseInt(req.query.size);

      const sort = { date: -1 };
      const result = await postCollection
        .find()
        .sort(sort)
        .skip(pages * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // get Popular post
    app.get("/popular-post", async (req, res) => {
      const pages = parseInt(req.query.pages) - 1;
      const size = parseInt(req.query.size);

      const result = await postCollection
        .aggregate([
          {
            $addFields: {
              voteDifference: { $subtract: ["$upVote", "$downVote"] },
            },
          },
          {
            $sort: { voteDifference: -1 },
          },
        ])
        .skip(pages * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // get membership
    app.get("/membership/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // upgrade user role
    app.post("/upgrade/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      updateDoc = {
        $set: {
          membershipStatus: "Member",
          postLimit: "unlimited",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // get recent search tag
    app.get("/stored-tags", async (req, res) => {
      const sort = { date: -1 };
      const result = await tagCollection.find().sort(sort).toArray();
      res.send(result);
    });

    // store search tag
    app.post("/store-searchTag", async (req, res) => {
      const storeTag = req.query.storeTag;
      const allTags = await tagCollection.find().toArray();
      const isExist = allTags.find((item) => item.tag === storeTag);

      if (isExist) {
        const query = { tag: storeTag };
        updateDoc = {
          $set: {
            date: new Date(),
          },
        };
        const result = await tagCollection.updateOne(query, updateDoc);
        res.send(result);
      }

      if (!isExist && storeTag !== "") {
        const result = await tagCollection.insertOne({
          tag: storeTag,
          date: new Date(),
        });
        res.send(result);
      }
    });

    // added feedback to db
    app.post("/add-feedback", async (req, res) => {
      const feedback = req.body;
      const result = await feedbackCollection.insertOne(feedback);
      res.send(result);
    });

    // delete feedback and comment
    app.delete("/delete-feedback/:id", async (req, res) => {
      const deletedId = req.params.id;
      console.log(deletedId);
      const query = { _id: new ObjectId(deletedId) };
      const deleteFeedback = await feedbackCollection.deleteOne(query);
      res.send(deleteFeedback);
    });

    // get all feedbacks
    app.get("/stored-feedback", async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    });

    // get all comments post and users count
    app.get("/statistics", async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const posts = await postCollection.estimatedDocumentCount();
      const comments = await commentCollection.estimatedDocumentCount();
      res.send({ users, posts, comments });
    });
    // get specific comments
    app.get("/specific-comments/:title", async (req, res) => {
      const title = req.params.title;
      const query = { title: title };
      const result = await commentCollection.find(query).toArray();
      res.send(result);
    });

    // added admin tags
    app.post("/all-tags", async (req, res) => {
      const tagData = req.body;
      const all = await alltagsCollection.find().toArray();
      const isExist = all.filter((item) => item.tags === tagData.tags);
      if (isExist.length < 1) {
        const result = await alltagsCollection.insertOne(tagData);
        res.send(result);
      }
    });

    // get admin tags
    app.get("/all-tags", async (req, res) => {
      const result = await alltagsCollection.find().toArray();
      res.send(result);
    });

    // add comment
    app.post("/add-comment", async (req, res) => {
      const commentData = req.body;
      const result = await commentCollection.insertOne(commentData);
      res.send(result);
      if (result.insertedId) {
        const query = { title: commentData.title };
        const updateOne = { $inc: { comment: 1 } };
        const allPost = await postCollection.updateOne(query, updateOne);
      }
    });

    // get comment
    app.get("/comments/:id", async (req, res) => {
      const postId = req.params.id;
      const query = { title: postId };
      const result = await commentCollection.find(query).toArray();
      res.send(result);
    });

    // get post details
    app.get("/post-details/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await postCollection.findOne(query);
      res.send(result);
    });

    // get search post
    app.get("/search-post", async (req, res) => {
      const pages = parseInt(req.query.pages) - 1;
      const size = parseInt(req.query.size);
      const searchTag = req.query.searchTag;
      const sort = { date: -1 };
      const result = await postCollection
        .find({
          tag: { $regex: searchTag, $options: "i" },
        })
        .sort(sort)
        .skip(pages * size)
        .limit(size)
        .toArray();
      res.send(result);
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
      const pages = parseInt(req.query.pages) - 1;
      const size = parseInt(req.query.size);
      const tag = req.query.tag;
      const query = { tag: tag };
      const sort = { date: -1 };
      const result = await postCollection
        .find(query)
        .sort(sort)
        .skip(pages * size)
        .limit(size)
        .toArray();
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

    // get all post count
    app.get("/post-count", async (req, res) => {
      const result = await postCollection.countDocuments();
      res.send({ count: result });
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
