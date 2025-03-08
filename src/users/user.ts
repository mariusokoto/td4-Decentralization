import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT } from "../config";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;
let lastCircuit: number[] | null = null;


export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());


  // Status route
  _user.get("/status", (req, res) => {
    res.status(200).send("live");
  });

  // Get last received message
  _user.get("/getLastReceivedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedMessage });
  });

  // Get last sent message
  _user.get("/getLastSentMessage", (req, res) => {
    res.status(200).json({ result: lastSentMessage });
  });

  // Receive a message
  _user.post("/message", (req, res) => {
    const { message } = req.body;

    // Update the last received message
    lastReceivedMessage = message;

    // Respond with success
    res.status(200).send("success");
  });

  _user.get("/getLastCircuit", (req, res) => {
    res.status(200).json({ result: lastCircuit });
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
        `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}
