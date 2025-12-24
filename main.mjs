import "dotenv/config";
import fs from "fs";
import {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import { joinVoiceChannel, getVoiceConnection } from "@discordjs/voice";

/* ===== 環境変数 ===== */
const { DISCORD_TOKEN, CLIENT_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("❌ .env に DISCORD_TOKEN / CLIENT_ID が必要");
  process.exit(1);
}

/* ===== 永続データ ===== */
const DATA_PATH = "./data/guildConfig.json";
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, "{}");

const loadData = () => JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const saveData = data => fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

let guildData = loadData();

/* ===== Client ===== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

/* ===== 起動 ===== */
client.once("clientReady", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* ===== VC自動退出 ===== */
client.on("voiceStateUpdate", (_, newState) => {
  const conn = getVoiceConnection(newState.guild.id);
  if (!conn) return;
  const channel = newState.guild.channels.cache.get(conn.joinConfig.channelId);
  if (channel && channel.members.filter(m => !m.user.bot).size === 0) {
    conn.destroy();
  }
});

/* ===== メッセージ監視（招待URL） ===== */
client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.match(/discord\.gg|discord\.com\/invite/)) return;

  const gid = message.guild.id;
  const data = guildData[gid];
  if (!data?.inviteRole) return;

  if (message.member.roles.cache.has(data.inviteRole)) return;

  await message.delete().catch(() => {});
  const count = (data.warns?.[message.author.id] ?? 0) + 1;
  data.warns ??= {};
  data.warns[message.author.id] = count;

  saveData(guildData);

  if (count >= 3) {
    try {
      await message.member.timeout(24 * 60 * 60 * 1000, "招待URL違反");
      for (const adminId of data.adminUsers ?? []) {
        client.users.fetch(adminId)
          .then(u => u.send(`🚨 ${message.author.tag} をタイムアウトしました`))
          .catch(() => {});
      }
    } catch {}
  }
});

/* ===== Interaction ===== */
client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const gid = interaction.guild.id;
      guildData[gid] ??= { warns: {}, adminUsers: [] };

      /* /join */
      if (interaction.commandName === "join") {
        const vc = interaction.member.voice.channel;
        if (!vc) return interaction.reply({ content: "VCに入ってね", flags: 64 });
        joinVoiceChannel({
          channelId: vc.id,
          guildId: gid,
          adapterCreator: interaction.guild.voiceAdapterCreator
        });
        return interaction.reply("参加したよ");
      }

      /* /leave */
      if (interaction.commandName === "leave") {
        const conn = getVoiceConnection(gid);
        if (conn) conn.destroy();
        return interaction.reply("退出したよ");
      }

      /* /setadmin */
      if (interaction.commandName === "setadmin") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
          return interaction.reply({ content: "権限なし", flags: 64 });

        const user = interaction.options.getUser("user");
        guildData[gid].adminUsers.push(user.id);
        saveData(guildData);
        return interaction.reply(`✅ ${user.tag} を管理者に設定`);
      }

      /* /ban */
      if (interaction.commandName === "ban") {
        const target = interaction.options.getUser("user");
        const allowed =
          interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          guildData[gid].adminUsers.includes(interaction.user.id);

        if (!allowed)
          return interaction.reply({ content: "権限なし", flags: 64 });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ban_yes").setLabel("⭕").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("ban_no").setLabel("❌").setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ content: "DMを確認してください", flags: 64 });
        const dm = await interaction.user.send({
          content: `${target.tag} をBANしますか？`,
          components: [row]
        });

        const collector = dm.createMessageComponentCollector({ time: 30000, max: 1 });
        collector.on("collect", async i => {
          if (i.customId === "ban_yes") {
            await interaction.guild.members.ban(target.id);
            await i.reply("BANしました");
          } else {
            await i.reply("キャンセルしました");
          }
        });
      }

      /* /ninnsyou */
      if (interaction.commandName === "ninnsyou") {
        const role = interaction.options.getRole("role");
        const embed = new EmbedBuilder()
          .setTitle("認証")
          .setDescription("下のボタンを押して認証してください");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`verify_${role.id}`).setLabel("認証").setStyle(ButtonStyle.Success)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: "設置しました", flags: 64 });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("verify_")) {
        const roleId = interaction.customId.split("_")[1];
        await interaction.member.roles.add(roleId);
        await interaction.reply({ content: "認証済みです", flags: 64 });
      }
    }
  } catch (e) {
    console.error("❌ Interaction Error", e);
  }
});

/* ===== ログイン ===== */
client.login(DISCORD_TOKEN);
