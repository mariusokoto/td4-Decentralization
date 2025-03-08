import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, BASE_USER_PORT, REGISTRY_PORT } from "../config";
import {
  generateRsaKeyPair,
  exportPubKey,
  exportPrvKey,
  rsaDecrypt,
  symDecrypt,
  importSymKey,
  importPrvKey,
} from "../crypto";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  const { publicKey, privateKey } = await generateRsaKeyPair();
  const pubKeyBase64 = await exportPubKey(publicKey);
  const prvKeyBase64 = await exportPrvKey(privateKey);

  if (!prvKeyBase64) {
    throw new Error("Failed to export private key");
  }

  let lastReceivedEncryptedMessage: string | null = null;
  let lastReceivedDecryptedMessage: string | null = null;
  let lastMessageDestination: number | null = null;

  onionRouter.get("/status", (req, res) => {
    res.status(200).send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.status(200).json({ result: lastMessageDestination });
  });

  onionRouter.get("/getPrivateKey", (req, res) => {
    res.status(200).json({ result: prvKeyBase64 });
  });

  onionRouter.post("/message", async (req, res) => {
    const { message } = req.body;
    lastReceivedEncryptedMessage = message;

    const encryptedSymmetricKey = message.slice(0, 344);
    const encryptedMessage = message.slice(344);

    const symmetricKeyBase64 = await rsaDecrypt(encryptedSymmetricKey, await importPrvKey(prvKeyBase64));
    const symmetricKey = await importSymKey(symmetricKeyBase64);

    const decryptedMessage = await symDecrypt(symmetricKeyBase64, encryptedMessage);
    lastReceivedDecryptedMessage = decryptedMessage;

    const destination = decryptedMessage.slice(0, 10);
    const remainingMessage = decryptedMessage.slice(10);

    const nextDestination = parseInt(destination, 10);
    lastMessageDestination = nextDestination;

    if (nextDestination >= BASE_USER_PORT) {
      await fetch(`http://localhost:${nextDestination}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: remainingMessage }),
      });
    } else {
      await fetch(`http://localhost:${nextDestination}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `${destination}${remainingMessage}` }),
      });
    }

    res.status(200).send("success");
  });

  const registerNode = async () => {
    try {
      await fetch(`http://localhost:${REGISTRY_PORT}/registerNode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, pubKey: pubKeyBase64 }),
      });
      console.log(`Node ${nodeId} registered successfully`);
    } catch (error) {
      console.error(`Failed to register node ${nodeId}:`, error);
    }
  };

  await registerNode();

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(`Onion router ${nodeId} is listening on port ${BASE_ONION_ROUTER_PORT + nodeId}`);
  });

  return server;
}