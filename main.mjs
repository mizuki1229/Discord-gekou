import "dotenv/config";
import fs from "fs";
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

/* ===== 設定保存 ===== */
const DATA_FILE = "./data.json";
let data = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE))
  : { admins: {}, authRole: {} };

const save = () =>
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

/* ===== クライアント ===== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

/* ===== 安全返信 ===== */
async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(payload);
    } else {
      return await interaction.reply(payload);
    }
  } catch {}
}

/* ===== コマンド登録 ===== */
const commands = [
  new SlashCommandBuilder().setName("join").setDescription("VCに参加"),
  new SlashCommandBuilder().setName("leave").setDescription("VCから退出"),
  new SlashCommandBuilder()
    .setName("ninnsyou")
    .setDescription("認証ボタンを設置")
    .addRoleOption(o =>
      o.setName("role").setDescription("付与ロール").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("title").setDescription("タイトル").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("description").setDescription("説明文").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("ユーザーをBAN")
    .addUserOption(o =>
      o.setName("user").setDescription("対象").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setadmin")
    .setDescription("BAN実行権限を追加")
    .addUserOption(o =>
      o.setName("user").setDescription("ユーザー").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
  body: commands,
});

/* ===== READY ===== */
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* ===== インタラクション ===== */
client.on("interactionCreate", async interaction => {
  try {
    /* === ボタン === */
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("auth_")) {
        const roleId = interaction.customId.split("_")[1];
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) return;

        if (interaction.member.roles.cache.has(roleId)) {
          return safeReply(interaction, {
            content: "✅ すでに認証済みです",
            ephemeral: true,
          });
        }

        await interaction.member.roles.add(role);
        return safeReply(interaction, {
          content: "✅ 認証しました",
          ephemeral: true,
        });
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    /* === JOIN === */
    if (commandName === "join") {
      const vc = interaction.member.voice.channel;
      if (!vc) {
        return safeReply(interaction, {
          content: "❌ VCに入ってください",
          ephemeral: true,
        });
      }
      await vc.joinable;
      return safeReply(interaction, "✅ VCに参加しました");
    }

    /* === LEAVE === */
    if (commandName === "leave") {
      const vc = interaction.guild.members.me.voice.channel;
      if (vc) vc.leave?.();
      return safeReply(interaction, "👋 VCから退出しました");
    }

    /* === 認証 === */
    if (commandName === "ninnsyou") {
      const role = interaction.options.getRole("role");
      data.authRole[interaction.guildId] = role.id;
      save();

      const embed = new EmbedBuilder()
        .setTitle(interaction.options.getString("title"))
        .setDescription(interaction.options.getString("description"))
        .setColor(0x00ffcc);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`auth_${role.id}`)
          .setLabel("認証")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return safeReply(interaction, { content: "✅ 設置しました", ephemeral: true });
    }

    /* === BAN === */
    if (commandName === "ban") {
      const target = interaction.options.getUser("user");
      const allowed =
        interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
        data.admins[interaction.guildId]?.includes(interaction.user.id);

      if (!allowed) {
        return safeReply(interaction, {
          content: "❌ 権限がありません",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const dm = await interaction.user.createDM();
      const msg = await dm.send(`⚠️ ${target.tag} をBANしますか？\n⭕ / ❌`);

      await msg.react("⭕");
      await msg.react("❌");

      const filter = (r, u) =>
        ["⭕", "❌"].includes(r.emoji.name) && u.id === interaction.user.id;

      const collected = await msg.awaitReactions({ filter, max: 1, time: 60000 });

      if (!collected.size || collected.first().emoji.name === "❌") {
        return safeReply(interaction, "❌ キャンセルしました");
      }

      await interaction.guild.members.ban(target.id);
      return safeReply(interaction, "🔨 BANしました");
    }

    /* === SETADMIN === */
    if (commandName === "setadmin") {
      const user = interaction.options.getUser("user");
      data.admins[interaction.guildId] ??= [];
      data.admins[interaction.guildId].push(user.id);
      save();
      return safeReply(interaction, `✅ ${user.tag} を管理者に設定`);
    }
  } catch (e) {
    console.error(e);
    try {
      await safeReply(interaction, {
        content: "⚠️ エラーが発生しました",
        ephemeral: true,
      });
    } catch {}
  }
});

/* ===== VC自動退出 ===== */
client.on("voiceStateUpdate", () => {
  for (const g of client.guilds.cache.values()) {
    const vc = g.members.me?.voice?.channel;
    if (vc && vc.members.filter(m => !m.user.bot).size === 0) {
      vc.leave?.();
    }
  }
});

/* ===== 起動 ===== */
client.login(process.env.DISCORD_TOKEN);
