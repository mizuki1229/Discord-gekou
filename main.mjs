// ===== 必須 =====
import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

// ===== Bot設定 =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// ===== スラッシュコマンド定義 =====
const commands = [
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("BOTをボイスチャンネルに参加させる"),

  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("BOTをボイスチャンネルから退出させる"),

  new SlashCommandBuilder()
    .setName("ninnsyou")
    .setDescription("認証ボタンを設置")
    .addRoleOption(opt =>
      opt.setName("role")
        .setDescription("付与するロール")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("comment")
        .setDescription("埋め込みに表示する文章")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("ユーザーをBAN")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("BANするユーザー")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setadmin")
    .setDescription("BANを実行できるユーザーを追加")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("許可するユーザー")
        .setRequired(true)
    ),
].map(c => c.toJSON());

// ===== コマンド登録 =====
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("⏳ コマンド登録中...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ コマンド登録完了");
  } catch (err) {
    console.error("❌ コマンド登録失敗", err);
  }
})();

// ===== 簡易DB =====
const banAdmins = new Set();

// ===== 起動 =====
client.once("ready", () => {
  console.log(`🤖 ログイン完了: ${client.user.tag}`);
});

// ===== インタラクション処理 =====
client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // ---- join ----
      if (commandName === "join") {
        const vc = interaction.member.voice.channel;
        if (!vc) {
          return interaction.reply({ content: "VCに参加してから使ってください", ephemeral: true });
        }
        await vc.join();
        return interaction.reply({ content: "VCに参加しました", ephemeral: true });
      }

      // ---- leave ----
      if (commandName === "leave") {
        const vc = interaction.guild.members.me.voice.channel;
        if (!vc) {
          return interaction.reply({ content: "VCに参加していません", ephemeral: true });
        }
        await vc.leave();
        return interaction.reply({ content: "VCから退出しました", ephemeral: true });
      }

      // ---- ninnsyou ----
      if (commandName === "ninnsyou") {
        const role = interaction.options.getRole("role");
        const comment = interaction.options.getString("comment");

        const embed = new EmbedBuilder()
          .setTitle("認証")
          .setDescription(comment)
          .setColor(0x00ffcc);

        const button = new ButtonBuilder()
          .setCustomId(`auth_${role.id}`)
          .setLabel("認証する")
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: "認証ボタンを設置しました", ephemeral: true });
      }

      // ---- ban ----
      if (commandName === "ban") {
        const target = interaction.options.getUser("user");

        const isAdmin =
          interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          banAdmins.has(interaction.user.id);

        if (!isAdmin) {
          return interaction.reply({ content: "権限がありません", ephemeral: true });
        }

        await interaction.guild.members.ban(target.id);
        return interaction.reply({ content: `${target.tag} をBANしました`, ephemeral: true });
      }

      // ---- setadmin ----
      if (commandName === "setadmin") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({ content: "管理者のみ使用可能", ephemeral: true });
        }
        const user = interaction.options.getUser("user");
        banAdmins.add(user.id);
        return interaction.reply({ content: `${user.tag} をBAN管理者に設定しました`, ephemeral: true });
      }
    }

    // ---- ボタン処理 ----
    if (interaction.isButton()) {
      const roleId = interaction.customId.replace("auth_", "");
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) {
        return interaction.reply({ content: "ロールが存在しません", ephemeral: true });
      }

      if (interaction.member.roles.cache.has(roleId)) {
        return interaction.reply({ content: "すでに認証済みです", ephemeral: true });
      }

      await interaction.member.roles.add(role);
      return interaction.reply({ content: "認証完了しました", ephemeral: true });
    }
  } catch (err) {
    console.error("⚠️ エラー", err);
    if (!interaction.replied) {
      interaction.reply({ content: "エラーが発生しました", ephemeral: true }).catch(() => {});
    }
  }
});

// ===== ログイン =====
client.login(process.env.DISCORD_TOKEN);
