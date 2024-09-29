import "dotenv/config";
import fs from "fs";
import os from "os";
import { exec } from "child_process";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  makeInMemoryStore,
  Browsers,
} from "@whiskeysockets/baileys";
import { startConnectionHandler } from "./handlers/connection";
import { startMessageHandler } from "./handlers/messages";
import { Client } from "./lib/serialize";
import { loadPlugins, pluginsFolder } from "./lib/Loader";
import pino from "pino";

const logger = pino({
  level: "fatal",
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
}).child({ level: "fatal", class: "client" });

const store = makeInMemoryStore({ logger: logger as any });

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(
    `./${process.env.SESSION_NAME}`,
  );
  const { version, isLatest } = await fetchLatestWaWebVersion({});

  console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

  const client = makeWASocket({
    version: [2, 3000, 1015901307],
    logger: logger as any,
    auth: state,
    browser: Browsers.ubuntu("Chrome"),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    emitOwnEvents: true,
    fireInitQueries: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  store.bind(client.ev);
  await Client({ client, store });

  console.log(pluginsFolder);
  await loadPlugins(pluginsFolder);
  await startConnectionHandler(client, store);
  await startMessageHandler(client, store);

  client.ev.on("creds.update", saveCreds);
};

startSock().catch(console.error);
