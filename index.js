import express from "express";
import cors from "cors";
import path from "path";
import url, { fileURLToPath } from "url";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { ClerkExpressRequireAuth, ClerkExpressWithAuth } from '@clerk/clerk-sdk-node';

const port = process.env.PORT || 3000;
const app = express();

const __filename = fileURLToPath(import.meta.url)
const  __dirname = path.dirname(__filename)

// Middleware to handle CORS
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
}));

// Middleware to parse JSON
app.use(express.json());

// Clerk middleware for authentication
app.use(ClerkExpressWithAuth());

// Connect to MongoDB
const connect = async () => {
    try {
        await mongoose.connect(process.env.MONGO);
        console.log("Connected to MongoDB");
    } catch (err) {
        console.error("Error connecting to MongoDB:", err);
    }
};

// ImageKit configuration
const imagekit = new ImageKit({
    urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
    publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
    privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

// Route to get ImageKit authentication parameters
app.get("/api/upload", (req, res) => {
    const result = imagekit.getAuthenticationParameters();
    res.send(result);
});

// Route to create a new chat
app.post("/api/chats", ClerkExpressRequireAuth(), async (req, res) => {
    const userId = req.auth.userId;
    const { text } = req.body;

    if (!userId || !text) {
        return res.status(400).send("Missing required fields.");
    }

    try {
        // Create and save a new chat
        const newChat = new Chat({
            userId: userId,
            history: [{ role: "user", parts: [{ text }] }],
        });

        const savedChat = await newChat.save();

        // Check if userChats document exists
        const userChats = await UserChats.findOne({ userId: userId });

        if (!userChats) {
            const newUserChats = new UserChats({
                userId: userId,
                chats: [{
                    _id: savedChat._id,
                    title: text.substring(0, 40),
                }],
            });

            await newUserChats.save();
        } else {
            // Update existing userChats document
            await UserChats.updateOne({ userId: userId }, {
                $push: {
                    chats: {
                        _id: savedChat._id,
                        title: text.substring(0, 40),
                    },
                },
            });
        }

        res.status(201).send(savedChat._id);
    } catch (err) {
        console.error("Error creating chat:", err);
        res.status(500).send("Error creating chat!");
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (err.message === "Unauthenticated") {
        return res.status(401).send("Unauthorized access, please log in.");
    }
    res.status(500).send("Internal server error");
});

app.get("/api/chats/:id", ClerkExpressRequireAuth(), async(req,res)=>{
    const userId = req.auth.userId;

    try {
        const chat = await Chat.findOne({_id: req.params.id, userId})
        res.status(200).send(chat);
    } catch (err) {
        console.log(err);
        res.status(500).send("Error fetching chat!")
    }
})

app.get("/api/userchats", ClerkExpressRequireAuth(), async(req,res)=>{
    const userId = req.auth.userId;

    try {
        const userChats = await UserChats.find({userId})
        res.status(200).send(userChats[0].chats);
    } catch (err) {
        console.log(err);
        res.status(500).send("Error fetching userchats!")
    }
})

app.put("/api/chats/:id",ClerkExpressRequireAuth(), async (req,res)=>{
    const userId = req.auth.userId;

    const {question,answer,img} = req.body;

    const newItems = [
        ...(question? [{role:"user",parts:[{text:question}],...(img && {img})}]:[]),
        {role:"model",parts:[{text:answer}]},
    ];

    try {

            const updatedChat = await Chat.updateOne({_id:req.params.id, userId},{
                $push:{
                    history:{
                        $each:newItems,
                    }
                }
            })
        res.status(200).send(updatedChat);
    } catch (err) {
        console.log(err);
        res.status(500).send("Error adding conversations!")
    }
})

app.use((err, req, res ,next)=>{
    console.error(err.stack);
    res.status(401).send("Unauthenticated!");
})

app.use(express.static(path.join(__dirname,"../frontend/minorp")))

app.get("*",(req,res)=>{
    res.sendFile(path.join(__dirname,"../frontend/minorp","index.html"))
})

// Start the server and connect to MongoDB
app.listen(port, () => {
    connect();
    console.log(`Server running on port ${port}`);
});
