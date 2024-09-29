import serialize from "../lib/serialize";
import { exec } from "child_process";
import util from "util";
import path from "path";
import { plugins } from "../lib/Loader";

export const startMessageHandler = async (client: any, store: any) => {
  client.ev.on("messages.upsert", async ({ messages }: { messages: any[] }) => {
    const message = messages[0];
    if (!message?.message) return;

    const m = await serialize(client, message, store);

    const quoted = m.isQuoted ? m.quoted : m;
    const downloadM = async (filename: string) =>
      await client.downloadMediaMessage(quoted, filename);

    const isCommand = m.prefix && m.body.startsWith(m.prefix);

    if (m.isBot) return;

    const from = m.key.remoteJid;

    for (const name in plugins) {
      const plugin = plugins[name] || null;
      const command = isCommand ? m.command.toLowerCase() : false;

      if (typeof plugin.before === "function") {
        const shouldContinue = await plugin.before.call(m, {
          client,
        });

        if (shouldContinue) {
          continue;
        }
      }

      let isAccept = Array.isArray(plugin.cmd) && plugin.cmd.includes(command);

      if (!isAccept) continue;

      if (plugin.isGroup && !m.isGroup) continue;
      if (plugin.isPrivate && m.isGroup) continue;
      if (plugin.isPremium && !m.isPremium) continue;
      if (plugin.isOwner && !m.isOwner) continue;

      try {
        await plugin.code({
          conn: client,
          details: plugin.details,
          from,
          m,
        });
      } catch (err) {
        console.error(`Error executing plugin ${name}:`, err);
      }
    }
  });
};
