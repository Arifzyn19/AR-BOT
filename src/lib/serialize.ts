import "dotenv/config";
import baileys, {
  proto,
  jidNormalizedUser,
  extractMessageContent,
  areJidsSameUser,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import path from "path";
import fs from "fs";
import pino from "pino";
import chalk from "chalk";
import util from "util";
import { parsePhoneNumber } from "libphonenumber-js";
import { fromBuffer } from "file-type";

function escapeRegExp(string: any) {
  return string.replace(/[.*=+:\-?^${}()|[\]\\]|\s/g, "\\$&");
}

const getContentType = (content: any): string | undefined => {
  if (content) {
    const keys = Object.keys(content);
    const key = keys.find(
      (k) =>
        (k === "conversation" ||
          k.endsWith("Message") ||
          k.includes("V2") ||
          k.includes("V3")) &&
        k !== "senderKeyDistributionMessage",
    );
    return key;
  }
  return undefined;
};

interface Logger {
  info(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  trace(...args: any[]): void;
  debug(...args: any[]): void;
}

interface ClientProps {
  client: { [key: string]: any; logger?: Logger };
  store: any;
}

export function Client({ client, store }: { client: any; store: any }) {
  const conn = Object.defineProperties(client, {
    logger: {
      get(): Logger {
        return {
          info(...args: any[]) {
            console.log(
              chalk.bold.bgRgb(51, 204, 51)("INFO "),
              chalk.cyan(util.format(...args)),
            );
          },
          error(...args: any[]) {
            console.log(
              chalk.bold.bgRgb(247, 38, 33)("ERROR "),
              chalk.rgb(255, 38, 0)(util.format(...args)),
            );
          },
          warn(...args: any[]) {
            console.log(
              chalk.bold.bgRgb(255, 153, 0)("WARNING "),
              chalk.redBright(util.format(...args)),
            );
          },
          trace(...args: any[]) {
            console.log(
              chalk.grey("TRACE "),
              chalk.white(util.format(...args)),
            );
          },
          debug(...args: any[]) {
            console.log(
              chalk.bold.bgRgb(66, 167, 245)("DEBUG "),
              chalk.white(util.format(...args)),
            );
          },
        };
      },
      enumerable: true,
    },

    getName: {
      value(jid: string) {
        const id = jidNormalizedUser(jid);
        if (id.endsWith("g.us")) {
          const metadata = store.groupMetadata?.[id];
          return metadata?.subject || "";
        } else {
          const metadata = store.contacts[id];
          return (
            metadata?.name ||
            metadata?.verifiedName ||
            metadata?.notify ||
            parsePhoneNumber("+" + id.split("@")[0]).format("INTERNATIONAL")
          );
        }
      },
    },

    sendContact: {
      async value(
        jid: string,
        numbers: string[],
        quoted: any,
        options: any = {},
      ) {
        const list: { displayName: string; vcard: string }[] = numbers
          .filter((v) => !v.endsWith("g.us"))
          .map((v) => {
            v = v.replace(/\D+/g, "");
            const name = this.getName(v + "@s.whatsapp.net");
            return {
              displayName: name,
              vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${name}\nFN:${name}\nitem1.TEL;waid=${v}:${v}\nEND:VCARD`,
            };
          });

        return this.sendMessage(
          jid,
          {
            contacts: {
              displayName: `${list.length} Contact${list.length === 1 ? "" : "s"}`,
              contacts: list,
            },
          },
          { quoted, ...options },
        );
      },
      enumerable: true,
    },

    parseMention: {
      value(text: string) {
        return (
          [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(
            (v) => v[1] + "@s.whatsapp.net",
          ) || []
        );
      },
    },

    downloadMediaMessage: {
      async value(message: any, filename?: string) {
        const media = await downloadMediaMessage(
          message,
          "buffer",
          {},
          {
            logger: pino({
              timestamp: () => `,"time":"${new Date().toJSON()}"`,
              level: "fatal",
            }).child({ class: "client" }) as any,
            reuploadRequest: client.updateMediaMessage,
          },
        );

        if (filename) {
          const mime = await fromBuffer(media);
          const filePath = path.join(
            process.cwd(),
            `${filename}.${mime?.ext || "default"}`,
          );
          await fs.promises.writeFile(filePath, media);
          return filePath;
        }

        return media;
      },
      enumerable: true,
    },

    cMod: {
      value(
        jid: string,
        copy: any,
        text: string = "",
        sender: string = client.user.id,
        options: any = {},
      ) {
        const mtype = getContentType(copy.message);
        if (!mtype) {
          throw new Error("Invalid message type"); // Handle case where mtype is undefined
        }

        const content: any = copy.message[mtype];
        if (typeof content === "string") {
          copy.message[mtype] = text || content;
        } else if (content?.caption) {
          content.caption = text || content.caption;
        } else if (content?.text) {
          content.text = text || content.text;
        }

        if (typeof content !== "string") {
          copy.message[mtype] = { ...content, ...options };
          copy.message[mtype].contextInfo = {
            ...(content.contextInfo || {}),
            mentionedJid:
              options.mentions || content.contextInfo?.mentionedJid || [],
          };
        }

        if (copy.key.participant)
          sender = copy.key.participant = sender || copy.key.participant;
        if (copy.key.remoteJid.includes("@s.whatsapp.net"))
          sender = sender || copy.key.remoteJid;
        else if (copy.key.remoteJid.includes("@broadcast"))
          sender = sender || copy.key.remoteJid;

        copy.key.remoteJid = jid;
        copy.key.fromMe = areJidsSameUser(sender, client.user.id);
        return proto.WebMessageInfo.fromObject(copy);
      },
      enumerable: false,
    },
  });

  return conn;
}

export default async function serialize(client: any, msg: any, store: any) {
  const m: any = {};

  if (!msg.message) return;

  if (!msg) return msg;

  m.message = parseMessage(msg.message);

  if (msg.key) {
    m.key = msg.key;
    m.from = m.key.remoteJid.startsWith("status")
      ? jidNormalizedUser(m.key?.participant || msg.participant)
      : jidNormalizedUser(m.key.remoteJid);
    m.fromMe = m.key.fromMe;
    m.id = m.key.id;
    m.device = /^3A/.test(m.id)
      ? "ios"
      : m.id.startsWith("3EB")
        ? "web"
        : /^.{21}/.test(m.id)
          ? "android"
          : /^.{18}/.test(m.id)
            ? "desktop"
            : "unknown";
    m.isBot = m.id.startsWith("BAE5") || m.id.startsWith("HSK");
    m.isGroup = m.from.endsWith("@g.us");
    m.participant =
      jidNormalizedUser(msg?.participant || m.key.participant) || false;
    m.sender = jidNormalizedUser(
      m.fromMe ? client.user.id : m.isGroup ? m.participant : m.from,
    );
  }

  if (m.isGroup) {
    if (!(m.from in store.groupMetadata))
      store.groupMetadata[m.from] = await client.groupMetadata(m.from);
    m.metadata = store.groupMetadata[m.from];
    m.groupAdmins =
      m.isGroup &&
      m.metadata.participants.reduce(
        (memberAdmin: any[], memberNow: any) =>
          (memberNow.admin
            ? memberAdmin.push({ id: memberNow.id, admin: memberNow.admin })
            : [...memberAdmin]) && memberAdmin,
        [],
      );
    m.isAdmin =
      m.isGroup &&
      !!m.groupAdmins.find((member: any) => member.id === m.sender);
    m.isBotAdmin =
      m.isGroup &&
      !!m.groupAdmins.find(
        (member: any) => member.id === jidNormalizedUser(client.user.id),
      );
  }

  m.pushName = msg.pushName;
  const ownerList = JSON.parse(process.env.OWNER || "[]");
  m.isOwner = m.sender
    ? ownerList.includes(m.sender.replace(/\D+/g, ""))
    : false;

  if (m.message) {
    m.type = getContentType(m.message) || Object.keys(m.message)[0];
    m.msg = parseMessage(m.message[m.type]) || m.message[m.type];
    m.mentions = [
      ...(m.msg?.contextInfo?.mentionedJid || []),
      ...(m.msg?.contextInfo?.groupMentions?.map((v: any) => v.groupJid) || []),
    ];
    m.body =
      m.msg?.text ||
      m.msg?.conversation ||
      m.msg?.caption ||
      m.message?.conversation ||
      m.msg?.selectedButtonId ||
      m.msg?.singleSelectReply?.selectedRowId ||
      m.msg?.selectedId ||
      m.msg?.contentText ||
      m.msg?.selectedDisplayText ||
      m.msg?.title ||
      m.msg?.name ||
      "";
    m.prefix = new RegExp("^[°•π÷×¶∆£¢€¥®™+✓=|/~!?@#%^&.©^]", "gi").test(
      m.body,
    )
      ? m.body.match(new RegExp("^[°•π÷×¶∆£¢€¥®™+✓=|/~!?@#%^&.©^]", "gi"))[0]
      : "";
    m.command =
      m.body && m.body.trim().replace(m.prefix, "").trim().split(/ +/).shift();
    m.args =
      m.body
        .trim()
        .replace(new RegExp("^" + escapeRegExp(m.prefix), "i"), "")
        .replace(m.command, "")
        .split(/ +/)
        .filter((a: string) => a) || [];
    m.text = m.args.join(" ").trim();
    m.expiration = m.msg?.contextInfo?.expiration || 0;
    m.timestamps =
      typeof msg.messageTimestamp === "number"
        ? msg.messageTimestamp * 1000
        : m.msg.timestampMs * 1000;
    m.isMedia = !!m.msg?.mimetype || !!m.msg?.thumbnailDirectPath;

    m.isQuoted = false;
    if (m.msg?.contextInfo?.quotedMessage) {
      m.isQuoted = true;
      m.quoted = {};
      m.quoted.message = parseMessage(m.msg?.contextInfo?.quotedMessage);

      if (m.quoted.message) {
        m.quoted.type =
          getContentType(m.quoted.message) || Object.keys(m.quoted.message)[0];
        m.quoted.msg =
          parseMessage(m.quoted.message[m.quoted.type]) ||
          m.quoted.message[m.quoted.type];
        m.quoted.isMedia =
          !!m.quoted.msg?.mimetype || !!m.quoted.msg?.thumbnailDirectPath;
        m.quoted.key = {
          remoteJid: m.msg?.contextInfo?.remoteJid || m.from,
          participant: jidNormalizedUser(m.msg?.contextInfo?.participant),
          fromMe: areJidsSameUser(
            jidNormalizedUser(m.msg?.contextInfo?.participant),
            jidNormalizedUser(client?.user?.id),
          ),
          id: m.msg?.contextInfo?.stanzaId,
        };
        m.quoted.from = /g\.us|status/.test(m.msg?.contextInfo?.remoteJid)
          ? m.quoted.key.participant
          : m.quoted.key.remoteJid;
        m.quoted.fromMe = m.quoted.key.fromMe;
        m.quoted.id = m.msg?.contextInfo?.stanzaId;
        m.quoted.device = /^3A/.test(m.quoted.id)
          ? "ios"
          : /^3E/.test(m.quoted.id)
            ? "web"
            : /^.{21}/.test(m.quoted.id)
              ? "android"
              : /^.{18}/.test(m.quoted.id)
                ? "desktop"
                : "unknown";
        m.quoted.isBot =
          m.quoted.id.startsWith("BAE5") || m.quoted.id.startsWith("HSK");
        m.quoted.isGroup = m.quoted.from.endsWith("@g.us");
        m.quoted.participant =
          jidNormalizedUser(m.msg?.contextInfo?.participant) || false;
        m.quoted.sender = jidNormalizedUser(
          m.msg?.contextInfo?.participant || m.quoted.from,
        );
        m.quoted.mentions = [
          ...(m.quoted.msg?.contextInfo?.mentionedJid || []),
          ...(m.quoted.msg?.contextInfo?.groupMentions?.map(
            (v: any) => v.groupJid,
          ) || []),
        ];
        m.quoted.body =
          m.quoted.msg?.text ||
          m.quoted.msg?.caption ||
          m.quoted?.message?.conversation ||
          m.quoted.msg?.selectedButtonId ||
          m.quoted.msg?.singleSelectReply?.selectedRowId ||
          m.quoted.msg?.selectedId ||
          m.quoted.msg?.contentText ||
          m.quoted.msg?.selectedDisplayText ||
          m.quoted.msg?.title ||
          m.quoted?.msg?.name ||
          "";
        m.quoted.prefix = new RegExp(
          "^[°•π÷×¶∆£¢€¥®™+✓=|/~!?@#%^&.©^]",
          "gi",
        ).test(m.quoted.body)
          ? m.quoted.body.match(
              new RegExp("^[°•π÷×¶∆£¢€¥®™+✓=|/~!?@#%^&.©^]", "gi"),
            )[0]
          : "";
        m.quoted.command =
          m.quoted.body &&
          m.quoted.body.replace(m.quoted.prefix, "").trim().split(/ +/).shift();
        m.quoted.args =
          m.quoted.body
            .trim()
            .replace(new RegExp("^" + escapeRegExp(m.quoted.prefix), "i"), "")
            .replace(m.quoted.command, "")
            .split(/ +/)
            .filter((a: string) => a) || [];
        m.quoted.text = m.quoted.args.join(" ").trim() || m.quoted.body;
        m.quoted.isOwner =
          m.quoted.sender &&
          ownerList.includes(m.quoted.sender.replace(/\D+/g, ""));
      }
    }
  }

  m.reply = async (text: string | object, options: any = {}) => {
    if (typeof text === "string") {
      return await client.sendMessage(
        m.from,
        { text, ...options },
        { quoted: m, ephemeralExpiration: m.expiration, ...options },
      );
    } else if (typeof text === "object" && typeof text !== "string") {
      return client.sendMessage(
        m.from,
        { ...text, ...options },
        { quoted: m, ephemeralExpiration: m.expiration, ...options },
      );
    }
  };

  return m;
}

function parseMessage(content: any) {
  content = extractMessageContent(content);

  if (content && content.viewOnceMessageV2Extension) {
    content = content.viewOnceMessageV2Extension.message;
  }

  if (
    content &&
    content.protocolMessage &&
    content.protocolMessage.type == 14
  ) {
    let type = getContentType(content.protocolMessage);
    if (type) {
      // Check if type is defined
      content = content.protocolMessage[type];
    }
  }

  if (content && content.message) {
    let type = getContentType(content.message);
    if (type) {
      // Check if type is defined
      content = content.message[type];
    }
  }

  return content;
}
