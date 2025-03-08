import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import {
  createRandomSymmetricKey,
  exportSymKey,
  importSymKey,
  rsaEncrypt,
  symEncrypt,
  importPubKey,
} from "../crypto";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

type Node = { nodeId: number; pubKey: string }; // Define the Node type

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

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.status(200).json({ result: lastSentMessage });
  });

  _user.post("/message", (req, res) => {
    const { message } = req.body;
    lastReceivedMessage = message;
    res.status(200).send("success");
  });

  _user.get("/getLastCircuit", (req, res) => {
    res.status(200).json({ result: lastCircuit });
  });

  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body;

    const nodesResponse = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
    const { nodes } = (await nodesResponse.json()) as { nodes: Node[] };

    const circuit: number[] = [];
    while (circuit.length < 3) {
      const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
      if (!circuit.includes(randomNode.nodeId)) {
        circuit.push(randomNode.nodeId);
      }
    }
    lastCircuit = circuit;

    let encryptedMessage = message;
    for (let i = circuit.length - 1; i >= 0; i--) {
      const nodeId = circuit[i];
      const node = nodes.find((n) => n.nodeId === nodeId);

      if (!node) {
        throw new Error(`Node ${nodeId} not found in the registry`);
      }

      const symmetricKey = await createRandomSymmetricKey();
      const symmetricKeyBase64 = await exportSymKey(symmetricKey);

      const destination = i === circuit.length - 1
          ? `000000${BASE_USER_PORT + destinationUserId}`
          : `000000${BASE_ONION_ROUTER_PORT + circuit[i + 1]}`;
      const messageToEncrypt = `${destination}${encryptedMessage}`;
      encryptedMessage = await symEncrypt(symmetricKey, messageToEncrypt);

      const encryptedSymmetricKey = await rsaEncrypt(symmetricKeyBase64, node.pubKey);

      encryptedMessage = `${encryptedSymmetricKey}${encryptedMessage}`;
    }

    const entryNodeId = circuit[0];
    await fetch(`http://localhost:${BASE_ONION_ROUTER_PORT + entryNodeId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: encryptedMessage }),
    });

    lastSentMessage = message;

    res.status(200).send("success");
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(`User ${userId} is listening on port ${BASE_USER_PORT + userId}`);
  });

  return server;
}