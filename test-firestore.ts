import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import * as fs from "fs";

const rawConfig = fs.readFileSync("firebase-applet-config.json", "utf8");
const config = JSON.parse(rawConfig);

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  console.log("Testing connection to database:", config.firestoreDatabaseId);
  try {
    const p = setDoc(doc(db, "test/connection"), { timestamp: Date.now() });

    let isFinished = false;
    p.then(() => (isFinished = true)).catch(() => (isFinished = true));

    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      console.log("Waited", i + 1, "seconds. Finished:", isFinished);
      if (isFinished) break;
    }

    try {
      await p;
      console.log("Successfully wrote test document!");
    } catch (e) {
      console.error("Error writing:", e);
    }
  } catch (e) {
    console.error("Failed to run:", e);
  }
  process.exit();
}

run();
