import { initializeApp } from "firebase/app";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import * as fs from "fs";

const rawConfig = fs.readFileSync("firebase-applet-config.json", "utf8");
const config = JSON.parse(rawConfig);

const app = initializeApp(config);
const storage = getStorage(app);

async function run() {
  console.log("Testing storage...");
  try {
    const storageRef = ref(
      storage,
      "photos/88feaa8c-7418-4b56-b60a-c5190560de29_manifestacionmontejurrajurramendi.jpg",
    );
    console.log("Calling getDownloadURL");
    const result = await getDownloadURL(storageRef);
    console.log("Success! URL:", result);
  } catch (e) {
    console.error("Failed to get download URL:", e);
  }
  process.exit();
}

run();
