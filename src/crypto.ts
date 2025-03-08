import { webcrypto } from "crypto";

// #############
// ### Utils ###
// #############

// Function to convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

// Function to convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  var buff = Buffer.from(base64, "base64");
  return buff.buffer.slice(buff.byteOffset, buff.byteOffset + buff.byteLength);
}

// ################
// ### RSA keys ###
// ################

// Generates a pair of private / public RSA keys
type GenerateRsaKeyPair = {
  publicKey: webcrypto.CryptoKey;
  privateKey: webcrypto.CryptoKey;
};
export async function generateRsaKeyPair(): Promise<GenerateRsaKeyPair> {
  const keyPair = await webcrypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
  );
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

// Export a crypto public key to a base64 string format
export async function exportPubKey(key: webcrypto.CryptoKey): Promise<string> {
  const exported = await webcrypto.subtle.exportKey("spki", key);
  return arrayBufferToBase64(exported);
}

// Export a crypto private key to a base64 string format
export async function exportPrvKey(key: webcrypto.CryptoKey | null): Promise<string | null> {
  if (!key) return null;
  const exported = await webcrypto.subtle.exportKey("pkcs8", key);
  return arrayBufferToBase64(exported);
}

// Import a base64 string public key to its native format
export async function importPubKey(strKey: string): Promise<webcrypto.CryptoKey> {
  // Convert the base64 string to an ArrayBuffer
  const buffer = base64ToArrayBuffer(strKey);

  // Import the public key
  return await webcrypto.subtle.importKey(
      "spki", // Public key format
      buffer,
      { name: "RSA-OAEP", hash: "SHA-256" }, // Algorithm details
      true, // Whether the key is extractable
      ["encrypt"] // Key usage
  );
}

// Import a base64 string private key to its native format
export async function importPrvKey(strKey: string): Promise<webcrypto.CryptoKey> {
  // Convert the base64 string to an ArrayBuffer
  const buffer = base64ToArrayBuffer(strKey);

  // Import the private key
  return await webcrypto.subtle.importKey(
      "pkcs8", // Private key format
      buffer,
      { name: "RSA-OAEP", hash: "SHA-256" }, // Algorithm details
      true, // Whether the key is extractable
      ["decrypt"] // Key usage
  );
}

// Encrypt a message using an RSA public key
export async function rsaEncrypt(b64Data: string, strPublicKey: string): Promise<string> {
  // Import the public key from the base64 string
  const publicKey = await importPubKey(strPublicKey);

  // Convert the base64-encoded data to an ArrayBuffer
  const buffer = base64ToArrayBuffer(b64Data);

  // Encrypt the data using the public key
  const encrypted = await webcrypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      buffer
  );

  // Convert the encrypted data to a base64 string
  return arrayBufferToBase64(encrypted);
}

export async function rsaDecrypt(data: string, privateKey: webcrypto.CryptoKey): Promise<string> {
  // Convert the base64-encoded data to an ArrayBuffer
  const buffer = base64ToArrayBuffer(data);

  // Decrypt the data using the private key
  const decrypted = await webcrypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      buffer
  );

  // Convert the decrypted data to a base64 string
  return arrayBufferToBase64(decrypted);
}

// ######################
// ### Symmetric keys ###
// ######################

// Generates a random symmetric key
export async function createRandomSymmetricKey(): Promise<webcrypto.CryptoKey> {
  return await webcrypto.subtle.generateKey(
      {
        name: "AES-CBC",
        length: 256, // 256-bit key
      },
      true, // Key is extractable
      ["encrypt", "decrypt"] // Key usage
  );
}

// Export a crypto symmetric key to a base64 string format
export async function exportSymKey(key: webcrypto.CryptoKey): Promise<string> {
  const exported = await webcrypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(exported);
}

// Import a base64 string format to its crypto native format
export async function importSymKey(strKey: string): Promise<webcrypto.CryptoKey> {
  const buffer = base64ToArrayBuffer(strKey);
  return await webcrypto.subtle.importKey(
      "raw", // Key format
      buffer,
      { name: "AES-CBC" }, // Algorithm details
      true, // Key is extractable
      ["encrypt", "decrypt"] // Key usage
  );
}

// Encrypt a message using a symmetric key
export async function symEncrypt(
    key: webcrypto.CryptoKey,
    data: string
): Promise<string> {
  // Convert the data to a Uint8Array
  const encodedData = new TextEncoder().encode(data);

  // Generate a random initialization vector (IV)
  const iv = webcrypto.getRandomValues(new Uint8Array(16)); // 16 bytes for AES-CBC

  // Encrypt the data
  const encrypted = await webcrypto.subtle.encrypt(
      {
        name: "AES-CBC",
        iv: iv,
      },
      key,
      encodedData
  );

  // Combine the IV and encrypted data into a single ArrayBuffer
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  // Convert the combined ArrayBuffer to a base64 string
  return arrayBufferToBase64(combined.buffer);
}

export async function symDecrypt(
    strKey: string,
    encryptedData: string
): Promise<string> {
  // Import the symmetric key
  const key = await importSymKey(strKey);

  // Convert the base64-encoded data to an ArrayBuffer
  const combined = base64ToArrayBuffer(encryptedData);

  // Extract the IV and encrypted data from the combined ArrayBuffer
  const iv = combined.slice(0, 16); // First 16 bytes are the IV
  const data = combined.slice(16); // Remaining bytes are the encrypted data

  // Decrypt the data
  const decrypted = await webcrypto.subtle.decrypt(
      {
        name: "AES-CBC",
        iv: iv,
      },
      key,
      data
  );

  // Convert the decrypted data to a string
  return new TextDecoder().decode(decrypted);
}


// crypto.ts

export async function validateEncryption(
    encryptedMessage: string,
    decryptedMessage: string,
    privateKey: string
): Promise<boolean> {
  try {
    // Decrypt the encrypted message
    const decrypted = await rsaDecrypt(encryptedMessage, await importPrvKey(privateKey));

    // Compare the decrypted message with the expected decrypted message
    return decrypted === decryptedMessage;
  } catch (error) {
    console.error("Validation error:", error);
    return false;
  }
}
